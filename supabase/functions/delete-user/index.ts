import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Validate caller identity
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check caller has admin/superintendente/administrativo role
    const { data: callerRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!callerRole || !['admin', 'superintendente', 'administrativo'].includes(callerRole.role)) {
      return new Response(JSON.stringify({ error: 'Sem permissão' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { userId } = await req.json()
    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId é obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Prevent self-deletion
    if (userId === user.id) {
      return new Response(JSON.stringify({ error: 'Não é possível excluir seu próprio usuário' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`[delete-user] Caller ${user.id} deleting user ${userId}`)

    // 1. Remove user_roles
    const { error: rolesErr } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
    if (rolesErr) console.error('[delete-user] Error deleting user_roles:', rolesErr)

    // 2. Remove equipe_lideres
    const { error: equipeErr } = await supabaseAdmin
      .from('equipe_lideres')
      .delete()
      .eq('lider_id', userId)
    if (equipeErr) console.error('[delete-user] Error deleting equipe_lideres:', equipeErr)

    // 3. Remove corretora_usuarios links
    const { error: corretoraErr } = await supabaseAdmin
      .from('corretora_usuarios')
      .delete()
      .eq('profile_id', userId)
    if (corretoraErr) console.error('[delete-user] Error deleting corretora_usuarios:', corretoraErr)

    // 4. Inactivate profile
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .update({ ativo: false, status: 'inativo' })
      .eq('id', userId)

    if (profileErr) {
      console.error('[delete-user] Error updating profile:', profileErr)
      return new Response(JSON.stringify({ error: 'Erro ao inativar perfil: ' + profileErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`[delete-user] User ${userId} successfully inactivated`)

    return new Response(
      JSON.stringify({ success: true, message: 'Usuário excluído (inativado) com sucesso' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('[delete-user] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})