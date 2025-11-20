import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HistoricoRequest {
  atendimento_id: string;
  acao: string;
  campos_alterados?: string[];
  valores_anteriores?: Record<string, any>;
  valores_novos?: Record<string, any>;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid user' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user profile to get user name
    const { data: profile } = await supabase
      .from('profiles')
      .select('nome')
      .eq('id', user.id)
      .single();

    const { atendimento_id, acao, campos_alterados, valores_anteriores, valores_novos }: HistoricoRequest = await req.json();

    const { error: insertError } = await supabase
      .from('atendimentos_historico')
      .insert({
        atendimento_id,
        user_id: user.id,
        user_nome: profile?.nome || user.email || 'Usuário',
        acao,
        campos_alterados: campos_alterados || null,
        valores_anteriores: valores_anteriores || null,
        valores_novos: valores_novos || null,
      });

    if (insertError) {
      console.error('Error inserting history:', insertError);
      throw insertError;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in registrar-historico-atendimento:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Erro ao registrar histórico. Por favor, tente novamente.',
        code: 'HISTORY_ERROR'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(handler);
