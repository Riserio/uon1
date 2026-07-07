import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * RESUMO GERAL consolidado (Eventos + Cobrança + MGF) em UMA mensagem.
 *
 * TAGS DISPONÍVEIS em `dados` (para usar no variable_map dos agendamentos):
 *
 * — Gerais —
 *   nome_associacao, data_geracao
 *
 * — Eventos (fonte: gerar-resumo-eventos, por DATA DE CADASTRO no mês) —
 *   ev_mes_referencia, ev_total, ev_colisao, ev_vidros, ev_furto_roubo,
 *   ev_outros, ev_cidade_top, ev_cooperativa_top
 *
 * — Cobrança (fonte: gerar-resumo-cobranca) —
 *   cob_mes_referencia, cob_data_atual, cob_percentual_inadimplencia,
 *   cob_total_gerados, cob_total_baixados, cob_total_inadimplentes,
 *   cob_faturamento_esperado, cob_faturamento_recebido, cob_total_aberto,
 *   cob_boletos_por_dia, cob_coop_maior_inadimplencia, cob_coop_menor_inadimplencia
 *
 * — MGF (calculado de mgf_dados, vencimento no mês corrente) —
 *   mgf_total_lancamentos, mgf_valor_total, mgf_pagos, mgf_valor_pago,
 *   mgf_em_aberto, mgf_valor_aberto, mgf_top_operacao
 */

