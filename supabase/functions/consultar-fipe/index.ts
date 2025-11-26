import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

// Função para buscar a tabela de referência mais recente
async function getLatestReferenceTable(): Promise<string> {
  const response = await fetch(
    `${FIPE_BASE_URL}/api/veiculos/ConsultarTabelaDeReferencia`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer': FIPE_BASE_URL,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`FIPE Reference Table API error: ${response.status}`);
  }

  const refTables = await response.json();
  const latestTable = refTables[0]?.Codigo;
  
  console.log('Using reference table:', latestTable);
  
  if (!latestTable) {
    throw new Error('No reference table found');
  }
  
  return latestTable;
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

    // Buscar tabela de referência mais recente
    const latestTable = await getLatestReferenceTable();

    let url = '';
    let requestBody: Record<string, any> = {
      codigoTabelaReferencia: latestTable,
      codigoTipoVeiculo: parseInt(tipoVeiculo),
    };

    switch (action) {
      case 'marcas':
        url = `${FIPE_BASE_URL}/api/veiculos/ConsultarMarcas`;
        break;
      
      case 'modelos':
        if (!marcaCodigo) throw new Error('marcaCodigo é obrigatório para consultar modelos');
        url = `${FIPE_BASE_URL}/api/veiculos/ConsultarModelos`;
        requestBody.codigoMarca = parseInt(marcaCodigo);
        break;
      
      case 'anos':
        if (!marcaCodigo || !modeloCodigo) {
          throw new Error('marcaCodigo e modeloCodigo são obrigatórios para consultar anos');
        }
        url = `${FIPE_BASE_URL}/api/veiculos/ConsultarAnoModelo`;
        requestBody.codigoMarca = parseInt(marcaCodigo);
        requestBody.codigoModelo = parseInt(modeloCodigo);
        break;
      
      case 'valor':
        if (!marcaCodigo || !modeloCodigo || !anoCodigo) {
          throw new Error('Todos os parâmetros são obrigatórios para consultar valor');
        }
        
        // Split yearId to get year and fuel code
        const [year, fuelCode] = anoCodigo.split('-');
        
        url = `${FIPE_BASE_URL}/api/veiculos/ConsultarValorComTodosParametros`;
        requestBody.codigoMarca = parseInt(marcaCodigo);
        requestBody.codigoModelo = parseInt(modeloCodigo);
        requestBody.anoModelo = parseInt(year);
        requestBody.codigoTipoCombustivel = parseInt(fuelCode);
        requestBody.tipoConsulta = 'tradicional';
        break;
      
      default:
        throw new Error('Action inválida');
    }

    console.log('URL FIPE:', url);
    console.log('Request Body:', requestBody);

    // Fazer requisição POST para a API da FIPE
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer': FIPE_BASE_URL,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('FIPE API error response:', errorText);
      throw new Error(`FIPE API error: ${response.status}`);
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
