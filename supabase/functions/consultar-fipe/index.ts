import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIPE_API_BASE = 'https://parallelum.com.br/fipe/api/v2';

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

    let url = `${FIPE_API_BASE}/${tipo}`;

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