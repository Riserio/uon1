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

    // Get current month reference - filter by current month only
    const now = new Date();
    const mesReferencia = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    
    // Calculate first and last day of current month
    const primeiroDiaMes = new Date(now.getFullYear(), now.getMonth(), 1);
    const ultimoDiaMes = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const dataInicio = primeiroDiaMes.toISOString().split('T')[0];
    const dataFim = ultimoDiaMes.toISOString().split('T')[0];
    
    console.log(`[gerar-resumo-eventos] Filtrando eventos do mês: ${dataInicio} até ${dataFim}`);

    // Get active import for this corretora
    const { data: importacao } = await supabase
      .from('sga_importacoes')
      .select('id')
      .eq('corretora_id', corretora_id)
      .eq('ativo', true)
      .single();

    if (!importacao) {
      throw new Error('Nenhuma importação ativa encontrada');
    }

    // Get events from active import filtered by current month
    // Using pagination to get all records
    let allEventos: any[] = [];
    let offset = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: batchEventos, error: batchError } = await supabase
        .from('sga_eventos')
        .select('motivo_evento, evento_cidade, cooperativa, data_cadastro_evento')
        .eq('importacao_id', importacao.id)
        .gte('data_cadastro_evento', dataInicio)
        .lte('data_cadastro_evento', dataFim)
        .range(offset, offset + batchSize - 1);

      if (batchError) {
        console.error('[gerar-resumo-eventos] Error fetching eventos:', batchError);
        throw batchError;
      }

      if (batchEventos && batchEventos.length > 0) {
        allEventos = [...allEventos, ...batchEventos];
        offset += batchSize;
        hasMore = batchEventos.length === batchSize;
      } else {
        hasMore = false;
      }
    }

    const eventos = allEventos;
    console.log(`[gerar-resumo-eventos] Total eventos carregados: ${eventos.length}`);

    // Calculate metrics
    const totalEventos = eventos?.length || 0;

    // Count by type using motivo_evento field
    const tipoContagem: Record<string, number> = {
      'Colisão': 0,
      'Vidros': 0,
      'Furto/Roubo': 0,
      'Outros': 0,
    };

    eventos?.forEach(e => {
      const motivo = (e.motivo_evento || '').toUpperCase();
      if (motivo.includes('COLISÃO') || motivo.includes('COLISAO') || motivo.includes('CAPOTAMENTO')) {
        tipoContagem['Colisão']++;
      } else if (motivo.includes('VIDRO') || motivo.includes('PARA-BRISA') || motivo.includes('PARABRISA') || motivo.includes('LANTERNA') || motivo.includes('FAROL') || motivo.includes('RETROVISOR')) {
        tipoContagem['Vidros']++;
      } else if (motivo.includes('FURTO') || motivo.includes('ROUBO')) {
        tipoContagem['Furto/Roubo']++;
      } else {
        tipoContagem['Outros']++;
      }
    });

    // Count by city using evento_cidade field
    const cidadeContagem: Record<string, number> = {};
    eventos?.forEach(e => {
      const cidade = e.evento_cidade || 'Não informada';
      cidadeContagem[cidade] = (cidadeContagem[cidade] || 0) + 1;
    });

    // Find city with most events
    let cidadeMaisEventos = { nome: 'N/A', quantidade: 0 };
    Object.entries(cidadeContagem).forEach(([cidade, qtd]) => {
      if (qtd > cidadeMaisEventos.quantidade) {
        cidadeMaisEventos = { nome: cidade, quantidade: qtd };
      }
    });

    // Count by cooperativa
    const cooperativaContagem: Record<string, number> = {};
    eventos?.forEach(e => {
      const coop = e.cooperativa || 'Sem cooperativa';
      cooperativaContagem[coop] = (cooperativaContagem[coop] || 0) + 1;
    });

    // Find cooperativa with most events
    let cooperativaMaisEventos = { nome: 'N/A', quantidade: 0 };
    Object.entries(cooperativaContagem).forEach(([coop, qtd]) => {
      if (qtd > cooperativaMaisEventos.quantidade) {
        cooperativaMaisEventos = { nome: coop, quantidade: qtd };
      }
    });

    // Build message with standard header
    const resumo = `*Resumo VANGARD da sua operação!*

O BI de indicadores de resultados da sua associação foi atualizado.

Seguem abaixo informações importantes para sua gestão:

📊 *RESUMO DE EVENTOS NO MÊS*

📅 *${mesReferencia}*

📈 Total de eventos abertos: *${totalEventos}* eventos

🚗 Colisão: *${tipoContagem['Colisão']}*
🪟 Vidros: *${tipoContagem['Vidros']}*
🔒 Furto/Roubo: *${tipoContagem['Furto/Roubo']}*
📋 Outros: *${tipoContagem['Outros']}*

📍 *Cidade com mais eventos:* ${cidadeMaisEventos.nome} (${cidadeMaisEventos.quantidade})
🏢 *Cooperativa com mais eventos:* ${cooperativaMaisEventos.nome} (${cooperativaMaisEventos.quantidade})`;

    return new Response(
      JSON.stringify({
        success: true,
        resumo,
        dados: {
          mes_referencia: mesReferencia,
          total_eventos: totalEventos,
          eventos_colisao: tipoContagem['Colisão'],
          eventos_vidros: tipoContagem['Vidros'],
          eventos_furto_roubo: tipoContagem['Furto/Roubo'],
          eventos_outros: tipoContagem['Outros'],
          cidade_mais_eventos: cidadeMaisEventos.nome,
          cooperativa_mais_eventos: cooperativaMaisEventos.nome,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error generating events summary:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
