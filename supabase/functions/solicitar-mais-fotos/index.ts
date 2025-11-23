import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SolicitarFotosRequest {
  vistoriaId: string;
  motivo: string;
  fotosNecessarias: string[];
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid user' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { vistoriaId, motivo, fotosNecessarias }: SolicitarFotosRequest = await req.json();

    console.log('Solicitando mais fotos para vistoria:', vistoriaId);

    const { data: vistoria, error: vistoriaError } = await supabase
      .from('vistorias')
      .select('*, corretoras(nome, logo_url)')
      .eq('id', vistoriaId)
      .single();

    if (vistoriaError || !vistoria) {
      return new Response(JSON.stringify({ error: 'Vistoria não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error: updateError } = await supabase
      .from('vistorias')
      .update({
        link_expires_at: expiresAt.toISOString(),
        status: 'pendente_novas_fotos',
        observacoes_ia: motivo
      })
      .eq('id', vistoriaId);

    if (updateError) throw updateError;

    const fotosListaHTML = fotosNecessarias.map(foto => `<li>${foto}</li>`).join('');
    const linkVistoria = `${SUPABASE_URL.replace('.supabase.co', '.lovable.app')}/vistoria/${vistoria.link_token}`;
    
    const emailHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:30px;text-align:center;border-radius:10px 10px 0 0}.content{background:#f9fafb;padding:30px;border-radius:0 0 10px 10px}.info-box{background:white;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #667eea}.button{display:inline-block;background:#667eea;color:white;padding:15px 30px;text-decoration:none;border-radius:8px;margin:20px 0;font-weight:bold}.fotos-list{background:#fff3cd;padding:15px;border-radius:8px;border-left:4px solid #ffc107}</style></head><body><div class="container"><div class="header">${vistoria.corretoras?.logo_url ? `<img src="${vistoria.corretoras.logo_url}" alt="Logo" style="max-height:60px;margin-bottom:15px">` : ''}<h1>📸 Mais Fotos Necessárias</h1></div><div class="content"><p>Olá <strong>${vistoria.cliente_nome || 'Cliente'}</strong>,</p><p>Para darmos continuidade à análise da sua vistoria <strong>#${vistoria.numero}</strong>, precisamos de fotos adicionais.</p><div class="info-box"><h3 style="color:#667eea">📋 Motivo:</h3><p>${motivo}</p></div>${fotosNecessarias.length > 0 ? `<div class="fotos-list"><h3>📷 Fotos Necessárias:</h3><ul>${fotosListaHTML}</ul></div>` : ''}<div style="text-align:center"><a href="${linkVistoria}" class="button">🔗 Acessar Vistoria</a></div><p>Link válido por 7 dias. Você pode tirar fotos com câmera ou enviar da galeria.</p></div></div></body></html>`;

    if (vistoria.cliente_email) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Vistoria Digital <onboarding@resend.dev>',
          to: [vistoria.cliente_email],
          subject: `📸 Fotos Adicionais - Vistoria #${vistoria.numero}`,
          html: emailHTML,
        }),
      });
    }

    if (vistoria.atendimento_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('nome')
        .eq('id', user.id)
        .single();

      await supabase.from('atendimentos_historico').insert({
        atendimento_id: vistoria.atendimento_id,
        user_id: user.id,
        user_nome: profile?.nome || 'Sistema',
        acao: 'Solicitação de mais fotos',
        campos_alterados: { fotos_necessarias: fotosNecessarias },
        valores_novos: { motivo, link_renovado: true },
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Solicitação enviada', link: linkVistoria }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in solicitar-mais-fotos:', error);
    return new Response(
      JSON.stringify({ error: 'Erro ao solicitar fotos', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