// Alguns campos de origem (ex.: sga_eventos.cooperativa, cobranca_boletos.cooperativa)
// às vezes chegam da importação já serializados como JSON (ex.: um objeto
// {"codigo":"1","descricao":"NOME DA COOPERATIVA"}) em vez de texto puro.
// Esta função detecta esse caso e extrai um rótulo legível; se não for JSON,
// devolve o valor original sem alterar.
function extractLabel(v: any): string {
  if (v == null) return "N/A";
  if (typeof v !== "string") return String(v);
  const trimmed = v.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        return parsed.descricao || parsed.nome || parsed.name || parsed.codigo || trimmed;
      }
    } catch {
      // não era JSON válido — mantém o texto original
    }
  }
  return trimmed;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { corretora_id } = await req.json();
    if (!corretora_id) throw new Error("corretora_id é obrigatório");

    const { data: corretora } = await supabase.from("corretoras").select("nome").eq("id", corretora_id).single();
    const nomeAssociacao = corretora?.nome || "Associação";

    const now = new Date(Date.now() - 3 * 60 * 60 * 1000); // UTC-3
    const pad = (n: number) => String(n).padStart(2, "0");
    const dataGeracao = `${pad(now.getUTCDate())}/${pad(now.getUTCMonth() + 1)}/${now.getUTCFullYear()} às ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`;

    const fmtBRL = (v: number) =>
      new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

    // Chama um gerador existente; retorna null se falhar (seção é omitida)
    const invocar = async (fn: string): Promise<any | null> => {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
          body: JSON.stringify({ corretora_id }),
        });
        const json = await res.json().catch(() => null);
        return json?.success ? json : null;
      } catch {
        return null;
      }
    };

    // ===== EVENTOS + COBRANÇA (reuso dos geradores oficiais) =====
    const [evRes, cobRes] = await Promise.all([invocar("gerar-resumo-eventos"), invocar("gerar-resumo-cobranca")]);
    const ev = evRes?.dados || null;
    const cob = cobRes?.dados || null;

    // ===== MGF (calculado direto, vencimento no mês corrente) =====
    let mgf: Record<string, any> | null = null;
    try {
      const { data: impMgf } = await supabase
        .from("mgf_importacoes")
        .select("id")
        .eq("corretora_id", corretora_id)
        .eq("ativo", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (impMgf) {
        const inicioMes = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-01`;
        const fimMes = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().split("T")[0];

        let rows: any[] = [];
        let offset = 0;
        let hasMore = true;
        while (hasMore) {
          const { data: batch } = await supabase
            .from("mgf_dados")
            .select("operacao, valor, valor_pagamento, data_pagamento")
            .eq("importacao_id", impMgf.id)
            .gte("data_vencimento", inicioMes)
            .lte("data_vencimento", fimMes)
            .range(offset, offset + 999);
          if (batch && batch.length > 0) {
            rows = [...rows, ...batch];
            offset += 1000;
            hasMore = batch.length === 1000;
          } else hasMore = false;
        }

        if (rows.length > 0) {
          const pagos = rows.filter((r) => !!r.data_pagamento);
          const abertos = rows.filter((r) => !r.data_pagamento);
          const porOperacao: Record<string, number> = {};
          rows.forEach((r) => {
            const op = r.operacao || "Sem operação";
            porOperacao[op] = (porOperacao[op] || 0) + 1;
          });
          let topOp = { nome: "N/A", qtd: 0 };
          Object.entries(porOperacao).forEach(([nome, qtd]) => {
            if (qtd > topOp.qtd) topOp = { nome, qtd };
          });
          mgf = {
            mgf_total_lancamentos: rows.length,
            mgf_valor_total: fmtBRL(rows.reduce((a, r) => a + (r.valor || 0), 0)),
            mgf_pagos: pagos.length,
            mgf_valor_pago: fmtBRL(pagos.reduce((a, r) => a + (r.valor_pagamento || r.valor || 0), 0)),
            mgf_em_aberto: abertos.length,
            mgf_valor_aberto: fmtBRL(abertos.reduce((a, r) => a + (r.valor || 0), 0)),
            mgf_top_operacao: `${topOp.nome} (${topOp.qtd})`,
          };
        }
      }
    } catch (e) {
      console.warn("[gerar-resumo-geral] MGF indisponível:", e);
    }

    if (!ev && !cob && !mgf) {
      throw new Error("Nenhum módulo com dados disponíveis para esta associação");
    }

    // ===== Montagem da mensagem consolidada (seções sem dados são omitidas) =====
    const secoes: string[] = [];

    if (ev) {
      secoes.push(`📊 *EVENTOS NO MÊS* (${ev.mes_referencia})

              📈 Total de eventos abertos: *${ev.total_eventos}*
              🚗 Colisão: *${ev.eventos_colisao}*  🪟 Vidros: *${ev.eventos_vidros}*
              🔒 Furto/Roubo: *${ev.eventos_furto_roubo}*  📋 Outros: *${ev.eventos_outros}*
              📍 Cidade com mais eventos: *${extractLabel(ev.cidade_mais_eventos)}*
              🏢 Cooperativa com mais eventos: *${extractLabel(ev.cooperativa_mais_eventos)}*`);
    }

    if (cob) {
      secoes.push(`💰 *COBRANÇA* (${cob.mes_referencia})

              📉 Inadimplência geral: *${cob.percentual_inadimplencia}%*
              📄 Boletos gerados: *${cob.total_gerados}*  ✅ Baixados: *${cob.total_baixados}*
              💵 Esperado: *R$ ${cob.faturamento_esperado_formatado}*
              💵 Recebido: *R$ ${cob.faturamento_recebido_formatado}*
              ⏳ Em aberto: *R$ ${cob.total_aberto_formatado}*
              🔴 Maior inadimplência: *${extractLabel(cob.cooperativa_maior_inadimplencia)}*
              🟢 Menor inadimplência: *${extractLabel(cob.cooperativa_menor_inadimplencia)}*`);
    }

    if (mgf) {
      secoes.push(`📈 *MGF — LANÇAMENTOS DO MÊS*

              🧾 Total de lançamentos: *${mgf.mgf_total_lancamentos}*
              💵 Valor total: *R$ ${mgf.mgf_valor_total}*
              ✅ Pagos: *${mgf.mgf_pagos}* (R$ ${mgf.mgf_valor_pago})
              ⏳ Em aberto: *${mgf.mgf_em_aberto}* (R$ ${mgf.mgf_valor_aberto})
              🏷️ Operação mais frequente: *${mgf.mgf_top_operacao}*`);
    }

    const resumo = `*Resumo VANGARD da sua operação - ${nomeAssociacao}*

      O BI de indicadores de resultados da sua associação foi atualizado.

      📅 *${dataGeracao}*

      ${secoes.join("\n\n———————————————\n\n")}

      Consulte o painel completo para mais detalhes.`;

    // ===== Todas as tags disponíveis (para o variable_map dos agendamentos) =====
    const dados: Record<string, any> = {
      nome_associacao: nomeAssociacao,
      data_geracao: dataGeracao,
      // Eventos
      ev_mes_referencia: ev?.mes_referencia ?? "-",
      ev_total: ev?.total_eventos ?? "-",
      ev_colisao: ev?.eventos_colisao ?? "-",
      ev_vidros: ev?.eventos_vidros ?? "-",
      ev_furto_roubo: ev?.eventos_furto_roubo ?? "-",
      ev_outros: ev?.eventos_outros ?? "-",
      ev_cidade_top: ev ? extractLabel(ev.cidade_mais_eventos) : "-",
      ev_cooperativa_top: ev ? extractLabel(ev.cooperativa_mais_eventos) : "-",
      // Cobrança
      cob_mes_referencia: cob?.mes_referencia ?? "-",
      cob_data_atual: cob?.data_atual ?? "-",
      // Percentual com sufixo "%" pronto para exibição direta no template.
      cob_percentual_inadimplencia: cob?.percentual_inadimplencia != null ? `${cob.percentual_inadimplencia}%` : "-",
      cob_total_gerados: cob?.total_gerados ?? "-",
      cob_total_baixados: cob?.total_baixados ?? "-",
      cob_total_inadimplentes: cob?.total_inadimplentes ?? "-",
      // Valores monetários com prefixo "R$ " prontos para exibição direta no template.
      cob_faturamento_esperado:
        cob?.faturamento_esperado_formatado != null ? `R$ ${cob.faturamento_esperado_formatado}` : "-",
      cob_faturamento_recebido:
        cob?.faturamento_recebido_formatado != null ? `R$ ${cob.faturamento_recebido_formatado}` : "-",
      cob_total_aberto: cob?.total_aberto_formatado != null ? `R$ ${cob.total_aberto_formatado}` : "-",
      cob_boletos_por_dia: cob?.boletos_por_dia ?? "-",
      cob_coop_maior_inadimplencia: cob ? extractLabel(cob.cooperativa_maior_inadimplencia) : "-",
      cob_coop_menor_inadimplencia: cob ? extractLabel(cob.cooperativa_menor_inadimplencia) : "-",
      // MGF
      mgf_total_lancamentos: mgf?.mgf_total_lancamentos ?? "-",
      mgf_valor_total: mgf?.mgf_valor_total ?? "-",
      mgf_pagos: mgf?.mgf_pagos ?? "-",
      mgf_valor_pago: mgf?.mgf_valor_pago ?? "-",
      mgf_em_aberto: mgf?.mgf_em_aberto ?? "-",
      mgf_valor_aberto: mgf?.mgf_valor_aberto ?? "-",
      mgf_top_operacao: mgf?.mgf_top_operacao ?? "-",
      // Corpo completo pronto (para template Meta com {{1}} único)
      resumo_completo: resumo,
    };

    return new Response(
      JSON.stringify({
        success: true,
        resumo,
        dados,
        modulos_incluidos: { eventos: !!ev, cobranca: !!cob, mgf: !!mgf },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("Error generating general summary:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
