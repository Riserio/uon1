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
    //
    // MÊS ANTERIOR (dias 1–6): antes pegava UMA importação "do mês" por nome
    // ou por created_at e, sem achar, a inativa mais recente. Com a
    // integração via API isso quebra: a importação ATIVA "API cobrança
    // dd/mm/aaaa–dd/mm/aaaa" é reaproveitada para sempre (merge incremental),
    // não tem "aaaa-mm" no nome nem foi criada no mês — e as inativas antigas
    // têm os boletos purgados pela rotina de economia. Resultado: relatório
    // do dia 1 ao 6 saía todo ZERADO. Agora testamos as candidatas em ordem
    // e usamos a primeira que realmente tem boletos com vencimento no mês de
    // referência (a RPC já filtra por vencimento, então a ativa serve).
    const { data: ativas } = await supabase
      .from("cobranca_importacoes")
      .select("id")
      .eq("corretora_id", corretora_id)
      .eq("ativo", true);
    const idsAtivas = (ativas || []).map((r: { id: string }) => r.id);

    const candidatas: string[][] = [];
    if (!usandoMesAnterior) {
      if (idsAtivas.length) candidatas.push(idsAtivas);
    } else {
      const { data: byName } = await supabase
        .from("cobranca_importacoes")
        .select("id")
        .eq("corretora_id", corretora_id)
        .like("nome_arquivo", `%${mesReferencia}%`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byName) candidatas.push([byName.id]);

      if (idsAtivas.length) candidatas.push(idsAtivas);

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
      if (byDate) candidatas.push([byDate.id]);

      const { data: inactive } = await supabase
        .from("cobranca_importacoes")
        .select("id")
        .eq("corretora_id", corretora_id)
        .eq("ativo", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (inactive) candidatas.push([inactive.id]);
    }

    // Remove candidatas repetidas (mesmo conjunto de ids).
    const vistos = new Set<string>();
    const candidatasUnicas = candidatas.filter((ids) => {
      const k = [...ids].sort().join(",");
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });

    if (candidatasUnicas.length === 0) {
      throw new Error("Nenhuma importação ativa encontrada");
    }

    // ===== Métricas calculadas DIRETO no banco (SQL agregado), não mais
    // buscando todas as linhas cruas (podia passar de 15-17 mil boletos e
    // demorar demais / estourar timeout, deixando o resumo geral sem essa
    // seção). Ver função pública.calcular_resumo_cobranca(uuid[], text). =====
    // Base da inadimplência configurada por associação:
    // 'total' (padrão) = todos os boletos do mês; 'vencidos' = apenas os que
    // já passaram da data de vencimento.
    const { data: cfgInad } = await supabase
      .from("cobranca_automacao_config")
      .select("inadimplencia_base, tipos_boleto_relatorio")
      .eq("corretora_id", corretora_id)
      .maybeSingle();
    const somenteVencidos = (cfgInad?.inadimplencia_base ?? "total") === "vencidos";
    // Tipos de boleto do bloco principal (padrão: só mensalidade/FECHAMENTO).
    const tiposCfg = (cfgInad as { tipos_boleto_relatorio?: string[] | null } | null)?.tipos_boleto_relatorio;
    const tiposRelatorio: string[] = Array.isArray(tiposCfg) && tiposCfg.length > 0 ? tiposCfg : ["FECHAMENTO"];

    // deno-lint-ignore no-explicit-any
    let metrics: any = null;
    for (const ids of candidatasUnicas) {
      const { data, error: metricsError } = await supabase.rpc("calcular_resumo_cobranca", {
        p_importacao_ids: ids,
        p_mes_referencia: mesReferencia,
        p_somente_vencidos: somenteVencidos,
        p_tipos: tiposRelatorio,
      });
      if (metricsError) {
        console.error("[gerar-resumo-cobranca] Error calculando métricas:", metricsError);
        throw metricsError;
      }
      metrics = data;
      const temBoletos = Number(data?.total_gerados || 0) > 0 || Number(data?.outros_total_qtd || 0) > 0;
      if (temBoletos) break;
      console.warn(`[gerar-resumo-cobranca] Importação(ões) ${ids.join(",")} sem boletos em ${mesReferencia}; tentando próxima.`);
    }

    // Nenhuma candidata tem boletos do mês: falha explícita (o resumo geral
    // omite a seção e registra o aviso) em vez de mandar tudo zerado.
    if (!metrics || (Number(metrics.total_gerados || 0) === 0 && Number(metrics.outros_total_qtd || 0) === 0)) {
      throw new Error(`Nenhum boleto com vencimento em ${mesReferencia} nas importações da associação`);
    }

    const totalGerados = metrics?.total_gerados || 0;
    const totalAbertos = metrics?.total_abertos || 0;
    const totalBaixados = metrics?.total_baixados || 0;
    const faturamentoEsperado = Number(metrics?.faturamento_esperado || 0);
    const valorTotalPago = Number(metrics?.faturamento_recebido || 0);
    const valorTotalAberto = Number(metrics?.valor_aberto || 0);

    // Rótulo que acompanha o percentual no WhatsApp/PDF para não restar
    // dúvida sobre qual base foi usada no cálculo.
    const baseInadimplenciaLabel = somenteVencidos
      ? "somente boletos vencidos"
      : "total de boletos em aberto";

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

    // ===== Outras cobranças do mês (tipos fora do filtro do relatório) =====
    const tiposAplicados: string[] = Array.isArray(metrics?.tipos_aplicados) ? metrics.tipos_aplicados : tiposRelatorio;
    const soFechamento = tiposAplicados.length === 1 && String(tiposAplicados[0]).toUpperCase() === "FECHAMENTO";
    const tituloBloco = soFechamento ? "Mensalidades (FECHAMENTO)" : `Boletos (${tiposAplicados.join(", ")})`;
    type OutroTipo = { tipo: string; qtd: number; baixados: number; valor: number; valor_pago: number };
    const outrosTipos: OutroTipo[] = Array.isArray(metrics?.outros_tipos) ? metrics.outros_tipos : [];
    const outrosQtd = Number(metrics?.outros_total_qtd || 0);
    const outrosValor = Number(metrics?.outros_total_valor || 0);
    const fmtCurto = (v: number) =>
      new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.round(Number(v) || 0));
    const tituloCase = (s: string) =>
      s.toLowerCase().replace(/(^|\s|-)(\p{L})/gu, (_m, p, c) => p + c.toUpperCase());
    const top = outrosTipos.slice(0, 4).map((o) => `${tituloCase(o.tipo)} R$ ${fmtCurto(o.valor)}`);
    if (outrosTipos.length > 4) top.push("outros");
    const outrasResumo = outrosQtd > 0
      ? `${outrosQtd} boletos · R$ ${formatCurrency(outrosValor)}${top.length ? ` — ${top.join(" · ")}` : ""}`
      : "Nenhuma";

    // Build message with standard header including association name
    const resumo = `*Resumo VANGARD da sua operação - ${nomeAssociacao}*

O BI de indicadores de resultados da sua associação foi atualizado.${usandoMesAnterior ? `\n\n📌 *Relatório referente a ${mesReferenciaLabel}*` : ""}

Seguem abaixo informações importantes para sua gestão:

📊 *RESUMO DE COBRANÇA${labelPeriodo}*

📅 *${dataAtual}*

🧾 *${tituloBloco}*
💰 Inadimplência geral: *${percentualInadimplencia}%* _(${baseInadimplenciaLabel})_
📄 Total boletos gerados: *${totalGerados}* boletos
✅ Total baixados: *${totalBaixados}* boletos

💵 Faturamento esperado: *R$ ${formatCurrency(faturamentoEsperado)}*
💵 Faturamento recebido: *R$ ${formatCurrency(valorTotalPago)}*
⏳ Total em aberto: *R$ ${formatCurrency(valorTotalAberto)}*

📊 *Boletos por dia de vencimento:*
${boletosPorDia}

🔴 *Maior inadimplência:* ${maiorInadimplencia.nome} (${Number(maiorInadimplencia.percentual).toFixed(1)}%)
🟢 *Menor inadimplência:* ${menorInadimplencia.nome} (${Number(menorInadimplencia.percentual).toFixed(1)}%)${outrosQtd > 0 ? `

📎 *Outras cobranças do mês (fora da mensalidade)*
${outrasResumo}` : ""}`;

    return new Response(
      JSON.stringify({
        success: true,
        resumo,
        dados: {
          mes_referencia: mesReferenciaLabel,
          data_atual: dataAtual,
          percentual_inadimplencia: percentualInadimplencia,
          inadimplencia_base: somenteVencidos ? "vencidos" : "total",
          inadimplencia_base_label: baseInadimplenciaLabel,
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
          tipos_aplicados: tiposAplicados,
          bloco_principal_label: tituloBloco,
          outras_cobrancas_qtd: outrosQtd,
          outras_cobrancas_valor_formatado: formatCurrency(outrosValor),
          outras_cobrancas_resumo: outrasResumo,
          outras_cobrancas_tipos: outrosTipos,
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
