import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

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

    const { email, password, nome, corretoraId, modulos_bi } = await req.json();

    // Módulos padrão se não informados
    const modulosBi = modulos_bi || ['indicadores', 'eventos', 'mgf', 'cobranca', 'estudo-base'];

    console.log('Creating/linking partner user:', { email, corretoraId, modulosBi });

    if (!email || !corretoraId) {
      throw new Error('Email e corretoraId são obrigatórios');
    }

    // Verificar se já existe vínculo com esta corretora
    const { data: existingLink } = await supabaseClient
      .from('corretora_usuarios')
      .select('id, profile_id, ativo')
      .eq('corretora_id', corretoraId)
      .eq('email', email)
      .single();

    if (existingLink) {
      // Já existe vínculo - reativar se inativo
      if (!existingLink.ativo) {
        await supabaseClient
          .from('corretora_usuarios')
          .update({ ativo: true })
          .eq('id', existingLink.id);
        
        console.log('Reactivated existing link');
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          userId: existingLink.profile_id,
          message: 'Usuário já vinculado a esta associação',
          alreadyLinked: true
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Verificar se o usuário já existe no auth
    const { data: existingUsers } = await supabaseClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);

    let userId: string;

    if (existingUser) {
      // Usuário já existe - usar ID existente
      console.log('User already exists in auth:', existingUser.id);
      userId = existingUser.id;

      // Verificar/atualizar profile
      const { data: existingProfile } = await supabaseClient
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single();

      if (!existingProfile) {
        // Criar profile se não existe
        await supabaseClient
          .from('profiles')
          .insert({
            id: userId,
            email,
            nome: nome || email,
            ativo: true,
            status: 'ativo',
          });
        console.log('Profile created for existing user');
      }

      // Verificar/adicionar role parceiro
      const { data: existingRole } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

      if (!existingRole) {
        await supabaseClient
          .from('user_roles')
          .insert({
            user_id: userId,
            role: 'parceiro',
          });
        console.log('Parceiro role added to existing user');
      }

    } else {
      // Criar novo usuário
      if (!password) {
        throw new Error('Senha é obrigatória para novos usuários');
      }

      const { data: authData, error: authError } = await supabaseClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          nome: nome || email,
        },
      });

      if (authError) {
        console.error('Auth error:', authError);
        throw authError;
      }

      console.log('Auth user created:', authData.user.id);
      userId = authData.user.id;

      // Aguardar trigger criar profile
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verificar se o profile foi criado
      const { data: existingProfile } = await supabaseClient
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single();

      if (!existingProfile) {
        const { error: profileInsertError } = await supabaseClient
          .from('profiles')
          .insert({
            id: userId,
            email,
            nome: nome || email,
            ativo: true,
            status: 'ativo',
          });

        if (profileInsertError) {
          console.error('Profile insert error:', profileInsertError);
          await supabaseClient.auth.admin.deleteUser(userId);
          throw profileInsertError;
        }
        console.log('Profile created manually');
      } else {
        await supabaseClient
          .from('profiles')
          .update({ status: 'ativo' })
          .eq('id', userId);
        console.log('Profile updated with active status');
      }

      // Adicionar role parceiro
      const { error: roleError } = await supabaseClient
        .from('user_roles')
        .insert({
          user_id: userId,
          role: 'parceiro',
        });

      if (roleError) {
        console.error('Role error:', roleError);
        await supabaseClient.from('profiles').delete().eq('id', userId);
        await supabaseClient.auth.admin.deleteUser(userId);
        throw roleError;
      }
      console.log('Role assigned');
    }

    // Vincular à corretora
    const { error: corretoraError } = await supabaseClient
      .from('corretora_usuarios')
      .insert({
        corretora_id: corretoraId,
        email,
        senha_hash: 'managed_by_supabase_auth',
        profile_id: userId,
        ativo: true,
        acesso_exclusivo_pid: true,
        modulos_bi: modulosBi,
      });

    if (corretoraError) {
      console.error('Corretora link error:', corretoraError);
      throw corretoraError;
    }

    console.log('Corretora link created');

    // === Enviar email de boas-vindas ===
    try {
      // Buscar nome da corretora
      const { data: corretora } = await supabaseClient
        .from('corretoras')
        .select('nome, slug')
        .eq('id', corretoraId)
        .single();

      // Buscar template de boas-vindas ativo (de qualquer admin)
      const { data: template } = await supabaseClient
        .from('email_templates')
        .select('assunto, corpo')
        .eq('tipo', 'boas_vindas')
        .eq('ativo', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (template) {
        const portalUrl = corretora?.slug
          ? `https://uon1.lovable.app/portal/${corretora.slug}/login`
          : 'https://uon1.lovable.app';

        // Substituir variáveis do template
        const replaceVars = (text: string) =>
          text
            .replace(/\{nome_usuario\}/g, nome || email)
            .replace(/\{nome_corretora\}/g, corretora?.nome || '')
            .replace(/\{link_portal\}/g, portalUrl);

        const assunto = replaceVars(template.assunto);
        const corpo = replaceVars(template.corpo);

        // Buscar config Resend
        const { data: resendConfig } = await supabaseClient
          .from('resend_config')
          .select('from_email, from_name')
          .limit(1)
          .single();

        const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
        if (RESEND_API_KEY) {
          const resend = new Resend(RESEND_API_KEY);
          const fromEmail = resendConfig?.from_email || 'noreply@resend.dev';
          const fromName = resendConfig?.from_name || 'Portal PID';

          const result = await resend.emails.send({
            from: `${fromName} <${fromEmail}>`,
            to: email,
            subject: assunto,
            html: corpo,
          });

          console.log('[boas-vindas] Email sent:', result);

          // Registrar no histórico
          await supabaseClient.from('email_historico').insert({
            assunto,
            corpo,
            destinatario: email,
            enviado_por: userId,
            status: result.error ? 'erro' : 'enviado',
            erro_mensagem: result.error?.message || null,
            enviado_em: new Date().toISOString(),
          });
        } else {
          console.warn('[boas-vindas] RESEND_API_KEY not configured, skipping email');
        }
      } else {
        console.log('[boas-vindas] No active welcome template found, skipping email');
      }
    } catch (emailErr: any) {
      console.error('[boas-vindas] Error sending welcome email:', emailErr.message);
      // Não bloquear criação do usuário por falha no email
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId,
        message: existingUser ? 'Usuário existente vinculado à associação' : 'Usuário parceiro criado com sucesso'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: any) {
    console.error('Error creating partner user:', error);
    
    let errorMessage = error.message || 'Erro ao criar usuário parceiro';
    
    if (error.message?.includes('already been registered')) {
      errorMessage = 'Este email já está cadastrado no sistema.';
    } else if (error.code === '23505') {
      errorMessage = 'Este usuário já está vinculado a esta associação.';
    } else if (error.code === '23503') {
      errorMessage = 'Erro ao vincular usuário. Tente novamente.';
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
