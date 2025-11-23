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
    // Verificar JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Token não fornecido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const key = await crypto.subtle.generateKey(
      { name: "HMAC", hash: "SHA-512" },
      true,
      ["sign", "verify"]
    );

    const payload = await verify(token, key);
    const corretoraId = payload.corretoraId;

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    const ano = url.searchParams.get('ano') || new Date().getFullYear().toString();
    const mes = url.searchParams.get('mes') || (new Date().getMonth() + 1).toString().padStart(2, '0');

    // Filtrar por competência
    const competenciaInicio = `${ano}-${mes}-01`;
    const competenciaFim = new Date(parseInt(ano), parseInt(mes), 0).toISOString().split('T')[0];

    // Buscar dados da produção
    const { data: producao, error } = await supabaseClient
      .from('producao_financeira')
      .select('*')
      .eq('corretora_id', corretoraId)
      .gte('competencia', competenciaInicio)
      .lte('competencia', competenciaFim);

    if (error) throw error;

    // Calcular KPIs
    const faturamento = producao.reduce((acc, item) => acc + (parseFloat(item.premio_total) || 0), 0);
    const comissoes = producao.reduce((acc, item) => acc + (parseFloat(item.valor_comissao) || 0), 0);
    const repassePrevisto = producao.reduce((acc, item) => acc + (parseFloat(item.repasse_previsto) || 0), 0);
    const repassePago = producao.reduce((acc, item) => acc + (parseFloat(item.repasse_pago) || 0), 0);

    return new Response(
      JSON.stringify({
        periodo: { ano, mes },
        kpis: {
          faturamento: faturamento.toFixed(2),
          comissoes: comissoes.toFixed(2),
          repassePrevisto: repassePrevisto.toFixed(2),
          repassePago: repassePago.toFixed(2),
          repassePendente: (repassePrevisto - repassePago).toFixed(2),
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
