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

    // Count Resend emails from our DB for accurate stats
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Monthly sending count
    const { count: monthlySending } = await supabase
      .from('email_historico')
      .select('*', { count: 'exact', head: true })
      .like('corpo', '[Resend]%')
      .eq('status', 'enviado')
      .gte('created_at', startOfMonth);

    // Daily sending count
    const { count: dailySending } = await supabase
      .from('email_historico')
      .select('*', { count: 'exact', head: true })
      .like('corpo', '[Resend]%')
      .eq('status', 'enviado')
      .gte('created_at', startOfDay);

    // Monthly failed
    const { count: monthlyFailed } = await supabase
      .from('email_historico')
      .select('*', { count: 'exact', head: true })
      .like('corpo', '[Resend]%')
      .eq('status', 'erro')
      .gte('created_at', startOfMonth);

    // Daily failed
    const { count: dailyFailed } = await supabase
      .from('email_historico')
      .select('*', { count: 'exact', head: true })
      .like('corpo', '[Resend]%')
      .eq('status', 'erro')
      .gte('created_at', startOfDay);

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
