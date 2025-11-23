import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Token não fornecido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Decodificar JWT sem verificação (verify_jwt = false no config)
    let corretoraId: string;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      corretoraId = payload.corretoraId;
      
      if (!corretoraId) {
        throw new Error('corretoraId não encontrado no token');
      }
    } catch (e) {
      console.error('Erro ao decodificar token:', e);
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Últimos 12 meses
    const dataInicio = new Date();
    dataInicio.setMonth(dataInicio.getMonth() - 12);
    const competenciaInicio = dataInicio.toISOString().split('T')[0];

    const { data: producao, error } = await supabaseClient
      .from('producao_financeira')
      .select('*')
      .eq('corretora_id', corretoraId)
      .gte('competencia', competenciaInicio)
      .order('competencia', { ascending: true });

    if (error) throw error;

    // Agrupar por mês
    const producaoPorMes = producao.reduce((acc, item) => {
      const mes = item.competencia.substring(0, 7); // YYYY-MM
      if (!acc[mes]) acc[mes] = 0;
      acc[mes] += parseFloat(item.premio_total) || 0;
      return acc;
    }, {});

    // Agrupar por produto
    const producaoPorProduto = producao.reduce((acc, item) => {
      const produto = item.produto || 'Outros';
      if (!acc[produto]) acc[produto] = 0;
      acc[produto] += parseFloat(item.premio_total) || 0;
      return acc;
    }, {});

    // Agrupar por seguradora
    const producaoPorSeguradora = producao.reduce((acc, item) => {
      const seguradora = item.seguradora || 'Outros';
      if (!acc[seguradora]) acc[seguradora] = 0;
      acc[seguradora] += parseFloat(item.premio_total) || 0;
      return acc;
    }, {});

    return new Response(
      JSON.stringify({
        producaoPorMes: Object.entries(producaoPorMes).map(([mes, valor]) => ({
          mes,
          valor,
        })),
        producaoPorProduto: Object.entries(producaoPorProduto).map(([produto, valor]) => ({
          produto,
          valor,
        })),
        producaoPorSeguradora: Object.entries(producaoPorSeguradora).map(([seguradora, valor]) => ({
          seguradora,
          valor,
        })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
