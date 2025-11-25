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
    let placa = '';
    let modelo = '';

    for (const foto of fotos) {
      console.log('Analisando foto:', foto.posicao);
      
      // Primeira análise: detectar placa, modelo, marca e ano (especialmente na foto frontal)
      if (foto.posicao === 'frontal') {
        const placaResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
                content: 'Você é um especialista em OCR de placas e identificação de veículos brasileiros. Extraia PLACA, MARCA, MODELO e ANO do veículo com máxima precisão.'
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Identifique com PRECISÃO a PLACA do veículo (padrão brasileiro ABC-1234 ou Mercosul ABC1D23), a MARCA, o MODELO e o ANO. Responda EXATAMENTE no formato: PLACA: XXX-0000 | MARCA: NomeMarca | MODELO: NomeModelo | ANO: 2020. Se não conseguir identificar algum dado, indique como "Não identificado".'
                  },
                  {
                    type: 'image_url',
                    image_url: { url: foto.url }
                  }
                ]
              }
            ],
            max_tokens: 300,
            temperature: 0.1
          })
        });

        if (placaResponse.ok) {
          const placaData = await placaResponse.json();
          const placaTexto = placaData.choices?.[0]?.message?.content || '';
          
          console.log('Resposta OCR placa:', placaTexto);
          
          // Extrair placa com regex mais flexível
          const placaMatch = placaTexto.match(/PLACA:\s*([A-Z]{3}[-\s]?[0-9]{1}[A-Z0-9]{1}[0-9]{2})/i);
          if (placaMatch) {
            placa = placaMatch[1].toUpperCase().replace(/\s/g, '');
            // Normalizar formato
            if (placa.length === 7 && !placa.includes('-')) {
              // Se for formato novo sem hífen, manter
              if (/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa)) {
                // Formato Mercosul válido
              } else if (/^[A-Z]{3}\d{4}$/.test(placa)) {
                // Formato antigo, adicionar hífen
                placa = placa.slice(0, 3) + '-' + placa.slice(3);
              }
            }
            console.log('Placa detectada:', placa);
          }
          
          // Extrair modelo
          const modeloMatch = placaTexto.match(/MODELO:\s*(.+?)(?:\||$)/i);
          if (modeloMatch && !modeloMatch[1].includes('Não identificado')) {
            modelo = modeloMatch[1].trim();
            console.log('Modelo detectado:', modelo);
          }
        }
      }
      
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

    // Extrair marca e ano do texto da IA
    let marca = '';
    let ano = '';
    
    for (const analise of analises) {
      if (analise.posicao === 'frontal') {
        const marcaMatch = analise.analise.match(/MARCA:\s*([^\|\n]+)/i);
        if (marcaMatch && !marcaMatch[1].includes('Não identificado')) {
          marca = marcaMatch[1].trim();
        }
        
        const anoMatch = analise.analise.match(/ANO:\s*(\d{4})/i);
        if (anoMatch) {
          ano = anoMatch[1];
        }
      }
    }

    // Atualizar vistoria com análise completa e dados do veículo
    const updateData: any = {
      status: 'concluida',
      analise_ia: { 
        analises, 
        resumo: observacoesIA,
        data_analise: new Date().toISOString(),
        veiculo: {
          PLACA: placa || 'Não identificado',
          MARCA: marca || 'Não identificado',
          MODELO: modelo || 'Não identificado',
          ANO: ano || 'Não identificado'
        }
      },
      danos_detectados: Array.from(new Set(danosDetectados)),
      observacoes_ia: observacoesIA,
      completed_at: new Date().toISOString()
    };

    if (placa) {
      updateData.veiculo_placa = placa;
    }
    if (modelo) {
      updateData.veiculo_modelo = modelo;
    }
    if (marca) {
      updateData.veiculo_marca = marca;
    }
    if (ano) {
      updateData.veiculo_ano = ano;
    }

    const { error: updateError } = await supabase
      .from('vistorias')
      .update(updateData)
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
