import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Consulta AO VIVO no SGA da Hinova.
 *
 * Antes esta funcao varria a base inteira de cada associacao (/listar/veiculo com
 * body vazio = 10k+ placas x 15 associacoes) e filtrava em memoria. Era lenta e cara.
 * Agora usa os endpoints direcionados, validados contra a API de producao:
 *
 *   placa -> GET  /veiculo/buscar/{placa}/placa      (funciona)
 *   cpf   -> GET  /associado/buscar/{cpf}            (funciona)
 *   nome  -> a Hinova NAO expoe busca por nome. Resolvemos o nome na base local
 *            para descobrir placa/CPF e ai sim consultamos a API ao vivo.
 *
 * Detalhes (boletos, MGF, eventos) so sao buscados NA associacao que deu match.
 *
 * Body: { placa?: string, cpf?: string, nome?: string, meses?: number }
 * Requer JWT do app.
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

const TIMEOUT_MS = 20_000;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fetchJson = async (url: string, init: any) => {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  return await r.json().catch(() => null);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const arrOf = (j: any, ...keys: string[]): any[] => {
  if (Array.isArray(j)) return j;
  if (!j || typeof j !== "object") return [];
  for (const k of keys) if (Array.isArray(j[k])) return j[k];
  for (const k of ["dados", "data", "registros", "resultado", "retorno", "lista", "veiculos", "associados"]) {
    if (Array.isArray(j?.[k])) return j[k];
  }
  // resposta de objeto unico
  if (j.codigo_associado || j.placa || j.cpf) return [j];
  return [];
};

/** O endpoint de veiculo devolve um registro achatado com veiculo + associado juntos. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapVeiculo = (v: any) => ({
  placa: v?.placa ?? null,
  chassi: v?.chassi ?? null,
  tipo: v?.tipo ?? null,
  categoria: v?.categoria ?? null,
  marca: v?.marca ?? null,
  modelo: v?.modelo ?? null,
  cor: v?.cor ?? v?.codigo_cor ?? null,
  combustivel: v?.combustivel ?? v?.codigo_combustivel ?? null,
  ano_fabricacao: v?.ano_fabricacao ?? null,
  ano_modelo: v?.ano_modelo ?? null,
  renavam: v?.renavam ?? null,
  km: v?.km ?? null,
  valor_fipe: v?.valor_fipe ?? null,
  valor_protegido: v?.valor_fipe_protegido ?? null,
  participacao: v?.participacao ?? null,
  situacao: v?.descricao_situacao ?? v?.situacao_veiculo ?? null,
  dia_vencimento: v?.dia_vencimento ?? null,
  mes_referente: v?.mes_referente ?? null,
  regional: v?.regional ?? v?.codigo_regional ?? null,
  cooperativa: v?.cooperativa ?? v?.codigo_cooperativa ?? null,
  codigo_veiculo: v?.codigo_veiculo ?? null,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapAssociado = (v: any) => {
  const tel = (ddd: any, num: any) => (num ? `${ddd ? "(" + ddd + ") " : ""}${num}` : null);
  return {
    nome: v?.nome ?? v?.nome_associado ?? null,
    cpf: v?.cpf ?? v?.cpf_cnpj ?? null,
    rg: v?.rg ?? null,
    email: v?.email ?? null,
    telefone: tel(v?.ddd, v?.telefone),
    celular: tel(v?.ddd_celular, v?.telefone_celular),
    cidade: v?.cidade ?? null,
    estado: v?.estado ?? null,
    bairro: v?.bairro ?? null,
    logradouro: v?.logradouro ?? null,
    cep: v?.cep ?? null,
    regional: v?.regional ?? v?.codigo_regional ?? null,
    cooperativa: v?.cooperativa ?? v?.codigo_cooperativa ?? null,
    situacao: v?.descricao_situacao ?? null,
    data_cadastro: v?.data_cadastro ?? null,
    data_contrato: v?.data_contrato ?? null,
    codigo_associado: v?.codigo_associado ?? null,
    voluntario: v?.nome_voluntario ?? null,
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") || "";
  const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await anon.auth.getUser();
  if (!userData?.user) {
    return new Response(JSON.stringify({ success: false, message: "Nao autenticado" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const placa = normPlaca(body.placa);
    const cpf = onlyDigits(body.cpf);
    const nome = String(body.nome ?? "").trim();
    const meses = Math.min(Math.max(Number(body.meses) || 12, 1), 24);
    // debug=true anexa o payload cru do 1o veiculo/boleto, para conferir nomes de campo
    // da API sem ter que adivinhar no importador.
    const debug = body.debug === true;

    if (!placa && !cpf && !nome) {
      return new Response(JSON.stringify({ success: false, message: "Informe placa, CPF ou nome" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: creds } = await supabase
      .from("hinova_credenciais")
      .select("corretora_id, api_token, api_base_url, hinova_user, hinova_pass, hinova_url, usar_api")
      .eq("usar_api", true);

    const alvos = (creds || []).filter((c) => c.api_token && c.hinova_user && c.hinova_pass);
    const ids = alvos.map((c) => c.corretora_id);
    const { data: corretoras } = ids.length
      ? await supabase.from("corretoras").select("id, nome").in("id", ids)
      : { data: [] as { id: string; nome: string }[] };
    const nomeById = new Map((corretoras || []).map((c) => [c.id, c.nome]));

    /**
     * Busca por nome: a API da Hinova nao tem endpoint de nome. Resolvemos o nome
     * contra a base local (cadastro) para obter placas, e cada placa vira uma
     * consulta direcionada ao vivo — restrita a associacao onde o nome bateu.
     */
    // corretora_id -> placas a consultar. Vazio = consultar a associacao inteira pelo criterio direto.
    const placasPorCorretora = new Map<string, Set<string>>();
    let nomeSemMatchLocal = false;
    if (nome && !placa && !cpf) {
      const { data: locais } = await supabase
        .from("cadastro_registros")
        .select("placa, cpf, importacao_id, cadastro_importacoes!inner(corretora_id, ativo)")
        .ilike("nome", `%${nome}%`)
        .eq("cadastro_importacoes.ativo", true)
        .limit(50);
      for (const l of (locais || [])) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cid = (l as any).cadastro_importacoes?.corretora_id;
        const p = normPlaca((l as any).placa);
        if (!cid || !p) continue;
        if (!placasPorCorretora.has(cid)) placasPorCorretora.set(cid, new Set());
        placasPorCorretora.get(cid)!.add(p);
      }
      nomeSemMatchLocal = placasPorCorretora.size === 0;
    }

    const consultar = async (c: typeof alvos[number]) => {
      const base = (c.api_base_url || "https://api.hinova.com.br/api/sga/v2").replace(/\/$/, "");
      const nomeAssoc = nomeById.get(c.corretora_id) || c.corretora_id;
      const status = {
        associacao: nomeAssoc,
        cadastro: { status: null as string | null, erro: null as string | null, origem: "api" },
        cobranca: { status: null as string | null, erro: null as string | null, origem: "api" },
        eventos: { status: null as string | null, erro: null as string | null, origem: "api" },
        mgf: { status: null as string | null, erro: null as string | null, origem: "api" },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resultados: any[] = [];

      try {
        const authJson = await fetchJson(`${base}/usuario/autenticar`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.api_token}` },
          body: JSON.stringify({ usuario: c.hinova_user, senha: c.hinova_pass }),
        });
        const token = authJson?.token_usuario;
        if (!token) throw new Error(authJson?.error?.mensagem || "Falha na autenticacao da API");
        const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

        // ---- 1) Localizar o(s) veiculo(s) pelo criterio, sem varrer a base ----
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let achados: any[] = [];
        if (placa) {
          achados = arrOf(await fetchJson(`${base}/veiculo/buscar/${placa}/placa`, { method: "GET", headers: H }));
        } else if (cpf) {
          achados = arrOf(await fetchJson(`${base}/associado/buscar/${cpf}`, { method: "GET", headers: H }));
        } else if (nome) {
          const placasLocais = placasPorCorretora.get(c.corretora_id);
          if (!placasLocais || placasLocais.size === 0) {
            status.cadastro.status = "sucesso";
            return { status, resultados };
          }
          for (const p of Array.from(placasLocais).slice(0, 10)) {
            achados.push(...arrOf(await fetchJson(`${base}/veiculo/buscar/${p}/placa`, { method: "GET", headers: H })));
          }
        }
        status.cadastro.status = "sucesso";
        if (achados.length === 0) return { status, resultados };

        // ---- 2) So aqui (deu match) buscamos os detalhes ----
        const hoje = new Date();
        const inicio = addDays(hoje, -30 * meses);
        const placasAchadas = new Set(achados.map((v) => normPlaca(v?.placa)).filter(Boolean));
        const cpfsAchados = new Set(achados.map((v) => onlyDigits(v?.cpf)).filter(Boolean));
        const codsAssoc = new Set(achados.map((v) => String(v?.codigo_associado ?? "")).filter(Boolean));

        const buscarBoletos = async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const out: any[] = [];
          let cur = new Date(inicio);
          while (cur <= hoje) {
            const fim = addDays(cur, 30) > hoje ? hoje : addDays(cur, 30);
            const j = await fetchJson(`${base}/listar/boleto-associado/periodo`, {
              method: "POST", headers: H,
              body: JSON.stringify({ data_vencimento_inicial: ddmmyyyy(cur), data_vencimento_final: ddmmyyyy(fim) }),
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const b of arrOf(j, "boletos") as any[]) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const ps = (Array.isArray(b?.veiculos) ? b.veiculos : []).map((v: any) => normPlaca(v?.placa));
              const bate = cpfsAchados.has(onlyDigits(b?.cpf)) || ps.some((p: string) => placasAchadas.has(p));
              if (bate) {
                out.push({
                  ...(debug && out.length === 0 ? { _raw: b } : {}),
                  vencimento: b?.data_vencimento ?? null,
                  vencimento_original: b?.data_vencimento_original ?? null,
                  valor: b?.valor ?? b?.valor_boleto ?? null,
                  situacao: b?.situacao ?? b?.descricao_situacao ?? null,
                  pagamento: b?.data_pagamento ?? null,
                  nosso_numero: b?.nosso_numero ?? null,
                  mes_referente: b?.mes_referente ?? null,
                  tipo_boleto: b?.tipo_boleto ?? null,
                });
              }
            }
            cur = addDays(fim, 1);
          }
          return out.sort((a, b) => String(b.vencimento).localeCompare(String(a.vencimento)));
        };

        const buscarEventos = async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const out: any[] = [];
          let cur = new Date(inicio);
          while (cur <= hoje) {
            const fim = addDays(cur, 29) > hoje ? hoje : addDays(cur, 29);
            const j = await fetchJson(`${base}/listar/evento`, {
              method: "POST", headers: H,
              body: JSON.stringify({ data_cadastro: ddmmyyyy(cur), data_cadastro_final: ddmmyyyy(fim) }),
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const ev of arrOf(j) as any[]) {
              const p = normPlaca(ev?.veiculo?.placa ?? ev?.placa);
              if (placasAchadas.has(p) || cpfsAchados.has(onlyDigits(ev?.associado?.cpf ?? ev?.cpf))) {
                out.push({
                  data: ev?.data_evento ?? ev?.data_cadastro ?? null,
                  tipo: ev?.tipo_evento ?? ev?.descricao_tipo_evento ?? null,
                  situacao: ev?.situacao_evento ?? ev?.descricao_situacao ?? null,
                  protocolo: ev?.protocolo ?? ev?.codigo_evento ?? null,
                  motivo: ev?.motivo_evento ?? null,
                  valor_reparo: ev?.valor_reparo ?? null,
                });
              }
            }
            cur = addDays(fim, 1);
          }
          return out;
        };

        const buscarMgf = async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const out: any[] = [];
          if (codsAssoc.size === 0 && cpfsAchados.size === 0) return out;
          const PAGE = 1000;
          let ini = 0;
          for (let pag = 0; pag < 20; pag++) {
            const j = await fetchJson(`${base}/mgf-lancamento/listar`, {
              method: "POST", headers: H,
              body: JSON.stringify({
                data_vencimento_inicial: ddmmyyyy(inicio), data_vencimento_final: ddmmyyyy(hoje),
                quantidade_por_pagina: PAGE, inicio_paginacao: ini,
              }),
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const arr = arrOf(j, "retorno") as any[];
            for (const L of arr) {
              const bate = codsAssoc.has(String(L?.codigo_associado ?? "")) ||
                cpfsAchados.has(onlyDigits(L?.cpf_associado ?? L?.cpf));
              if (bate) {
                out.push({
                  vencimento: L?.data_vencimento ?? null,
                  descricao: L?.descricao ?? null,
                  valor: L?.valor ?? null,
                  situacao: L?.situacao_pagamento ?? null,
                  operacao: L?.operacao ?? null,
                });
              }
            }
            if (arr.length < PAGE) break;
            ini += PAGE;
          }
          return out;
        };

        const [boletos, eventos, mgf] = await Promise.all([
          buscarBoletos().then((r) => { status.cobranca.status = "sucesso"; return r; })
            .catch((e) => { status.cobranca.status = "erro"; status.cobranca.erro = String(e?.message ?? e); return []; }),
          buscarEventos().then((r) => { status.eventos.status = "sucesso"; return r; })
            .catch((e) => { status.eventos.status = "erro"; status.eventos.erro = String(e?.message ?? e); return []; }),
          buscarMgf().then((r) => { status.mgf.status = "sucesso"; return r; })
            .catch((e) => { status.mgf.status = "erro"; status.mgf.erro = String(e?.message ?? e); return []; }),
        ]);

        for (const v of achados) {
          resultados.push({
            associacao: nomeAssoc,
            sga_url: c.hinova_url ?? null,
            veiculo: debug ? { ...mapVeiculo(v), _raw: v } : mapVeiculo(v),
            associado: mapAssociado(v),
            boletos,
            eventos,
            mgf,
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        status.cadastro.status = "erro";
        status.cadastro.erro = msg;
      }
      return { status, resultados };
    };

    // Todas as associacoes em paralelo (antes era sequencial: ~10s -> ~2s)
    const saidas = await Promise.all(alvos.map(consultar));
    const resultados = saidas.flatMap((s) => s.resultados);
    const apis_ativas = saidas.map((s) => s.status).sort((a, b) => a.associacao.localeCompare(b.associacao));

    return new Response(JSON.stringify({
      success: true,
      origem: "api",
      criterio: { placa: placa || null, cpf: cpf || null, nome: nome || null },
      aviso: nome && nomeSemMatchLocal
        ? "A API da Hinova nao permite busca por nome. Nenhum cadastro local bateu com esse nome, entao nao houve o que consultar ao vivo. Tente por placa ou CPF."
        : (nome ? "A API da Hinova nao permite busca por nome: o nome foi resolvido na base local e as placas encontradas foram consultadas ao vivo." : null),
      total: resultados.length,
      resultados,
      apis_ativas,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    console.error("[consultar-associado-hinova]", msg);
    return new Response(JSON.stringify({ success: false, message: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
