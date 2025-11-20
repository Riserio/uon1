import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnaliseRequest {
  vistoria_id: string;
  fotos: Array<{
    id: string;
    posicao: string;
    url: string;
  }>;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { vistoria_id, fotos }: AnaliseRequest = await req.json();

    console.log('Analisando vistoria:', vistoria_id, 'com', fotos.length, 'fotos');

    // Analisar cada foto com IA
    const analises = [];
    const danosDetectados: string[] = [];

    for (const foto of fotos) {
      console.log('Analisando foto:', foto.posicao);
      
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'system',
              content: 'Você é um especialista em análise de vistorias veiculares para seguradoras. Analise a imagem do veículo e identifique: 1) Danos visíveis (amassados, arranhões, quebras) 2) Estado geral da pintura 3) Condição dos pneus e rodas 4) Vidros e espelhos 5) Luzes e lanternas. Seja preciso e objetivo.'
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Analise esta foto ${foto.posicao} do veículo e liste todos os danos e observações relevantes:`
                },
                {
                  type: 'image_url',
                  image_url: { url: foto.url }
                }
              ]
            }
          ]
        })
      });

      if (!aiResponse.ok) {
        const error = await aiResponse.text();
        console.error('Erro na análise IA:', error);
        throw new Error(`Erro ao analisar foto: ${error}`);
      }

      const aiData = await aiResponse.json();
      const analiseTexto = aiData.choices?.[0]?.message?.content || 'Análise não disponível';
      
      analises.push({
        posicao: foto.posicao,
        analise: analiseTexto
      });

      // Extrair danos mencionados
      if (analiseTexto.toLowerCase().includes('amassado')) danosDetectados.push('Amassado');
      if (analiseTexto.toLowerCase().includes('arranhão') || analiseTexto.toLowerCase().includes('arranhao')) danosDetectados.push('Arranhão');
      if (analiseTexto.toLowerCase().includes('quebr')) danosDetectados.push('Quebrado');
      if (analiseTexto.toLowerCase().includes('trinc')) danosDetectados.push('Trincado');
      if (analiseTexto.toLowerCase().includes('oxidação') || analiseTexto.toLowerCase().includes('oxidacao') || analiseTexto.toLowerCase().includes('ferrugem')) danosDetectados.push('Oxidação');

      // Atualizar análise da foto
      await supabase
        .from('vistoria_fotos')
        .update({ analise_ia: { analise: analiseTexto } })
        .eq('id', foto.id);
    }

    // Gerar resumo geral
    const resumoResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'Você é um especialista em vistorias veiculares. Crie um resumo executivo da vistoria baseado nas análises individuais.'
          },
          {
            role: 'user',
            content: `Com base nas seguintes análises das fotos do veículo, crie um resumo executivo profissional da vistoria:\n\n${analises.map(a => `${a.posicao}: ${a.analise}`).join('\n\n')}\n\nResumo:`
          }
        ]
      })
    });

    const resumoData = await resumoResponse.json();
    const observacoesIA = resumoData.choices?.[0]?.message?.content || 'Resumo não disponível';

    // Atualizar vistoria com análise completa
    const { error: updateError } = await supabase
      .from('vistorias')
      .update({
        status: 'concluida',
        analise_ia: { analises, resumo: observacoesIA },
        danos_detectados: Array.from(new Set(danosDetectados)),
        observacoes_ia: observacoesIA,
        completed_at: new Date().toISOString()
      })
      .eq('id', vistoria_id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ 
        success: true, 
        analises,
        observacoes_ia: observacoesIA,
        danos_detectados: Array.from(new Set(danosDetectados))
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Erro ao analisar vistoria:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(handler);
