import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { corretora_id } = await req.json();

    if (!corretora_id) {
      throw new Error('corretora_id é obrigatório');
    }

    // Get current month reference
    const now = new Date();
    const mesReferencia = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const dataAtual = now.toLocaleDateString('pt-BR');

    // Get active import for this corretora
    const { data: importacao } = await supabase
      .from('cobranca_importacoes')
      .select('id')
      .eq('corretora_id', corretora_id)
      .eq('ativo', true)
      .single();

    if (!importacao) {
      throw new Error('Nenhuma importação ativa encontrada');
    }

    // Get ALL boletos from active import (no limit)
    // Using pagination to get all records
    let allBoletos: any[] = [];
    let offset = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: batchBoletos, error: batchError } = await supabase
        .from('cobranca_boletos')
        .select('*')
        .eq('importacao_id', importacao.id)
        .range(offset, offset + batchSize - 1);

      if (batchError) {
        console.error('[gerar-resumo-cobranca] Error fetching boletos:', batchError);
        throw batchError;
      }

      if (batchBoletos && batchBoletos.length > 0) {
        allBoletos = [...allBoletos, ...batchBoletos];
        offset += batchSize;
        hasMore = batchBoletos.length === batchSize;
      } else {
        hasMore = false;
      }
    }

    const boletos = allBoletos;
    console.log(`[gerar-resumo-cobranca] Total boletos carregados: ${boletos.length}`);

    // Calculate metrics
    const totalGerados = boletos?.length || 0;
    const boletosAbertos = boletos?.filter(b => b.situacao === 'Aberto') || [];
    const boletosBaixados = boletos?.filter(b => b.situacao !== 'Aberto') || [];
    
    const totalAbertos = boletosAbertos.length;
    const totalBaixados = boletosBaixados.length;
    
    const percentualInadimplencia = totalGerados > 0 
      ? ((totalAbertos / totalGerados) * 100).toFixed(2) 
      : '0.00';

    const valorTotalAberto = boletosAbertos.reduce((acc, b) => acc + (b.valor || 0), 0);
    const valorTotalPago = boletosBaixados.reduce((acc, b) => acc + (b.valor || 0), 0);
    const faturamentoEsperado = boletos?.reduce((acc, b) => acc + (b.valor || 0), 0) || 0;

    // Calculate by due day
    const diasVencimento = [5, 10, 15, 20];
    const boletosPorDia = diasVencimento.map(dia => {
      const gerados = boletos?.filter(b => b.dia_vencimento_veiculo === dia).length || 0;
      const abertos = boletos?.filter(b => b.dia_vencimento_veiculo === dia && b.situacao === 'Aberto').length || 0;
      return `${dia} – Total Gerado (${gerados}) – Total em aberto (${abertos})`;
    }).join('\n');

    // Calculate by cooperativa
    const cooperativaStats: Record<string, { total: number; abertos: number }> = {};
    boletos?.forEach(b => {
      const coop = b.cooperativa || 'Sem cooperativa';
      if (!cooperativaStats[coop]) {
        cooperativaStats[coop] = { total: 0, abertos: 0 };
      }
      cooperativaStats[coop].total++;
      if (b.situacao === 'Aberto') {
        cooperativaStats[coop].abertos++;
      }
    });

    // Find highest and lowest delinquency
    let maiorInadimplencia = { nome: 'N/A', percentual: 0 };
    let menorInadimplencia = { nome: 'N/A', percentual: 100 };

    Object.entries(cooperativaStats).forEach(([nome, stats]) => {
      if (stats.total >= 5) { // Minimum 5 boletos to be relevant
        const percentual = (stats.abertos / stats.total) * 100;
        if (percentual > maiorInadimplencia.percentual) {
          maiorInadimplencia = { nome, percentual };
        }
        if (percentual < menorInadimplencia.percentual) {
          menorInadimplencia = { nome, percentual };
        }
      }
    });

    // Format currency
    const formatCurrency = (value: number) => 
      new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

    // Build message with standard header
    const resumo = `*Resumo VANGARD da sua operação*

Olá, o BI de indicadores de resultados da sua associação foi atualizado.

Seguem abaixo informações importantes para sua gestão:

📊 *RESUMO DE COBRANÇA*

📅 *${dataAtual}*

💰 Inadimplência geral: *${percentualInadimplencia}%*
📄 Total boletos gerados: *${totalGerados}* boletos
✅ Total baixados: *${totalBaixados}* boletos

💵 Faturamento esperado: *R$ ${formatCurrency(faturamentoEsperado)}*
💵 Faturamento recebido: *R$ ${formatCurrency(valorTotalPago)}*
⏳ Total em aberto: *R$ ${formatCurrency(valorTotalAberto)}*

📊 *Boletos por dia de vencimento:*
${boletosPorDia}

🔴 *Maior inadimplência:* ${maiorInadimplencia.nome} (${maiorInadimplencia.percentual.toFixed(1)}%)
🟢 *Menor inadimplência:* ${menorInadimplencia.nome} (${menorInadimplencia.percentual.toFixed(1)}%)`;

    return new Response(
      JSON.stringify({
        success: true,
        resumo,
        dados: {
          data_atual: dataAtual,
          percentual_inadimplencia: percentualInadimplencia,
          total_gerados: totalGerados,
          total_baixados: totalBaixados,
          faturamento_esperado: faturamentoEsperado,
          faturamento_recebido: valorTotalPago,
          total_aberto: valorTotalAberto,
          cooperativa_maior_inadimplencia: maiorInadimplencia.nome,
          cooperativa_menor_inadimplencia: menorInadimplencia.nome,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error generating billing summary:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
