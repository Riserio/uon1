import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

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

    // Fetch domains to get usage info
    const domainsRes = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });
    const domainsData = await domainsRes.json();

    // Fetch emails sent today and this month using the Resend API
    // The Resend API doesn't have a direct "usage" endpoint on free tier,
    // so we'll query our own email_historico for Resend-method emails
    // and return domain info
    return new Response(JSON.stringify({
      domains: domainsData?.data || [],
      api_key_configured: true,
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
