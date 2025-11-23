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

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const produto = url.searchParams.get('produto');
    const seguradora = url.searchParams.get('seguradora');
    const status = url.searchParams.get('status');
    const ano = url.searchParams.get('ano');
    const mes = url.searchParams.get('mes');

    let query = supabaseClient
      .from('producao_financeira')
      .select('*', { count: 'exact' })
      .eq('corretora_id', corretoraId);

    if (produto) query = query.eq('produto', produto);
    if (seguradora) query = query.eq('seguradora', seguradora);
    if (status) query = query.eq('status', status);
    if (ano && mes) {
      const competenciaInicio = `${ano}-${mes}-01`;
      const competenciaFim = new Date(parseInt(ano), parseInt(mes), 0).toISOString().split('T')[0];
      query = query.gte('competencia', competenciaInicio).lte('competencia', competenciaFim);
    }

    const { data, error, count } = await query
      .order('competencia', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) throw error;

    return new Response(
      JSON.stringify({
        data,
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil((count || 0) / limit),
        },
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
