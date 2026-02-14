import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function verifyPortalToken(token: string) {
  const jwtSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(jwtSecret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['verify']
  );
  return await verify(token, key);
}

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
    
    let corretoraId: string;
    let userId: string;
    try {
      const payload = await verifyPortalToken(token);
      corretoraId = payload.corretoraId as string;
      userId = payload.userId as string;
      
      if (!corretoraId || !userId) {
        throw new Error('corretoraId ou userId não encontrado no token');
      }
    } catch (e) {
      console.error('Erro ao verificar token:', e);
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (req.method === 'GET') {
      const { data, error } = await supabaseClient
        .from('producao_financeira')
        .select('*')
        .eq('corretora_id', corretoraId)
        .eq('tipo_origem', 'manual')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST') {
      const lancamento = await req.json();

      const { data, error } = await supabaseClient
        .from('producao_financeira')
        .insert({
          ...lancamento,
          corretora_id: corretoraId,
          tipo_origem: 'manual',
          criado_por_usuario_id: userId,
        })
        .select()
        .single();

      if (error) throw error;

      await supabaseClient.from('pid_audit_log').insert({
        corretora_id: corretoraId,
        usuario_id: userId,
        acao: 'CRIAR_LANCAMENTO',
        detalhes: { lancamentoId: data.id },
      });

      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 201 }
      );
    }

    if (req.method === 'PUT') {
      const { id, ...lancamento } = await req.json();

      const { data: existing } = await supabaseClient
        .from('producao_financeira')
        .select('*')
        .eq('id', id)
        .eq('corretora_id', corretoraId)
        .eq('tipo_origem', 'manual')
        .single();

      if (!existing) {
        return new Response(
          JSON.stringify({ error: 'Lançamento não encontrado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      const { data, error } = await supabaseClient
        .from('producao_financeira')
        .update(lancamento)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      await supabaseClient.from('pid_audit_log').insert({
        corretora_id: corretoraId,
        usuario_id: userId,
        acao: 'EDITAR_LANCAMENTO',
        detalhes: { lancamentoId: id },
      });

      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'DELETE') {
      const url = new URL(req.url);
      const id = url.searchParams.get('id');

      const { data: existing } = await supabaseClient
        .from('producao_financeira')
        .select('*')
        .eq('id', id)
        .eq('corretora_id', corretoraId)
        .eq('tipo_origem', 'manual')
        .single();

      if (!existing) {
        return new Response(
          JSON.stringify({ error: 'Lançamento não encontrado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      const { error } = await supabaseClient
        .from('producao_financeira')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await supabaseClient.from('pid_audit_log').insert({
        corretora_id: corretoraId,
        usuario_id: userId,
        acao: 'EXCLUIR_LANCAMENTO',
        detalhes: { lancamentoId: id },
      });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Método não permitido' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
