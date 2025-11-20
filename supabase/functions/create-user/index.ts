import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('=== CREATE USER FUNCTION STARTED ===');
    
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    console.log('1. Supabase admin client created');

    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)

    if (!user) {
      console.error('ERROR: User not authenticated');
      throw new Error('Não autorizado')
    }

    console.log('2. User authenticated:', user.id);

    // Verify user has admin, superintendente or administrativo role
    const { data: userRole, error: roleCheckError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (roleCheckError) {
      console.error('ERROR checking user role:', roleCheckError);
      throw new Error(`Erro ao verificar permissões: ${roleCheckError.message}`)
    }

    console.log('3. User role:', userRole?.role);

    if (!userRole || !['admin', 'superintendente', 'administrativo'].includes(userRole.role)) {
      console.error('ERROR: User does not have permission. Role:', userRole?.role);
      throw new Error('Sem permissão para criar usuários')
    }

    const requestBody = await req.json()
    console.log('4. Request body received:', { 
      resetPassword: requestBody.resetPassword, 
      userId: requestBody.userId,
      email: requestBody.email 
    });

    const { email, password, nome, telefone, cargo, equipe_id, lider_id, administrativo_id, role, equipes, whatsapp, instagram, facebook, linkedin, cpf_cnpj, userId, resetPassword } = requestBody

    // Se for reset de senha
    if (resetPassword && userId) {
      console.log('5. Reset password mode - userId:', userId);
      
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { password }
      )

      if (updateError) {
        console.error('ERROR updating password:', updateError);
        throw new Error(`Erro ao atualizar senha: ${updateError.message}`)
      }

      console.log('6. Password updated successfully');

      // Update profile status to force password change
      const { error: profileUpdateError } = await supabaseAdmin
        .from('profiles')
        .update({ status: 'primeiro_login' })
        .eq('id', userId)

      if (profileUpdateError) {
        console.error('ERROR updating profile status:', profileUpdateError);
        // Não falhar se não conseguir atualizar o status
      }

      console.log('7. Profile status updated');

      return new Response(
        JSON.stringify({ success: true, message: 'Senha resetada com sucesso' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate required fields based on role
    if (role === 'comercial' && !equipe_id) {
      throw new Error('Comercial deve estar vinculado a uma equipe')
    }
    
    if (role === 'lider' && !administrativo_id) {
      throw new Error('Líder deve estar vinculado a um administrativo')
    }

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome }
    })

    if (authError) throw authError

    if (!authData.user) {
      throw new Error('Erro ao criar usuário')
    }

    // Update profile - set status to ativo (user created by admin is already approved)
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        telefone,
        cargo,
        equipe_id: role === 'comercial' ? equipe_id : null,
        lider_id: null, // Comercial não tem lider_id direto, é derivado pela equipe
        administrativo_id: role === 'lider' ? administrativo_id : null,
        whatsapp,
        instagram,
        facebook,
        linkedin,
        cpf_cnpj,
        status: 'ativo'  // User created manually is already approved
      })
      .eq('id', authData.user.id)

    if (profileError) throw profileError

    // Create user role
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert([{
        user_id: authData.user.id,
        role: role
      }])

    if (roleError) throw roleError

    // If leader, associate with teams
    if (role === 'lider' && equipes && equipes.length > 0) {
      const equipeLideresData = equipes.map((equipeId: string) => ({
        lider_id: authData.user.id,
        equipe_id: equipeId
      }))

      const { error: equipeLideresError } = await supabaseAdmin
        .from('equipe_lideres')
        .insert(equipeLideresData)

      if (equipeLideresError) throw equipeLideresError
    }

    return new Response(
      JSON.stringify({ user: authData.user, success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('=== CREATE USER FUNCTION ERROR ===');
    console.error('Error details:', error);
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    // Return generic error message to client, log detailed error server-side
    return new Response(
      JSON.stringify({ 
        error: 'Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.',
        code: 'USER_OPERATION_ERROR'
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
