import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { email, password, nome, corretoraId } = await req.json();

    console.log('Creating partner user:', { email, corretoraId });

    if (!email || !password || !corretoraId) {
      throw new Error('Email, password e corretoraId são obrigatórios');
    }

    // 1. Criar usuário no auth
    const { data: authData, error: authError } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirma email
      user_metadata: {
        nome: nome || email,
      },
    });

    if (authError) {
      console.error('Auth error:', authError);
      throw authError;
    }

    console.log('Auth user created:', authData.user.id);

    // 2. Aguardar um momento para o trigger criar o profile
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verificar se o profile foi criado pelo trigger
    const { data: existingProfile } = await supabaseClient
      .from('profiles')
      .select('id')
      .eq('id', authData.user.id)
      .single();

    if (!existingProfile) {
      // Se o trigger não criou, criar manualmente
      const { error: profileInsertError } = await supabaseClient
        .from('profiles')
        .insert({
          id: authData.user.id,
          email,
          nome: nome || email,
          ativo: true,
          status: 'ativo',
        });

      if (profileInsertError) {
        console.error('Profile insert error:', profileInsertError);
        await supabaseClient.auth.admin.deleteUser(authData.user.id);
        throw profileInsertError;
      }
      console.log('Profile created manually');
    } else {
      // Profile já existe, apenas atualizar status
      const { error: profileError } = await supabaseClient
        .from('profiles')
        .update({
          status: 'ativo',
        })
        .eq('id', authData.user.id);

      if (profileError) {
        console.error('Profile update error:', profileError);
        await supabaseClient.auth.admin.deleteUser(authData.user.id);
        throw profileError;
      }
      console.log('Profile updated with active status');
    }

    // 3. Adicionar role parceiro
    const { error: roleError } = await supabaseClient
      .from('user_roles')
      .insert({
        user_id: authData.user.id,
        role: 'parceiro',
      });

    if (roleError) {
      console.error('Role error:', roleError);
      // Se falhou, deletar profile e usuário
      await supabaseClient.from('profiles').delete().eq('id', authData.user.id);
      await supabaseClient.auth.admin.deleteUser(authData.user.id);
      throw roleError;
    }

    console.log('Role assigned');

    // 4. Vincular à corretora
    const { error: corretoraError } = await supabaseClient
      .from('corretora_usuarios')
      .insert({
        corretora_id: corretoraId,
        email,
        senha_hash: 'managed_by_supabase_auth', // Placeholder, senha gerenciada pelo Supabase
        profile_id: authData.user.id,
        ativo: true,
        acesso_exclusivo_pid: true,
      });

    if (corretoraError) {
      console.error('Corretora link error:', corretoraError);
      // Se falhou, limpar tudo
      await supabaseClient.from('user_roles').delete().eq('user_id', authData.user.id);
      await supabaseClient.from('profiles').delete().eq('id', authData.user.id);
      await supabaseClient.auth.admin.deleteUser(authData.user.id);
      throw corretoraError;
    }

    console.log('Corretora link created');

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId: authData.user.id,
        message: 'Usuário parceiro criado com sucesso'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: any) {
    console.error('Error creating partner user:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
