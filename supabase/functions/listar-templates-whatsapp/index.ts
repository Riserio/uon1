import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const metaToken = Deno.env.get('META_WHATSAPP_TOKEN');
    const metaPhoneNumberId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');
    if (!metaToken || !metaPhoneNumberId) {
      return new Response(JSON.stringify({ error: 'Meta não configurada' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Note: no per-user auth check needed — function only returns the org's
    // Meta-approved WhatsApp templates using server-side credentials.

    // Discover WABA id from phone number
    let wabaId = Deno.env.get('META_WHATSAPP_BUSINESS_ACCOUNT_ID');
    if (!wabaId) {
      const phoneInfoRes = await fetch(
        `https://graph.facebook.com/v22.0/${metaPhoneNumberId}?fields=whatsapp_business_account`,
        { headers: { Authorization: `Bearer ${metaToken}` } },
      );
      const phoneInfo = await phoneInfoRes.json();
      wabaId = phoneInfo?.whatsapp_business_account?.id;
      if (!wabaId) {
        return new Response(JSON.stringify({ error: 'Não foi possível descobrir WABA ID', details: phoneInfo }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Fetch templates
    const tplRes = await fetch(
      `https://graph.facebook.com/v22.0/${wabaId}/message_templates?fields=name,status,language,category,components&limit=200`,
      { headers: { Authorization: `Bearer ${metaToken}` } },
    );
    const tplData = await tplRes.json();
    if (!tplRes.ok) {
      return new Response(JSON.stringify({ error: 'Erro Meta API', details: tplData }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const approved = (tplData.data || []).filter((t: any) => t.status === 'APPROVED');
    return new Response(JSON.stringify({ templates: approved, waba_id: wabaId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});