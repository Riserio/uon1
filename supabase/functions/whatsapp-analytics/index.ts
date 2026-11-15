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

    // A Meta removeu o campo conversation_analytics (cobrança por conversa).
    // Desde a cobrança por mensagem, o custo vem de pricing_analytics.
    const pricingUrl = `https://graph.facebook.com/v22.0/${wabaId}?fields=pricing_analytics.start(${startTs}).end(${endTs}).granularity(${granularity}).dimensions(["PRICING_CATEGORY","PRICING_TYPE"])&access_token=${metaToken}`;

    // Fetch message analytics
    const analyticsUrl = `https://graph.facebook.com/v22.0/${wabaId}?fields=analytics.start(${startTs}).end(${endTs}).granularity(${granularity})&access_token=${metaToken}`;

    const [pricingRes, analyticsRes] = await Promise.all([
      fetch(pricingUrl),
      fetch(analyticsUrl),
    ]);

    const pricingData = await pricingRes.json().catch(() => ({}));
    const analyticsData = await analyticsRes.json().catch(() => ({}));

    // Falha na Meta não derruba o painel: devolve aviso e o painel usa o custo estimado.
    const avisos: string[] = [];
    if (!pricingRes.ok) {
      console.error('[whatsapp-analytics] Pricing error:', JSON.stringify(pricingData));
      avisos.push(pricingData?.error?.message || 'Erro ao buscar custos na Meta');
    }
    if (!analyticsRes.ok) {
      console.error('[whatsapp-analytics] Analytics error:', JSON.stringify(analyticsData));
    }

    // Mantém o formato que o painel já lê (conversation_analytics.data[0].data_points).
    type PricingPoint = { start: number; end: number; volume?: number; cost?: number; pricing_category?: string; pricing_type?: string };
    const pontos: PricingPoint[] = (pricingData?.pricing_analytics?.data ?? [])
      .flatMap((d: { data_points?: PricingPoint[] }) => d.data_points ?? []);
    const conversationAnalytics = pricingRes.ok
      ? {
          data: [{
            data_points: pontos.map((p) => ({
              start: p.start,
              end: p.end,
              conversation: p.volume ?? 0,
              cost: p.cost ?? 0,
              conversation_category: p.pricing_category,
              conversation_type: p.pricing_type,
            })),
          }],
        }
      : null;

    return new Response(JSON.stringify({
      conversation_analytics: conversationAnalytics,
      aviso: avisos.length ? avisos.join(' · ') : null,
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
