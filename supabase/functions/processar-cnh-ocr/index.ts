import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: 'Imagem não fornecida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processando CNH com IA...');

    // Usar Lovable AI para extrair dados da CNH
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'Você é um sistema especializado em extrair dados de CNH brasileira. Retorne APENAS um JSON válido com os dados extraídos, sem texto adicional.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extraia os seguintes dados desta CNH brasileira e retorne APENAS um JSON com esta estrutura exata: {"nome": "nome completo", "cpf": "000.000.000-00", "rg": "00.000.000-0", "data_nascimento": "dd/mm/aaaa", "nome_pai": "nome do pai", "nome_mae": "nome da mae", "numero_registro": "00000000000", "data_emissao": "dd/mm/aaaa", "validade": "dd/mm/aaaa"}. Se algum campo não for encontrado, use null.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro na API de IA:', errorText);
      throw new Error(`Erro ao processar imagem: ${response.status}`);
    }

    const data = await response.json();
    console.log('Resposta da IA:', data);

    const extractedText = data.choices[0].message.content;
    console.log('Texto extraído:', extractedText);

    // Tentar extrair JSON da resposta
    let cnhData;
    try {
      // Encontrar JSON na resposta (pode estar envolvido em markdown ou texto)
      const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cnhData = JSON.parse(jsonMatch[0]);
      } else {
        cnhData = JSON.parse(extractedText);
      }
    } catch (parseError) {
      console.error('Erro ao fazer parse do JSON:', parseError);
      console.error('Texto recebido:', extractedText);
      
      // Retornar estrutura vazia se falhar
      cnhData = {
        nome: null,
        cpf: null,
        rg: null,
        data_nascimento: null,
        nome_pai: null,
        nome_mae: null,
        numero_registro: null,
        data_emissao: null,
        validade: null,
        erro: 'Não foi possível extrair os dados automaticamente'
      };
    }

    console.log('Dados extraídos:', cnhData);

    return new Response(
      JSON.stringify(cnhData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro na função processar-cnh-ocr:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        nome: null,
        cpf: null,
        rg: null,
        data_nascimento: null,
        nome_pai: null,
        nome_mae: null,
        numero_registro: null,
        data_emissao: null,
        validade: null
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
