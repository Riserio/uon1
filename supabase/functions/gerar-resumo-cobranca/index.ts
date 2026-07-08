import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { corretora_id, mes_referencia: mesReferenciaParam } = await req.json();

    if (!corretora_id) {
      throw new Error("corretora_id é obrigatório");
    }

    // Get corretora name
    const { data: corretora } = await supabase.from("corretoras").select("nome").eq("id", corretora_id).single();
    const nomeAssociacao = corretora?.nome || "Associação";

    // Determine which month to report
    // Ajustar para UTC-3 (São Paulo)
    const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const diaAtual = now.getUTCDate();

    // Se mes_referencia foi passado explicitamente, usar ele
    // Caso contrário, até dia 6 usar mês anterior, a partir do dia 7 usar mês atual
    let mesReferencia: string;
    let usandoMesAnterior = false;

    if (mesReferenciaParam) {
      mesReferencia = mesReferenciaParam;
      const mesAtual = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      usandoMesAnterior = mesReferencia !== mesAtual;
    } else if (diaAtual <= 6) {
      const mesAnterior = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      mesReferencia = `${mesAnterior.getUTCFullYear()}-${String(mesAnterior.getUTCMonth() + 1).padStart(2, "0")}`;
      usandoMesAnterior = true;
    } else {
      mesReferencia = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    }

    const dia = String(now.getUTCDate()).padStart(2, "0");
    const mes = String(now.getUTCMonth() + 1).padStart(2, "0");
    const ano = now.getUTCFullYear();
    const hora = String(now.getUTCHours()).padStart(2, "0");
    const minuto = String(now.getUTCMinutes()).padStart(2, "0");
    const dataAtual = `${dia}/${mes}/${ano} às ${hora}:${minuto}`;

    // Get import(s) for this corretora.
    //
    // IMPORTANTE: para o mês corrente, a corretora pode ter MAIS DE UMA
    // importação ativa ao mesmo tempo por desenho — uma "API cobrança
    // (histórico)" (backfill de registros antigos, mantida via cron) e uma
    // "recente" (snapshot diário do robô GitHub). As duas são complementares
    // e devem ser somadas, não tratadas como duplicatas.
    let importacaoIds: string[] = [];

    if (!usandoMesAnterior) {
      const { data: ativas } = await supabase
        .from("cobranca_importacoes")
        .select("id")
        .eq("corretora_id", corretora_id)
        .eq("ativo", true);
      importacaoIds = (ativas || []).map((r: { id: string }) => r.id);
    } else {
      const { data: byName } = await supabase
        .from("cobranca_importacoes")
        .select("id")
        .eq("corretora_id", corretora_id)
        .like("nome_arquivo", `%${mesReferencia}%`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (byName) {
        importacaoIds = [byName.id];
      } else {
        const [refY, refM] = mesReferencia.split("-").map(Number);
        const inicioMes = new Date(Date.UTC(refY, refM - 1, 1)).toISOString();
        const fimMes = new Date(Date.UTC(refY, refM, 1)).toISOString();

        const { data: byDate } = await supabase
          .from("cobranca_importacoes")
          .select("id")
          .eq("corretora_id", corretora_id)
          .gte("created_at", inicioMes)
          .lt("created_at", fimMes)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (byDate) {
          importacaoIds = [byDate.id];
        } else {
          const { data: inactive } = await supabase
            .from("cobranca_importacoes")
            .select("id")
            .eq("corretora_id", corretora_id)
            .eq("ativo", false)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          importacaoIds = inactive ? [inactive.id] : [];
        }
      }
    }

    if (importacaoIds.length === 0) {
      throw new Error("Nenhuma importação ativa encontrada");
    }

    // ===== Métricas calculadas DIRETO no banco (SQL agregado), não mais
    // buscando todas as linhas cruas (podia passar de 15-17 mil boletos e
    // demorar demais / estourar timeout, deixando o resumo geral sem essa
    // seção). Ver função pública.calcular_resumo_cobranca(uuid[], text). =====
    const { data: metrics, error: metricsError } = await supabase.rpc("calcular_resumo_cobranca", {
      p_importacao_ids: importacaoIds,
      p_mes_referencia: mesReferencia,
    });

    if (metricsError) {
      console.error("[gerar-resumo-cobranca] Error calculando métricas:", metricsError);
      throw metricsError;
    }

    const totalGerados = metrics?.total_gerados || 0;
    const totalAbertos = metrics?.total_abertos || 0;
    const totalBaixados = metrics?.total_baixados || 0;
    const faturamentoEsperado = Number(metrics?.faturamento_esperado || 0);
    const valorTotalPago = Number(metrics?.faturamento_recebido || 0);
    const valorTotalAberto = Number(metrics?.valor_aberto || 0);

    const percentualInadimplencia = totalGerados > 0 ? ((totalAbertos / totalGerados) * 100).toFixed(2) : "0.00";

    const porDia = metrics?.por_dia || {};
    const diasVencimento = [5, 10, 15, 20];
    const boletosPorDia = diasVencimento
      .map((dia) => {
        const info = porDia[String(dia)] || { gerados: 0, abertos: 0 };
        return `${dia} – Total Gerado (${info.gerados}) – Total em aberto (${info.abertos})`;
      })
      .join("\n");

    const maiorInadimplencia = metrics?.maior_inadimplencia || { nome: "N/A", percentual: 0 };
    const menorInadimplencia = metrics?.menor_inadimplencia || { nome: "N/A", percentual: 100 };

    // Format currency
    const formatCurrency = (value: number) =>
      new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

    // Format month reference for display
    const [refAno, refMes] = mesReferencia.split("-");
    const mesesNomes = [
      "",
      "Janeiro",
      "Fevereiro",
      "Março",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ];
    const mesReferenciaLabel = `${mesesNomes[parseInt(refMes)]}/${refAno}`;
    const labelPeriodo = usandoMesAnterior ? ` (Ref: ${mesReferenciaLabel})` : "";

    // Build message with standard header including association name
    const resumo = `*Resumo VANGARD da sua operação - ${nomeAssociacao}*

O BI de indicadores de resultados da sua associação foi atualizado.${usandoMesAnterior ? `\n\n📌 *Relatório referente a ${mesReferenciaLabel}*` : ""}

Seguem abaixo informações importantes para sua gestão:

📊 *RESUMO DE COBRANÇA${labelPeriodo}*

📅 *${dataAtual}*

💰 Inadimplência geral: *${percentualInadimplencia}%*
📄 Total boletos gerados: *${totalGerados}* boletos
✅ Total baixados: *${totalBaixados}* boletos

💵 Faturamento esperado: *R$ ${formatCurrency(faturamentoEsperado)}*
💵 Faturamento recebido: *R$ ${formatCurrency(valorTotalPago)}*
⏳ Total em aberto: *R$ ${formatCurrency(valorTotalAberto)}*

📊 *Boletos por dia de vencimento:*
${boletosPorDia}

🔴 *Maior inadimplência:* ${maiorInadimplencia.nome} (${Number(maiorInadimplencia.percentual).toFixed(1)}%)
🟢 *Menor inadimplência:* ${menorInadimplencia.nome} (${Number(menorInadimplencia.percentual).toFixed(1)}%)`;

    return new Response(
      JSON.stringify({
        success: true,
        resumo,
        dados: {
          mes_referencia: mesReferenciaLabel,
          data_atual: dataAtual,
          percentual_inadimplencia: percentualInadimplencia,
          total_gerados: totalGerados,
          total_baixados: totalBaixados,
          total_inadimplentes: totalAbertos,
          valor_inadimplencia: formatCurrency(valorTotalAberto),
          faturamento_esperado: faturamentoEsperado,
          faturamento_recebido: valorTotalPago,
          total_aberto: valorTotalAberto,
          faturamento_esperado_formatado: formatCurrency(faturamentoEsperado),
          faturamento_recebido_formatado: formatCurrency(valorTotalPago),
          total_aberto_formatado: formatCurrency(valorTotalAberto),
          boletos_por_dia: boletosPorDia,
          cooperativa_maior_inadimplencia: maiorInadimplencia.nome,
          cooperativa_menor_inadimplencia: menorInadimplencia.nome,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("Error generating billing summary:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
