import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Deriva faturamento_operacional e total_recebido por mês a partir dos boletos
// já sincronizados da Hinova (cobranca_boletos_ativos) e grava em pid_operacional.
// Assim esses KPIs ficam tão frescos quanto a base de placas — sem planilha.
//
// Definições:
//   faturamento_operacional[ano/mes] = soma do VALOR dos boletos com vencimento
//     naquele mês (competência = data_vencimento).
//   total_recebido[ano/mes]          = soma do VALOR dos boletos PAGOS naquele mês
//     (competência = data_pagamento; considera pago quem tem data_pagamento
//      ou situação BAIXADO/PAGO/LIQUIDADO).
//
// Só mexe nesses dois campos do pid_operacional (+ updated_at); os demais
// (placas_ativas, total_associados, sinistralidade manual etc.) são preservados.

const normSit = (s?: string | null): string =>
  (s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const isPago = (situacao?: string | null, dataPagamento?: string | null): boolean => {
  if (dataPagamento) return true;
  const s = normSit(situacao);
  return /BAIXAD|PAGO|LIQUID|QUITAD/.test(s);
};

// mês de referência YYYY-MM a partir de uma data ISO/BR; null se inválida
const ym = (d?: string | null): string | null => {
  if (!d) return null;
  const iso = String(d).trim();
  let m = iso.match(/^(\d{4})-(\d{2})/); // 2026-07-...
  if (m) return `${m[1]}-${m[2]}`;
  m = iso.match(/^(\d{2})\/(\d{2})\/(\d{4})/); // 15/07/2026
  if (m) return `${m[3]}-${m[2]}`;
  return null;
};

const toNumber = (v: unknown): number => {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return isFinite(n) ? n : 0;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const corretora_id: string | undefined = body?.corretora_id;
    if (!corretora_id) {
      return new Response(JSON.stringify({ success: false, message: "corretora_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Lê todos os boletos da associação, paginado.
    const fat: Record<string, number> = {};
    const rec: Record<string, number> = {};
    const pageSize = 1000;
    let from = 0;
    let lidos = 0;

    while (true) {
      const { data, error } = await supabase
        .from("cobranca_boletos_ativos")
        .select("valor, data_vencimento, data_pagamento, situacao")
        .eq("corretora_id", corretora_id)
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;

      for (const b of data) {
        const valor = toNumber((b as { valor?: unknown }).valor);
        if (valor <= 0) continue;
        const mesVenc = ym((b as { data_vencimento?: string | null }).data_vencimento);
        if (mesVenc) fat[mesVenc] = (fat[mesVenc] || 0) + valor;
        const pago = isPago((b as { situacao?: string | null }).situacao, (b as { data_pagamento?: string | null }).data_pagamento);
        if (pago) {
          const mesPag = ym((b as { data_pagamento?: string | null }).data_pagamento) || mesVenc;
          if (mesPag) rec[mesPag] = (rec[mesPag] || 0) + valor;
        }
      }

      lidos += data.length;
      if (data.length < pageSize) break;
      from += pageSize;
    }

    // Conjunto de meses a atualizar (união de faturamento e recebido).
    const meses = new Set<string>([...Object.keys(fat), ...Object.keys(rec)]);
    let atualizados = 0;

    for (const mesRef of meses) {
      const ano = Number(mesRef.slice(0, 4));
      const mes = Number(mesRef.slice(5, 7));
      const faturamento_operacional = Math.round((fat[mesRef] || 0) * 100) / 100;
      const total_recebido = Math.round((rec[mesRef] || 0) * 100) / 100;

      const { data: existente } = await supabase
        .from("pid_operacional")
        .select("id")
        .eq("corretora_id", corretora_id)
        .eq("ano", ano)
        .eq("mes", mes)
        .maybeSingle();

      if (existente?.id) {
        const { error } = await supabase
          .from("pid_operacional")
          .update({ faturamento_operacional, total_recebido, updated_at: new Date().toISOString() })
          .eq("id", existente.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("pid_operacional")
          .insert({ corretora_id, ano, mes, faturamento_operacional, total_recebido });
        if (error) throw error;
      }
      atualizados++;
    }

    return new Response(
      JSON.stringify({ success: true, boletos_lidos: lidos, meses_atualizados: atualizados }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[agregar-financeiro-cobranca]", message);
    return new Response(JSON.stringify({ success: false, message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
