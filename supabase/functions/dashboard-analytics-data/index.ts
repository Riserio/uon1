import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify the user is authenticated
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const url = new URL(req.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    // ===== SGA EVENTOS AGGREGATIONS =====
    
    // Total events
    const { count: totalEventos } = await supabaseClient
      .from("sga_eventos")
      .select("*", { count: "exact", head: true });

    // Events by situacao
    const { data: eventosBySituacao } = await supabaseClient.rpc("sql", {
      query: `
        SELECT situacao_evento as name, count(*)::int as value
        FROM sga_eventos
        WHERE situacao_evento IS NOT NULL
        GROUP BY situacao_evento
        ORDER BY count DESC
        LIMIT 15
      `
    }).maybeSingle();

    // Try raw SQL via a different approach - use multiple count queries instead
    const situacoes = ['FINALIZADO', 'VEICULO FINALIZADO', 'EVENTO NEGADO', 'NEGADO', 'EM ANDAMENTO', 
                       'EVENTO FINALIZADO', 'ARQUIVADO', 'ABERTO', 'VEICULO EM REPARO', 'PENDENTE PAGAMENTO',
                       'VEICULO ENTREGUE', 'CANCELADO INATIVIDADE ASSOCIAD'];
    
    const situacaoPromises = situacoes.map(async (sit) => {
      const { count } = await supabaseClient
        .from("sga_eventos")
        .select("*", { count: "exact", head: true })
        .eq("situacao_evento", sit);
      return { name: sit, value: count || 0 };
    });
    const eventosPorSituacao = await Promise.all(situacaoPromises);

    // Events by motivo
    const motivos = ['COLISÃO', 'VIDROS', 'FURTO', 'ROUBO', 'GUINCHO', 
                     'SOMENTE PARA TERCEIRO', 'PARA-BRISA', 'VIDROS/FAROIS/RETROVISORES/LANTERNAS',
                     'COBERTURA ADICIONAL', 'CARRO RESERVA'];
    
    const motivoPromises = motivos.map(async (mot) => {
      const { count } = await supabaseClient
        .from("sga_eventos")
        .select("*", { count: "exact", head: true })
        .eq("motivo_evento", mot);
      return { name: mot, value: count || 0 };
    });
    const eventosPorMotivo = await Promise.all(motivoPromises);

    // Events by corretora (via importacao -> corretora)
    // Get all importacoes grouped by corretora
    const { data: importacoes } = await supabaseClient
      .from("sga_importacoes")
      .select("id, corretora_id, corretoras(nome)")
      .eq("ativo", true);

    const corretoraMap = new Map<string, { nome: string; importacaoIds: string[] }>();
    if (importacoes) {
      for (const imp of importacoes) {
        const cId = imp.corretora_id;
        if (!cId) continue;
        if (!corretoraMap.has(cId)) {
          corretoraMap.set(cId, {
            nome: (imp.corretoras as any)?.nome || "Sem nome",
            importacaoIds: [],
          });
        }
        corretoraMap.get(cId)!.importacaoIds.push(imp.id);
      }
    }

    const eventosPorCorretora: { corretora: string; id: string; total: number }[] = [];
    for (const [cId, info] of corretoraMap.entries()) {
      const { count } = await supabaseClient
        .from("sga_eventos")
        .select("*", { count: "exact", head: true })
        .in("importacao_id", info.importacaoIds);
      eventosPorCorretora.push({ corretora: info.nome, id: cId, total: count || 0 });
    }
    eventosPorCorretora.sort((a, b) => b.total - a.total);

    // Events monthly (last 12 months)
    const eventosPorMes: { mes: string; total: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mesStart = d.toISOString().split("T")[0];
      const mesEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0];
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

      const { count } = await supabaseClient
        .from("sga_eventos")
        .select("*", { count: "exact", head: true })
        .gte("data_cadastro_evento", mesStart)
        .lte("data_cadastro_evento", mesEnd);

      eventosPorMes.push({ mes: label, total: count || 0 });
    }

    // Financial summary from events
    const { data: financialData } = await supabaseClient
      .from("sga_eventos")
      .select("custo_evento, valor_reparo, participacao")
      .not("custo_evento", "is", null)
      .limit(50000);

    let totalCustoEventos = 0;
    let totalValorReparo = 0;
    let totalParticipacao = 0;
    if (financialData) {
      for (const ev of financialData) {
        totalCustoEventos += parseFloat(ev.custo_evento) || 0;
        totalValorReparo += parseFloat(ev.valor_reparo) || 0;
        totalParticipacao += parseFloat(ev.participacao) || 0;
      }
    }

    // ===== COBRANÇA AGGREGATIONS =====
    const { count: totalBoletos } = await supabaseClient
      .from("cobranca_boletos")
      .select("*", { count: "exact", head: true });

    const cobrancaSituacoes = ['ABERTO', 'BAIXADO', 'CANCELADO'];
    const cobrancaSituacaoPromises = cobrancaSituacoes.map(async (sit) => {
      const { count } = await supabaseClient
        .from("cobranca_boletos")
        .select("*", { count: "exact", head: true })
        .eq("situacao", sit);
      return { name: sit, value: count || 0 };
    });
    const boletosPorSituacao = await Promise.all(cobrancaSituacaoPromises);

    // Boletos financial
    const { data: boletosFinancial } = await supabaseClient
      .from("cobranca_boletos")
      .select("valor, situacao")
      .not("valor", "is", null)
      .limit(50000);

    let totalValorBoletos = 0;
    let totalValorAberto = 0;
    let totalValorBaixado = 0;
    if (boletosFinancial) {
      for (const b of boletosFinancial) {
        const val = parseFloat(b.valor) || 0;
        totalValorBoletos += val;
        if (b.situacao === 'ABERTO') totalValorAberto += val;
        if (b.situacao === 'BAIXADO') totalValorBaixado += val;
      }
    }

    return new Response(
      JSON.stringify({
        eventos: {
          total: totalEventos || 0,
          porSituacao: eventosPorSituacao.filter((s) => s.value > 0).sort((a, b) => b.value - a.value),
          porMotivo: eventosPorMotivo.filter((m) => m.value > 0).sort((a, b) => b.value - a.value),
          porCorretora: eventosPorCorretora,
          porMes: eventosPorMes,
          financeiro: {
            totalCusto: totalCustoEventos,
            totalReparo: totalValorReparo,
            totalParticipacao: totalParticipacao,
          },
        },
        cobranca: {
          total: totalBoletos || 0,
          porSituacao: boletosPorSituacao,
          financeiro: {
            totalValor: totalValorBoletos,
            totalAberto: totalValorAberto,
            totalBaixado: totalValorBaixado,
          },
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor", details: String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
