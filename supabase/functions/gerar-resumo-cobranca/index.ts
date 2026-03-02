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

    const { corretora_id, mes_referencia: mesReferenciaParam } = await req.json();

    if (!corretora_id) {
      throw new Error('corretora_id é obrigatório');
    }

    // Get corretora name
    const { data: corretora } = await supabase
      .from('corretoras')
      .select('nome')
      .eq('id', corretora_id)
      .single();
    const nomeAssociacao = corretora?.nome || 'Associação';

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
      // Verificar se é mês anterior
      const mesAtual = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      usandoMesAnterior = mesReferencia !== mesAtual;
    } else if (diaAtual <= 6) {
      // Até dia 6: relatório do mês anterior
      const mesAnterior = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      mesReferencia = `${mesAnterior.getUTCFullYear()}-${String(mesAnterior.getUTCMonth() + 1).padStart(2, '0')}`;
      usandoMesAnterior = true;
    } else {
      mesReferencia = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    
    const dia = String(now.getUTCDate()).padStart(2, '0');
    const mes = String(now.getUTCMonth() + 1).padStart(2, '0');
    const ano = now.getUTCFullYear();
    const hora = String(now.getUTCHours()).padStart(2, '0');
    const minuto = String(now.getUTCMinutes()).padStart(2, '0');
    const dataAtual = `${dia}/${mes}/${ano} às ${hora}:${minuto}`;

    // Get import for this corretora
    let importacao: any = null;
    
    if (!usandoMesAnterior) {
      // Mês atual: usar importação ativa
      const { data } = await supabase
        .from('cobranca_importacoes')
        .select('id')
        .eq('corretora_id', corretora_id)
        .eq('ativo', true)
        .single();
      importacao = data;
    } else {
      // Mês anterior: buscar por nome_arquivo contendo o mes_referencia
      const { data: byName } = await supabase
        .from('cobranca_importacoes')
        .select('id')
        .eq('corretora_id', corretora_id)
        .like('nome_arquivo', `%${mesReferencia}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (byName) {
        importacao = byName;
      } else {
        // Fallback: buscar por created_at dentro do mês de referência
        const [refY, refM] = mesReferencia.split('-').map(Number);
        const inicioMes = new Date(Date.UTC(refY, refM - 1, 1)).toISOString();
        const fimMes = new Date(Date.UTC(refY, refM, 1)).toISOString(); // primeiro dia do mês seguinte
        
        const { data: byDate } = await supabase
          .from('cobranca_importacoes')
          .select('id')
          .eq('corretora_id', corretora_id)
          .gte('created_at', inicioMes)
          .lt('created_at', fimMes)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (byDate) {
          importacao = byDate;
        } else {
          // Último fallback: importação inativa mais recente
          const { data: inactive } = await supabase
            .from('cobranca_importacoes')
            .select('id')
            .eq('corretora_id', corretora_id)
            .eq('ativo', false)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          importacao = inactive;
        }
      }
    }

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

    // Helper function for case-insensitive status check
    const isAberto = (situacao: string | null) => {
      if (!situacao) return false;
      return situacao.toUpperCase() === 'ABERTO';
    };

    const isBaixado = (situacao: string | null) => {
      if (!situacao) return false;
      const upper = situacao.toUpperCase();
      return upper === 'BAIXADO' || upper.includes('BAIXADO');
    };

    // Helper: get next business day (skip weekends)
    const getProximoDiaUtil = (dia: number): number => {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), dia));
      const dayOfWeek = date.getUTCDay();
      if (dayOfWeek === 6) return dia + 2; // Sábado → Segunda
      if (dayOfWeek === 0) return dia + 1; // Domingo → Segunda
      return dia;
    };

    // Calculate metrics
    const totalGerados = boletos?.length || 0;
    const boletosAbertos = boletos?.filter(b => isAberto(b.situacao)) || [];
    const boletosBaixados = boletos?.filter(b => isBaixado(b.situacao)) || [];
    
    const totalAbertos = boletosAbertos.length;
    const totalBaixados = boletosBaixados.length;
    
    const percentualInadimplencia = totalGerados > 0 
      ? ((totalAbertos / totalGerados) * 100).toFixed(2) 
      : '0.00';

    const valorTotalAberto = boletosAbertos.reduce((acc, b) => acc + (b.valor || 0), 0);
    const valorTotalPago = boletosBaixados.reduce((acc, b) => acc + (b.valor || 0), 0);
    const faturamentoEsperado = boletos?.reduce((acc, b) => acc + (b.valor || 0), 0) || 0;

    // Calculate by due day (using business day reference for delinquency)
    const diasVencimento = [5, 10, 15, 20];
    const boletosPorDia = diasVencimento.map(dia => {
      const gerados = boletos?.filter(b => b.dia_vencimento_veiculo === dia).length || 0;
      let abertos: number;
      
      if (usandoMesAnterior) {
        // Mês anterior: todos os vencimentos já passaram, contar todos em aberto
        abertos = boletos?.filter(b => 
          b.dia_vencimento_veiculo === dia && 
          isAberto(b.situacao)
        ).length || 0;
      } else {
        // Mês atual: só contar em aberto se o dia útil de referência já passou
        const diaUtilRef = getProximoDiaUtil(dia);
        const diaHoje = now.getUTCDate();
        abertos = boletos?.filter(b => 
          b.dia_vencimento_veiculo === dia && 
          isAberto(b.situacao) && 
          diaUtilRef <= diaHoje
        ).length || 0;
      }
      
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
      if (isAberto(b.situacao)) {
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

    // Format month reference for display
    const [refAno, refMes] = mesReferencia.split('-');
    const mesesNomes = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const mesReferenciaLabel = `${mesesNomes[parseInt(refMes)]}/${refAno}`;
    const labelPeriodo = usandoMesAnterior ? ` (Ref: ${mesReferenciaLabel})` : '';

    // Build message with standard header including association name
    const resumo = `*Resumo VANGARD da sua operação - ${nomeAssociacao}*

O BI de indicadores de resultados da sua associação foi atualizado.${usandoMesAnterior ? `\n\n📌 *Relatório referente a ${mesReferenciaLabel}*` : ''}

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
