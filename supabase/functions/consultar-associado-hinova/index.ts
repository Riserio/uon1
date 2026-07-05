import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Consulta on-demand: dado uma placa e/ou CPF, percorre TODAS as associações
 * com API Hinova ativa e devolve um "dossiê" agregado em tempo real (sem persistir):
 *   - Cadastro do veículo/associado (regional, cooperativa, situação, valores)
 *   - Boletos / cobrança
 *   - Lançamentos MGF (financeiro)
 *   - Eventos SGA / vistorias
 *
 * Body: { placa?: string, cpf?: string }
 * Requer JWT (usuário autenticado do app).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onlyDigits = (v: any) => String(v ?? "").replace(/\D/g, "");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normPlaca = (v: any) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const ddmmyyyy = (d: Date) => {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const arrOf = (j: any, ...keys: string[]): any[] => {
  if (Array.isArray(j)) return j;
  if (!j || typeof j !== "object") return [];
  for (const k of keys) if (Array.isArray(j[k])) return j[k];
  for (const k of ["dados", "data", "registros", "resultado", "retorno", "lista"]) {
    if (Array.isArray(j?.[k])) return j[k];
  }
  return [];
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Validate caller JWT
  const authHeader = req.headers.get("Authorization") || "";
  const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await anon.auth.getUser();
  if (!userData?.user) {
    return new Response(JSON.stringify({ success: false, message: "Não autenticado" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const placa = normPlaca(body.placa);
    const cpf = onlyDigits(body.cpf);
    if (!placa && !cpf) {
      return new Response(JSON.stringify({ success: false, message: "Informe placa ou CPF" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Todas as associações com API ativa
    const { data: creds } = await supabase
      .from("hinova_credenciais")
      .select("corretora_id, api_token, api_base_url, hinova_user, hinova_pass, usar_api")
      .eq("usar_api", true);

    const alvos = (creds || []).filter((c) => c.api_token && c.hinova_user && c.hinova_pass);

    // Nomes das associações para exibir no resultado
    const ids = alvos.map((c) => c.corretora_id);
    const { data: corretoras } = ids.length
      ? await supabase.from("corretoras").select("id, nome").in("id", ids)
      : { data: [] as { id: string; nome: string }[] };
    const nomeById = new Map((corretoras || []).map((c) => [c.id, c.nome]));

    // Consulta cada associação em paralelo (com limite implícito de conexões do runtime)
    const dossies = await Promise.all(alvos.map(async (c) => {
      const base = (c.api_base_url || "https://api.hinova.com.br/api/sga/v2").replace(/\/$/, "");
      const out = {
        corretora_id: c.corretora_id,
        corretora_nome: nomeById.get(c.corretora_id) || null,
        encontrado: false,
        erro: null as string | null,
        cadastro: [] as unknown[],
        associado: [] as unknown[],
        boletos: [] as unknown[],
        mgf: [] as unknown[],
        eventos: [] as unknown[],
      };
      try {
        // 1) auth
        const authRes = await fetch(`${base}/usuario/autenticar`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.api_token}` },
          body: JSON.stringify({ usuario: c.hinova_user, senha: c.hinova_pass }),
        });
        const authJson = await authRes.json().catch(() => ({}));
        const token = authJson?.token_usuario;
        if (!token) throw new Error(authJson?.error?.mensagem || "Falha auth API");
        const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

        // 2) Cadastro (veículos) — filtra por placa/cpf
        const vr = await fetch(`${base}/listar/veiculo`, { method: "POST", headers: H, body: JSON.stringify({}) });
        const vj = await vr.json().catch(() => null);
        const veics = arrOf(vj, "veiculos", "associados");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cadastro = veics.filter((v: any) => {
          const p = normPlaca(v?.placa ?? v?.veiculo?.placa);
          const cp = onlyDigits(v?.cpf ?? v?.cpf_cnpj ?? v?.documento ?? v?.associado?.cpf);
          return (placa && p === placa) || (cpf && cp === cpf);
        });
        out.cadastro = cadastro;

        // 3) Associado (endereço/situação)
        try {
          const ar = await fetch(`${base}/listar/associado`, { method: "POST", headers: H, body: JSON.stringify({}) });
          const aj = await ar.json().catch(() => null);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          out.associado = arrOf(aj, "associados").filter((a: any) => {
            const cp = onlyDigits(a?.cpf ?? a?.cpf_cnpj);
            if (cpf && cp === cpf) return true;
            // se busca por placa, aceita associado dos veículos encontrados
            const cod = String(a?.codigo_associado ?? a?.codigo ?? "");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return placa && cadastro.some((v: any) => String(v?.codigo_associado ?? "") === cod);
          });
        } catch (_e) { /* opcional */ }

        // 4) Boletos (últimos 18 meses, janelas de 30 dias)
        try {
          const hoje = new Date();
          const inicio = addDays(hoje, -540);
          const boletos: unknown[] = [];
          let cur = new Date(inicio), jan = 0;
          while (cur <= hoje && jan < 20) {
            const fimJ = addDays(cur, 30) > hoje ? hoje : addDays(cur, 30);
            jan++;
            const r = await fetch(`${base}/listar/boleto-associado/periodo`, {
              method: "POST", headers: H,
              body: JSON.stringify({ data_vencimento_inicial: ddmmyyyy(cur), data_vencimento_final: ddmmyyyy(fimJ) }),
            });
            const j = await r.json().catch(() => null);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const bs = arrOf(j, "boletos") as any[];
            for (const b of bs) {
              const cp = onlyDigits(b?.cpf);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const placas = (Array.isArray(b?.veiculos) ? b.veiculos : []).map((v: any) => normPlaca(v?.placa));
              if ((cpf && cp === cpf) || (placa && placas.includes(placa))) boletos.push(b);
            }
            cur = addDays(fimJ, 1);
          }
          out.boletos = boletos;
        } catch (_e) { /* opcional */ }

        // 5) MGF (lançamentos financeiros) — 18 meses paginado
        try {
          const hoje = new Date();
          const inicio = addDays(hoje, -540);
          const lancs: unknown[] = [];
          const PAGE = 1000;
          let ini = 0, pag = 0;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const codsAssoc = new Set(cadastro.map((v: any) => String(v?.codigo_associado ?? "")).filter(Boolean));
          while (pag < 20) {
            pag++;
            const r = await fetch(`${base}/mgf-lancamento/listar`, {
              method: "POST", headers: H,
              body: JSON.stringify({ data_vencimento_inicial: ddmmyyyy(inicio), data_vencimento_final: ddmmyyyy(hoje), quantidade_por_pagina: PAGE, inicio_paginacao: ini }),
            });
            const j = await r.json().catch(() => null);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const arr = arrOf(j, "retorno") as any[];
            for (const L of arr) {
              const cp = onlyDigits(L?.cpf_associado ?? L?.cpf);
              const cod = String(L?.codigo_associado ?? "");
              if ((cpf && cp === cpf) || (cod && codsAssoc.has(cod))) lancs.push(L);
            }
            if (arr.length < PAGE) break;
            ini += PAGE;
          }
          out.mgf = lancs;
        } catch (_e) { /* opcional */ }

        // 6) Eventos SGA / vistorias — 18 meses em janelas de 30 dias
        try {
          const hoje = new Date();
          const inicio = addDays(hoje, -540);
          const eventos: unknown[] = [];
          let cur = new Date(inicio), jan = 0;
          while (cur <= hoje && jan < 20) {
            const fimJ = addDays(cur, 29) > hoje ? hoje : addDays(cur, 29);
            jan++;
            const r = await fetch(`${base}/listar/evento`, {
              method: "POST", headers: H,
              body: JSON.stringify({ data_cadastro: ddmmyyyy(cur), data_cadastro_final: ddmmyyyy(fimJ) }),
            });
            const j = await r.json().catch(() => null);
            const arr = Array.isArray(j) ? j : arrOf(j);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const ev of arr as any[]) {
              const p = normPlaca(ev?.veiculo?.placa);
              const cp = onlyDigits(ev?.associado?.cpf ?? ev?.cpf);
              if ((placa && p === placa) || (cpf && cp === cpf)) eventos.push(ev);
            }
            cur = addDays(fimJ, 1);
          }
          out.eventos = eventos;
        } catch (_e) { /* opcional */ }

        out.encontrado = (out.cadastro.length + out.associado.length + out.boletos.length + out.mgf.length + out.eventos.length) > 0;
      } catch (e) {
        out.erro = e instanceof Error ? e.message : String(e);
      }
      return out;
    }));

    const encontrados = dossies.filter((d) => d.encontrado);
    return new Response(JSON.stringify({
      success: true,
      criterio: { placa: placa || null, cpf: cpf || null },
      associacoes_consultadas: alvos.length,
      associacoes_com_dados: encontrados.length,
      dossies,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    console.error("[consultar-associado-hinova]", msg);
    return new Response(JSON.stringify({ success: false, message: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});