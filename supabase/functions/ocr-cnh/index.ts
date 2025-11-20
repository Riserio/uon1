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
    const { image, tipo } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    console.log('Iniciando OCR:', tipo);

    let prompt = '';
    if (tipo === 'cnh') {
      prompt = `Analise esta imagem de CNH brasileira e extraia os seguintes dados em formato JSON:
{
  "nome": "nome completo",
  "cpf": "CPF sem pontuação (apenas números)",
  "rg": "RG",
  "data_nascimento": "data no formato YYYY-MM-DD",
  "nome_pai": "nome do pai",
  "nome_mae": "nome da mãe",
  "numero_registro": "número de registro da CNH",
  "data_primeira_habilitacao": "data no formato YYYY-MM-DD",
  "data_validade": "data no formato YYYY-MM-DD",
  "categoria": "categoria da CNH"
}

Se algum campo não estiver visível, use null. Responda APENAS com o JSON, sem texto adicional.`;
    } else {
      prompt = `Analise esta imagem de veículo e extraia os seguintes dados em formato JSON:
{
  "placa": "placa do veículo no formato brasileiro (XXX-0000 ou XXX0X00)",
  "marca": "marca do veículo (ex: Ford, Chevrolet, Volkswagen)",
  "modelo": "modelo do veículo (ex: Gol, Onix, Corolla)",
  "cor": "cor predominante do veículo"
}

Tente identificar a placa mesmo que esteja parcialmente visível. Se algum campo não puder ser identificado, use null. Responda APENAS com o JSON, sem texto adicional.`;
    }

    // Chamar Lovable AI para análise da imagem
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: image
                }
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente em alguns instantes.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos insuficientes. Adicione créditos ao seu workspace Lovable.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 402 }
        );
      }
      const errorText = await response.text();
      console.error('Erro na API Lovable:', response.status, errorText);
      throw new Error(`Erro na API: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    console.log('Resposta bruta da IA:', content);

    // Extrair JSON da resposta
    let extractedData;
    try {
      // Tentar extrair JSON da resposta (pode vir com texto extra)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        extractedData = JSON.parse(content);
      }
    } catch (e) {
      console.error('Erro ao parsear JSON:', e);
      throw new Error('Não foi possível extrair dados da imagem');
    }

    console.log('Dados extraídos:', extractedData);

    return new Response(
      JSON.stringify(extractedData),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Erro no OCR:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
