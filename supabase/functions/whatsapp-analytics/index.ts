import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const metaToken = Deno.env.get('META_WHATSAPP_TOKEN');
    const wabaId = Deno.env.get('META_WHATSAPP_WABA_ID');

    if (!metaToken || !wabaId) {
      return new Response(JSON.stringify({ error: 'META_WHATSAPP_TOKEN ou META_WHATSAPP_WABA_ID não configurados' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const startTs = url.searchParams.get('start');
    const endTs = url.searchParams.get('end');
    const granularity = url.searchParams.get('granularity') || 'DAILY';

    if (!startTs || !endTs) {
      return new Response(JSON.stringify({ error: 'start e end são obrigatórios (unix timestamps)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch conversation analytics
    const conversationUrl = `https://graph.facebook.com/v22.0/${wabaId}?fields=conversation_analytics.start(${startTs}).end(${endTs}).granularity(${granularity}).conversation_categories([]).conversation_types([]).dimensions(CONVERSATION_CATEGORY,CONVERSATION_TYPE)&access_token=${metaToken}`;

    // Fetch message analytics
    const analyticsUrl = `https://graph.facebook.com/v22.0/${wabaId}?fields=analytics.start(${startTs}).end(${endTs}).granularity(${granularity})&access_token=${metaToken}`;

    const [convRes, analyticsRes] = await Promise.all([
      fetch(conversationUrl),
      fetch(analyticsUrl),
    ]);

    const convData = await convRes.json();
    const analyticsData = await analyticsRes.json();

    if (!convRes.ok) {
      console.error('[whatsapp-analytics] Conv error:', JSON.stringify(convData));
      return new Response(JSON.stringify({
        error: convData?.error?.message || 'Erro ao buscar analytics de conversas',
        meta_error: convData?.error,
      }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      conversation_analytics: convData.conversation_analytics || null,
      analytics: analyticsData.analytics || null,
      waba_id: wabaId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[whatsapp-analytics] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
