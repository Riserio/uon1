import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * RESUMO GERAL consolidado (Base + Eventos + Cobrança + MGF) em UMA mensagem.
 *
 * TAGS DISPONÍVEIS em `dados` (para usar no variable_map dos agendamentos):
 *
 * — Gerais —
 *   nome_associacao, data_geracao
 *
 * — Base (placas ativas + cadastros do mês) —
 *   base_placas_ativas, base_cadastros_mes
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
    const fmtInt = (v: number) => new Intl.NumberFormat("pt-BR").format(v || 0);

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

    // ===== BASE (placas ativas + cadastros do mês) — abre o resumo, como no PDF =====
    //
    // O mês da Base tem de ser O MESMO do restante do relatório. Rodando em
    // 05/08, a cobrança referencia JULHO (regra: até o dia 6 usa o mês anterior,
    // porque o mês recém-fechado ainda está liquidando), mas a Base pegava "o
    // mês mais recente com dado" e trazia AGOSTO. O resultado era um relatório
    // dizendo "Julho/2026" com 4.804 placas e 11 cadastros de agosto ao lado de
    // R$ 793 mil de julho.
    let basePlacasAtivas = 0;
    let baseCadastrosMes = 0;
    try {
      // cob.mes_referencia pode vir como "Julho/2026" ou "2026-07".
      const MESES_PT = ["janeiro","fevereiro","março","abril","maio","junho",
                        "julho","agosto","setembro","outubro","novembro","dezembro"];
      const refDoRelatorio = (): { ano: number; mes: number } | null => {
        const raw = String(cob?.mes_referencia ?? ev?.mes_referencia ?? "").trim();
        if (!raw) return null;
        const iso = raw.match(/^(\d{4})-(\d{2})$/);
        if (iso) return { ano: Number(iso[1]), mes: Number(iso[2]) };
        const br = raw.match(/^([A-Za-zçÇãÃéÉ]+)\s*\/\s*(\d{4})$/);
        if (br) {
          const idx = MESES_PT.indexOf(br[1].toLowerCase());
          if (idx >= 0) return { ano: Number(br[2]), mes: idx + 1 };
        }
        return null;
      };
      const alvo = refDoRelatorio();

      // Placas ativas do mês de referência; sem referência, cai no mais recente.
      let pidQuery = supabase
        .from("pid_operacional")
        .select("placas_ativas")
        .eq("corretora_id", corretora_id);
      if (alvo) {
        pidQuery = pidQuery.eq("ano", alvo.ano).eq("mes", alvo.mes);
      } else {
        pidQuery = pidQuery.order("ano", { ascending: false }).order("mes", { ascending: false });
      }
      const { data: pidRow } = await pidQuery.limit(1).maybeSingle();
      basePlacasAtivas = Number((pidRow as { placas_ativas?: number } | null)?.placas_ativas ?? 0);

      const { data: impBase } = await supabase
        .from("estudo_base_importacoes")
        .select("id")
        .eq("corretora_id", corretora_id)
        .eq("ativo", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (impBase?.id) {
        // Sem mês de referência (relatório avulso), usa o mês MAIS RECENTE com
        // cadastros — nunca o mês do calendário, que em dia 1 daria zero.
        let ry = alvo?.ano ?? 0;
        let rm = alvo?.mes ?? 0;
        if (!alvo) {
          const { data: ultimo } = await supabase
            .from("estudo_base_registros")
            .select("data_contrato")
            .eq("importacao_id", impBase.id)
            .not("data_contrato", "is", null)
            .order("data_contrato", { ascending: false })
            .limit(1)
            .maybeSingle();
          const refStr = (ultimo as { data_contrato?: string } | null)?.data_contrato;
          if (refStr) {
            const ref = new Date(refStr + "T00:00:00Z");
            ry = ref.getUTCFullYear();
            rm = ref.getUTCMonth() + 1;
          }
        }
        if (ry && rm) {
          const primeiroDia = `${ry}-${pad(rm)}-01`;
          const proxAno = rm === 12 ? ry + 1 : ry;
          const proxMes = rm === 12 ? 1 : rm + 1;
          const primeiroDiaProx = `${proxAno}-${pad(proxMes)}-01`;
          const { count } = await supabase
            .from("estudo_base_registros")
            .select("*", { count: "exact", head: true })
            .eq("importacao_id", impBase.id)
            .gte("data_contrato", primeiroDia)
            .lt("data_contrato", primeiroDiaProx);
          baseCadastrosMes = Number(count || 0);
        }
      }
    } catch (e) {
      console.warn("[gerar-resumo-geral] Base indisponível:", e);
    }

    if (!ev && !cob && !mgf) {
      throw new Error("Nenhum módulo com dados disponíveis para esta associação");
    }

    // ===== Montagem da mensagem consolidada (seções sem dados são omitidas) =====
    const secoes: string[] = [];

    // Base sempre abre o resumo (como no PDF).
    secoes.push(`📊 *BASE*

              🚗 Placas ativas: *${fmtInt(basePlacasAtivas)}*
              🆕 Cadastros do mês: *${fmtInt(baseCadastrosMes)}*`);

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
      // Base (abre o resumo, como no PDF)
      base_placas_ativas: fmtInt(basePlacasAtivas),
      base_cadastros_mes: fmtInt(baseCadastrosMes),
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
        modulos_incluidos: { base: true, eventos: !!ev, cobranca: !!cob, mgf: !!mgf },
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
