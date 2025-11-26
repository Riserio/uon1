import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIPE_BASE_URL = 'https://veiculos.fipe.org.br';

// Mapeamento de tipos para o site da FIPE
const TIPO_MAPPING: Record<string, string> = {
  'carros': '1',
  'motos': '2',
  'caminhoes': '3',
};

interface ConsultaFipeRequest {
  tipo: 'carros' | 'motos' | 'caminhoes';
  marcaCodigo?: string;
  modeloCodigo?: string;
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

    const tipoVeiculo = TIPO_MAPPING[tipo];
    if (!tipoVeiculo) {
      throw new Error('Tipo de veículo inválido');
    }

    let url = '';
    let formData: Record<string, string> = {};

    switch (action) {
      case 'marcas':
        url = `${FIPE_BASE_URL}/api/veiculos/ConsultarMarcas`;
        formData = {
          codigoTabelaReferencia: '315',
          codigoTipoVeiculo: tipoVeiculo,
        };
        break;
      
      case 'modelos':
        if (!marcaCodigo) throw new Error('marcaCodigo é obrigatório para consultar modelos');
        url = `${FIPE_BASE_URL}/api/veiculos/ConsultarModelos`;
        formData = {
          codigoTabelaReferencia: '315',
          codigoTipoVeiculo: tipoVeiculo,
          codigoMarca: marcaCodigo,
        };
        break;
      
      case 'anos':
        if (!marcaCodigo || !modeloCodigo) {
          throw new Error('marcaCodigo e modeloCodigo são obrigatórios para consultar anos');
        }
        url = `${FIPE_BASE_URL}/api/veiculos/ConsultarAnoModelo`;
        formData = {
          codigoTabelaReferencia: '315',
          codigoTipoVeiculo: tipoVeiculo,
          codigoMarca: marcaCodigo,
          codigoModelo: modeloCodigo,
        };
        break;
      
      case 'valor':
        if (!marcaCodigo || !modeloCodigo || !anoCodigo) {
          throw new Error('Todos os parâmetros são obrigatórios para consultar valor');
        }
        url = `${FIPE_BASE_URL}/api/veiculos/ConsultarValorComTodosParametros`;
        formData = {
          codigoTabelaReferencia: '315',
          codigoTipoVeiculo: tipoVeiculo,
          codigoMarca: marcaCodigo,
          codigoModelo: modeloCodigo,
          anoModelo: anoCodigo.split('-')[0], // Pega apenas o ano do formato "2024-1"
          codigoTipoCombustivel: anoCodigo.split('-')[1] || '1',
          tipoVeiculo: tipo,
          tipoConsulta: 'tradicional',
        };
        break;
      
      default:
        throw new Error('Action inválida');
    }

    console.log('URL FIPE:', url);
    console.log('FormData:', formData);

    // Fazer requisição POST para a API da FIPE
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': FIPE_BASE_URL,
      },
      body: new URLSearchParams(formData).toString(),
    });

    if (!response.ok) {
      throw new Error(`FIPE API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    console.log('Resposta FIPE:', data);

    // Transformar resposta para formato padronizado
    let result;
    
    if (action === 'marcas') {
      result = data.map((item: any) => ({
        code: parseInt(item.Value),
        name: item.Label,
      }));
    } else if (action === 'modelos') {
      result = data.Modelos.map((item: any) => ({
        code: parseInt(item.Value),
        name: item.Label,
      }));
    } else if (action === 'anos') {
      result = data.map((item: any) => ({
        code: item.Value,
        name: item.Label,
      }));
    } else if (action === 'valor') {
      result = {
        price: data.Valor,
        brand: data.Marca,
        model: data.Modelo,
        modelYear: parseInt(data.AnoModelo),
        fuel: data.Combustivel,
        codeFipe: data.CodigoFipe,
        month: data.MesReferencia,
        year: new Date().getFullYear(),
      };
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
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
