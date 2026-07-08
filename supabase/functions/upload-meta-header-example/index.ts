import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v22.0";

// ============================================================================
// upload-meta-header-example
//
// A Meta exige, para aprovar um template com HEADER tipo DOCUMENT (PDF), um
// arquivo de exemplo enviado via "Resumable Upload API" — o retorno dessa
// API (`header_handle`) é o que vai em `components[HEADER].example.header_handle`
// na criação/edição do template (ver gerenciar-template-whatsapp).
//
// A Resumable Upload API exige o ID do App da Meta (não confundir com o
// WABA ID nem o phone_number_id). Em vez de exigir um novo secret, este
// endpoint descobre o app_id automaticamente a partir do próprio
// META_WHATSAPP_TOKEN já configurado, via `GET /debug_token`.
// ============================================================================

async function discoverAppId(metaToken: string): Promise<string> {
  const r = await fetch(
    `${GRAPH}/debug_token?input_token=${encodeURIComponent(metaToken)}&access_token=${encodeURIComponent(metaToken)}`,
  );
  const d = await r.json();
  const appId = d?.data?.app_id;
  if (!appId) {
    throw new Error(
      "Não foi possível descobrir o App ID da Meta a partir do token configurado (META_WHATSAPP_TOKEN).",
    );
  }
  return String(appId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const metaToken = Deno.env.get("META_WHATSAPP_TOKEN");
    if (!metaToken) throw new Error("META_WHATSAPP_TOKEN não configurado");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    let corretoraIdParaExemplo: string | undefined = body?.corretora_id;

    // Sem corretora informada: usa a primeira cadastrada como fonte do PDF de exemplo.
    // A Meta só precisa de um arquivo real no formato certo para revisar o
    // template — o conteúdo específico não importa para a aprovação.
    if (!corretoraIdParaExemplo) {
      const { data: primeira } = await supabase.from("corretoras").select("id").order("nome").limit(1).maybeSingle();
      corretoraIdParaExemplo = primeira?.id;
    }
    if (!corretoraIdParaExemplo) throw new Error("Nenhuma corretora disponível para gerar o PDF de exemplo");

    // 1) Gera o PDF de exemplo (mesmo gerador usado em produção — garante que
    //    a Meta aprove exatamente o formato/layout que será enviado de verdade).
    const pdfRes = await fetch(`${supabaseUrl}/functions/v1/gerar-pdf-resumo-geral`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
      body: JSON.stringify({ corretora_id: corretoraIdParaExemplo }),
    });
    const pdfJson = await pdfRes.json();
    if (!pdfRes.ok || !pdfJson?.success) {
      throw new Error(pdfJson?.error || "Falha ao gerar PDF de exemplo");
    }
    const { url: pdfUrl, filename } = pdfJson;

    // 2) Baixa os bytes do PDF recém-gerado
    const fileRes = await fetch(pdfUrl);
    if (!fileRes.ok) throw new Error("Falha ao baixar o PDF de exemplo gerado");
    const fileBytes = new Uint8Array(await fileRes.arrayBuffer());

    // 3) Descobre o App ID e abre uma sessão de upload resumível
    const appId = await discoverAppId(metaToken);
    const sessionRes = await fetch(
      `${GRAPH}/${appId}/uploads?file_length=${fileBytes.length}&file_type=application/pdf&file_name=${encodeURIComponent(filename)}&access_token=${encodeURIComponent(metaToken)}`,
      { method: "POST" },
    );
    const sessionJson = await sessionRes.json();
    if (!sessionRes.ok || !sessionJson?.id) {
      throw new Error(sessionJson?.error?.message || "Falha ao abrir sessão de upload na Meta (Resumable Upload API)");
    }
    const uploadSessionId = sessionJson.id as string; // formato "upload:XYZ..."

    // 4) Envia os bytes do arquivo na sessão aberta
    const uploadRes = await fetch(`${GRAPH}/${uploadSessionId}`, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${metaToken}`,
        file_offset: "0",
        "Content-Type": "application/pdf",
      },
      body: fileBytes,
    });
    const uploadJson = await uploadRes.json();
    if (!uploadRes.ok || !uploadJson?.h) {
      throw new Error(uploadJson?.error?.message || "Falha ao enviar bytes do PDF de exemplo para a Meta");
    }

    return new Response(
      JSON.stringify({
        success: true,
        header_handle: uploadJson.h,
        example_url: pdfUrl,
        filename,
        corretora_id: corretoraIdParaExemplo,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("[upload-meta-header-example] Erro:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
