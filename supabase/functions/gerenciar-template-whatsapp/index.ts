import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GRAPH = 'https://graph.facebook.com/v22.0';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function discoverWaba(metaToken: string, phoneNumberId: string): Promise<string | null> {
  const envWaba = Deno.env.get('META_WHATSAPP_BUSINESS_ACCOUNT_ID');
  if (envWaba) return envWaba;
  const r = await fetch(
    `${GRAPH}/${phoneNumberId}?fields=whatsapp_business_account`,
    { headers: { Authorization: `Bearer ${metaToken}` } },
  );
  const d = await r.json();
  return d?.whatsapp_business_account?.id || null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const metaToken = Deno.env.get('META_WHATSAPP_TOKEN');
    const phoneNumberId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');
    if (!metaToken || !phoneNumberId) {
      return json({ error: 'Meta não configurada' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').toLowerCase();
    if (!['create', 'update', 'delete', 'get'].includes(action)) {
      return json({ error: 'action inválido (use create|update|delete|get)' }, 400);
    }

    const wabaId = await discoverWaba(metaToken, phoneNumberId);
    if (!wabaId) return json({ error: 'Não foi possível descobrir WABA ID' }, 500);

    if (action === 'create') {
      const { name, language, category, components } = body;
      if (!name || !language || !category || !Array.isArray(components)) {
        return json({ error: 'name, language, category e components são obrigatórios' }, 400);
      }
      const r = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${metaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, language, category, components }),
      });
      const d = await r.json();
      if (!r.ok) return json({ error: 'Erro Meta API', details: d }, 502);
      return json({ ok: true, data: d });
    }

    if (action === 'update') {
      const { template_id, components } = body;
      if (!template_id || !Array.isArray(components)) {
        return json({ error: 'template_id e components são obrigatórios' }, 400);
      }
      const r = await fetch(`${GRAPH}/${template_id}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${metaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ components }),
      });
      const d = await r.json();
      if (!r.ok) return json({ error: 'Erro Meta API', details: d }, 502);
      return json({ ok: true, data: d });
    }

    if (action === 'delete') {
      const { name, template_id } = body;
      if (!name) return json({ error: 'name é obrigatório' }, 400);
      const url = new URL(`${GRAPH}/${wabaId}/message_templates`);
      url.searchParams.set('name', name);
      if (template_id) url.searchParams.set('hsm_id', String(template_id));
      const r = await fetch(url.toString(), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${metaToken}` },
      });
      const d = await r.json();
      if (!r.ok) return json({ error: 'Erro Meta API', details: d }, 502);
      return json({ ok: true, data: d });
    }

    // get: lista atualizada (com status)
    const r = await fetch(
      `${GRAPH}/${wabaId}/message_templates?fields=name,status,language,category,components,rejected_reason,id&limit=200`,
      { headers: { Authorization: `Bearer ${metaToken}` } },
    );
    const d = await r.json();
    if (!r.ok) return json({ error: 'Erro Meta API', details: d }, 502);
    return json({ templates: d.data || [], waba_id: wabaId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown';
    return json({ error: msg }, 500);
  }
});