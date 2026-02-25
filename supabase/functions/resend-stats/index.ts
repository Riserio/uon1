import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch domains
    const domainsRes = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });
    const domainsData = await domainsRes.json();

    // Fetch actual usage from Resend API
    let monthlySending = 0;
    let dailySending = 0;
    let monthlyFailed = 0;
    let dailyFailed = 0;

    try {
      // Get emails from Resend API directly for accurate stats
      const now = new Date();
      
      // Count from email_historico for stats (since Resend free tier only keeps 1 day of logs)
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      // Monthly counts
      const { count: mSending } = await supabase
        .from('email_historico')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'enviado')
        .gte('created_at', startOfMonth);
      monthlySending = mSending || 0;

      const { count: mFailed } = await supabase
        .from('email_historico')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'erro')
        .gte('created_at', startOfMonth);
      monthlyFailed = mFailed || 0;

      // Daily counts
      const { count: dSending } = await supabase
        .from('email_historico')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'enviado')
        .gte('created_at', startOfDay);
      dailySending = dSending || 0;

      const { count: dFailed } = await supabase
        .from('email_historico')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'erro')
        .gte('created_at', startOfDay);
      dailyFailed = dFailed || 0;
    } catch (err) {
      console.error('Error fetching email stats:', err);
    }

    return new Response(JSON.stringify({
      domains: domainsData?.data || [],
      api_key_configured: true,
      monthly: {
        sending: monthlySending || 0,
        failed: monthlyFailed || 0,
        limit: 3000,
      },
      daily: {
        sending: dailySending || 0,
        failed: dailyFailed || 0,
        limit: 100,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
