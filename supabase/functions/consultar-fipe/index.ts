import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIPE_API_BASE = 'https://fipe.parallelum.com.br/api/v2';

// Mapeamento de tipos PT -> EN para a API FIPE
const TIPO_MAPPING: Record<string, string> = {
  'carros': 'cars',
  'motos': 'motorcycles',
  'caminhoes': 'trucks',
};

interface ConsultaFipeRequest {
  tipo: 'carros' | 'motos' | 'caminhoes';
  marcaCodigo?: number;
  modeloCodigo?: number;
  anoCodigo?: string;
  action: 'marcas' | 'modelos' | 'anos' | 'valor';
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tipo, marcaCodigo, modeloCodigo, anoCodigo, action }: ConsultaFipeRequest = await req.json();

    console.log('Consultando FIPE:', { tipo, marcaCodigo, modeloCodigo, anoCodigo, action });

    // Converter tipo PT para EN
    const tipoEN = TIPO_MAPPING[tipo] || tipo;
    let url = `${FIPE_API_BASE}/${tipoEN}`;

    switch (action) {
      case 'marcas':
        url += '/brands';
        break;
      
      case 'modelos':
        if (!marcaCodigo) throw new Error('marcaCodigo é obrigatório para consultar modelos');
        url += `/brands/${marcaCodigo}/models`;
        break;
      
      case 'anos':
        if (!marcaCodigo || !modeloCodigo) {
          throw new Error('marcaCodigo e modeloCodigo são obrigatórios para consultar anos');
        }
        url += `/brands/${marcaCodigo}/models/${modeloCodigo}/years`;
        break;
      
      case 'valor':
        if (!marcaCodigo || !modeloCodigo || !anoCodigo) {
          throw new Error('Todos os parâmetros são obrigatórios para consultar valor');
        }
        url += `/brands/${marcaCodigo}/models/${modeloCodigo}/years/${anoCodigo}`;
        break;
      
      default:
        throw new Error('Action inválida');
    }

    console.log('Consultando URL:', url);

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`FIPE API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    console.log('Resposta FIPE:', data);

    return new Response(
      JSON.stringify({ success: true, data }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Erro ao consultar FIPE:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro ao consultar FIPE';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});