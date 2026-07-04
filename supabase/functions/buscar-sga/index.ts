import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizar(o: any) {
  const v = o?.veiculo || (Array.isArray(o?.veiculos) ? o.veiculos[0] : null) || {};
  return {
    nome: o.nome ?? o.nome_associado ?? o.associado?.nome ?? null,
    cpf: o.cpf ?? o.cpf_cnpj ?? o.documento ?? null,
    codigo_associado: o.codigo_associado ?? v.codigo_associado ?? o.codigo ?? null,
    placa: o.placa ?? v.placa ?? null,
    chassi: o.chassi ?? v.chassi ?? null,
    modelo: o.modelo ?? v.modelo ?? o.modelo_veiculo ?? o.tipo ?? v.tipo ?? o.categoria ?? v.categoria ?? null,
    marca: o.marca ?? v.marca ?? null,
    ano: o.ano_modelo ?? v.ano_modelo ?? o.ano_fabricacao ?? v.ano_fabricacao ?? null,
    situacao: o.situacao ?? o.situacao_associado ?? o.situacao_veiculo ?? v.situacao_veiculo ?? null,
    telefone: o.telefone_celular ?? o.celular ?? o.telefone_comercial ?? o.telefone ?? o.telefone_fixo ?? null,
    email: o.email ?? o.email_auxiliar ?? null,
    cidade: o.cidade ?? o.cidade_associado ?? null,
    estado: o.estado ?? o.uf ?? null,
    _bruto: o,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extrair(j: any): any[] | null {
  if (Array.isArray(j)) return j;
  if (!j || typeof j !== "object") return null;
  for (const k of ["associados", "veiculos", "retorno", "dados", "data", "resultado", "lista"]) {
    if (Array.isArray(j[k])) return j[k];
  }
  // resposta de objeto único (um associado/veículo)
  if (j.codigo_associado || j.placa || j.cpf || j.nome_associado) return [j];
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buscarNaAssociacao(base: string, H: Record<string, string>, tipo: string, termo: string): Promise<any[]> {
  const digits = termo.replace(/\D/g, "");
  const up = termo.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const candidatos: Record<string, { m: "GET" | "POST"; p: string; b?: unknown }[]> = {
    cpf: [
      { m: "GET", p: `/associado/buscar/${digits}` },
      { m: "GET", p: `/associado/buscar-por-permissao/buscar/${digits}` },
    ],
    nome: [
      { m: "POST", p: `/localizar/associado`, b: { nome: termo } },
      { m: "POST", p: `/associado/listar`, b: { nome: termo } },
    ],
    placa: [
      { m: "GET", p: `/veiculo/buscar/${up}/placa` },
    ],
    chassi: [
      { m: "GET", p: `/veiculo/buscar/${up}/chassi` },
    ],
  };
  for (const cand of candidatos[tipo] || []) {
    try {
      const r = await fetch(`${base}${cand.p}`, {
        method: cand.m,
        headers: H,
        body: cand.m === "POST" ? JSON.stringify(cand.b ?? {}) : undefined,
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.error) continue;
      const arr = extrair(j);
      if (arr && arr.length) return arr.map(normalizar);
    } catch (_e) { /* tenta o proximo candidato */ }
  }
  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { tipo, termo } = await req.json().catch(() => ({}));
    if (!tipo || !termo || !["cpf", "nome", "placa", "chassi"].includes(tipo)) {
      return json({ success: false, message: "Envie tipo (cpf|nome|placa|chassi) e termo." }, 400);
    }
    const termoLimpo = String(termo).trim();
    if (termoLimpo.length < 3) return json({ success: false, message: "Termo muito curto." }, 400);

    // Associações com API configurada
    const { data: creds } = await supabase
      .from("hinova_credenciais")
      .select("corretora_id, api_token, api_base_url, hinova_user, hinova_pass, corretoras(nome)")
      .not("api_token", "is", null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resultados: any[] = [];
    const associacoesBuscadas: string[] = [];
    for (const c of creds || []) {
      if (!c.api_token || !c.hinova_user || !c.hinova_pass) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nome = (c as any).corretoras?.nome || c.corretora_id;
      const base = (c.api_base_url || "https://api.hinova.com.br/api/sga/v2").replace(/\/$/, "");
      let tk: string | undefined;
      try {
        const a = await fetch(`${base}/usuario/autenticar`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.api_token}` },
          body: JSON.stringify({ usuario: c.hinova_user, senha: c.hinova_pass }),
        });
        tk = (await a.json().catch(() => ({})))?.token_usuario;
      } catch (_e) { /* pula associacao */ }
      if (!tk) continue;
      associacoesBuscadas.push(nome);
      const H = { "Content-Type": "application/json", Authorization: `Bearer ${tk}` };
      const achados = await buscarNaAssociacao(base, H, tipo, termoLimpo);
      for (const d of achados) resultados.push({ associacao: nome, corretora_id: c.corretora_id, ...d });
    }

    return json({ success: true, tipo, termo: termoLimpo, total: resultados.length, associacoes_buscadas: associacoesBuscadas, resultados });
  } catch (e) {
    return json({ success: false, message: e instanceof Error ? e.message : "Erro desconhecido" }, 200);
  }
});
