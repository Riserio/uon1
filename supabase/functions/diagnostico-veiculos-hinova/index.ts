import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * DIAGNOSTICO — SO LE, NAO GRAVA NADA.
 *
 * Existe para responder duas perguntas antes de mexer no importador:
 *
 * 1) O filtro codigo_situacao de /listar/veiculo funciona?
 *    O importador hoje busca so codigo_situacao=1 (ATIVO). O comentario no
 *    codigo diz que situacao=4 (INADIMPLENTE) devolveu ~4955 placas — quase a
 *    base inteira — em vez das ~200 esperadas. A hipotese e que a API IGNORE o
 *    filtro e devolva sempre tudo. Aqui medimos a sobreposicao entre as placas
 *    de cada situacao e as da situacao 1: se for ~100%, o filtro e ignorado e
 *    importar outras situacoes so duplicaria a base.
 *
 * 2) Existe endpoint de alteracao de situacao (para os 72 cancelamentos de
 *    jun/26 que o SGA reporta)? Sondamos candidatos e reportamos quais
 *    respondem, sem assumir nenhum.
 *
 * Body: { corretora_id: uuid, situacoes?: string[], data_inicio?: "DD/MM/AAAA", data_fim?: "DD/MM/AAAA" }
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normPlaca = (v: any) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const extrairArray = (j: any): any[] | null => {
  if (Array.isArray(j)) return j;
  if (!j || typeof j !== "object") return null;
  for (const k of ["veiculos", "associados", "dados", "data", "registros", "resultado", "lista"]) {
    if (Array.isArray(j[k])) return j[k];
  }
  return null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: userData } = await anon.auth.getUser();
  if (!userData?.user) {
    return new Response(JSON.stringify({ success: false, message: "Nao autenticado" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    const corretoraId = String(body.corretora_id ?? "");
    if (!corretoraId) throw new Error("Informe corretora_id");
    const situacoes: string[] = Array.isArray(body.situacoes) && body.situacoes.length
      ? body.situacoes.map(String) : ["1", "2", "4", "6"];

    const { data: cred } = await supabase
      .from("hinova_credenciais")
      .select("api_token, api_base_url, hinova_user, hinova_pass")
      .eq("corretora_id", corretoraId).maybeSingle();
    if (!cred?.api_token) throw new Error("Credenciais da API nao encontradas");

    const base = (cred.api_base_url || "https://api.hinova.com.br/api/sga/v2").replace(/\/$/, "");
    const authJson = await (await fetch(`${base}/usuario/autenticar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cred.api_token}` },
      body: JSON.stringify({ usuario: cred.hinova_user, senha: cred.hinova_pass }),
    })).json().catch(() => ({}));
    const token = authJson?.token_usuario;
    if (!token) throw new Error(authJson?.error?.mensagem || "Falha na autenticacao");
    const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    // ---- 1) Uma pagina por situacao, so para medir ----
    const porSituacao: Record<string, unknown> = {};
    const placasPorSit: Record<string, Set<string>> = {};
    for (const cod of situacoes) {
      const r = await fetch(`${base}/listar/veiculo`, {
        method: "POST", headers: H,
        body: JSON.stringify({ codigo_situacao: cod, pagina: "1" }),
      });
      const j = await r.json().catch(() => null);
      const arr = extrairArray(j) ?? [];
      const set = new Set(arr.map((v) => normPlaca((v as Record<string, unknown>)?.placa)).filter(Boolean));
      placasPorSit[cod] = set;
      porSituacao[cod] = {
        http: r.status,
        total_veiculos_informado: (j as Record<string, unknown>)?.total_veiculos ?? null,
        numero_paginas: (j as Record<string, unknown>)?.numero_paginas ?? null,
        registros_na_pagina1: arr.length,
        placas_distintas_pagina1: set.size,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        situacoes_encontradas: Array.from(new Set(arr.map((v: any) => v?.descricao_situacao ?? v?.situacao_veiculo ?? null).filter(Boolean))).slice(0, 8),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exemplo: arr.slice(0, 3).map((v: any) => ({ placa: v?.placa, situacao: v?.descricao_situacao, codigo_situacao: v?.codigo_situacao })),
      };
    }

    // Sobreposicao com a situacao 1: se ~100%, a API esta ignorando o filtro.
    const ref = placasPorSit["1"];
    const sobreposicao: Record<string, string> = {};
    if (ref && ref.size) {
      for (const cod of situacoes) {
        if (cod === "1") continue;
        const s = placasPorSit[cod];
        if (!s || !s.size) { sobreposicao[cod] = "sem dados"; continue; }
        let inter = 0;
        for (const p of s) if (ref.has(p)) inter++;
        sobreposicao[cod] = `${((inter / s.size) * 100).toFixed(1)}% das placas da situacao ${cod} tambem aparecem na situacao 1`;
      }
    }

    // ---- 2) Sondagem de endpoints de alteracao de situacao ----
    const di = body.data_inicio ?? "01/06/2026";
    const df = body.data_fim ?? "30/06/2026";
    const candidatos: { m: "GET" | "POST"; p: string; b?: unknown }[] = [
      { m: "POST", p: "/listar/veiculo/alteracao-situacao", b: { data_inicial: di, data_final: df } },
      { m: "POST", p: "/listar/alteracao-situacao", b: { data_inicial: di, data_final: df } },
      { m: "POST", p: "/veiculo/alteracao-situacao", b: { data_inicial: di, data_final: df } },
      { m: "POST", p: "/listar/veiculo/historico-situacao", b: { data_inicial: di, data_final: df } },
      { m: "POST", p: "/listar/veiculo/cancelamento", b: { data_inicial: di, data_final: df } },
    ];
    const sondagem: Record<string, unknown> = {};
    for (const c of candidatos) {
      try {
        const r = await fetch(`${base}${c.p}`, {
          method: c.m, headers: H,
          body: c.m === "POST" ? JSON.stringify(c.b ?? {}) : undefined,
          signal: AbortSignal.timeout(15_000),
        });
        const t = await r.text();
        let n: number | null = null;
        try { const j = JSON.parse(t); n = (extrairArray(j) ?? []).length; } catch { /* nao e json */ }
        sondagem[c.p] = { http: r.status, registros: n, amostra: t.slice(0, 160) };
      } catch (e) {
        sondagem[c.p] = { erro: e instanceof Error ? e.message : String(e) };
      }
    }

    return new Response(JSON.stringify({
      success: true,
      aviso: "Diagnostico somente leitura — nada foi gravado.",
      por_situacao: porSituacao,
      sobreposicao_com_situacao_1: sobreposicao,
      endpoints_alteracao_situacao: sondagem,
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
