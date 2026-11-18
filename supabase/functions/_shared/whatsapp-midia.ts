// Mídias recebidas pelo WhatsApp (Meta Cloud API).
//
// A URL que a Meta devolve para uma mídia (lookaside.fbsbx.com) exige o token
// no header e expira em ~5 min — um <img>/<audio> no navegador nunca consegue
// abri-la. Por isso baixamos o arquivo no servidor e guardamos no bucket
// PRIVADO `whatsapp-midia`; em whatsapp_messages.media_url fica só o marcador
// `storage://whatsapp-midia/<caminho>`, e a tela pede URLs assinadas à função
// `whatsapp-midia` (que respeita o RLS das mensagens).
//
// O bucket é criado aqui sob demanda (service role), sem depender de migração.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export const BUCKET_MIDIA = 'whatsapp-midia';
export const PREFIXO_STORAGE = `storage://${BUCKET_MIDIA}/`;
const TIPOS_MIDIA = ['image', 'audio', 'video', 'document', 'sticker'];
const LIMITE_BYTES = 100 * 1024 * 1024; // documentos da Meta vão até 100 MB

let bucketVerificado = false;

async function garantirBucket(supabase: SupabaseClient) {
  if (bucketVerificado) return;
  const { data } = await supabase.storage.getBucket(BUCKET_MIDIA);
  if (!data) {
    const { error } = await supabase.storage.createBucket(BUCKET_MIDIA, {
      public: false,
      fileSizeLimit: LIMITE_BYTES,
    });
    if (error && !/already exists/i.test(error.message || '')) throw error;
  }
  bucketVerificado = true;
}

const EXTENSOES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr',
  'video/mp4': 'mp4', 'video/3gpp': '3gp',
  'application/pdf': 'pdf',
};

function extensao(mime: string | null, nomeArquivo?: string | null): string {
  const base = (mime || '').split(';')[0].trim().toLowerCase();
  if (EXTENSOES[base]) return EXTENSOES[base];
  const doNome = nomeArquivo?.split('.').pop();
  if (doNome && doNome.length <= 5 && doNome !== nomeArquivo) return doNome.toLowerCase();
  return 'bin';
}

/** Lê o id/mime/nome da mídia de um payload de mensagem da Meta. */
// deno-lint-ignore no-explicit-any
export function midiaDoPayload(raw: any): { id: string; mime: string | null; nome: string | null } | null {
  if (!raw || !TIPOS_MIDIA.includes(raw.type)) return null;
  const m = raw[raw.type];
  if (!m?.id) return null;
  return { id: String(m.id), mime: m.mime_type || null, nome: m.filename || null };
}

/**
 * Baixa a mídia da Meta e grava no bucket. Devolve o marcador `storage://...`
 * para gravar em media_url, ou null se não deu (mídia expirada, sem token...).
 */
export async function salvarMidiaWhatsApp(
  supabase: SupabaseClient,
  mediaId: string,
  mime: string | null,
  nomeArquivo?: string | null,
): Promise<string | null> {
  const token = Deno.env.get('META_WHATSAPP_TOKEN');
  if (!token || !mediaId) return null;
  try {
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meta = await metaRes.json().catch(() => null);
    if (!metaRes.ok || !meta?.url) {
      console.warn('[whatsapp-midia] Meta não devolveu URL da mídia', mediaId, meta?.error?.message);
      return null;
    }
    const arqRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!arqRes.ok) {
      console.warn('[whatsapp-midia] Falha ao baixar mídia', mediaId, arqRes.status);
      return null;
    }
    const bytes = new Uint8Array(await arqRes.arrayBuffer());
    if (bytes.byteLength > LIMITE_BYTES) return null;

    const tipo = (meta.mime_type || mime || arqRes.headers.get('content-type') || 'application/octet-stream')
      .split(';')[0].trim();
    const mes = new Date().toISOString().slice(0, 7);
    const caminho = `in/${mes}/${mediaId}.${extensao(tipo, nomeArquivo)}`;

    await garantirBucket(supabase);
    const { error } = await supabase.storage.from(BUCKET_MIDIA).upload(caminho, bytes, {
      contentType: tipo,
      upsert: true,
    });
    if (error) {
      console.error('[whatsapp-midia] Erro no upload', caminho, error.message);
      return null;
    }
    return PREFIXO_STORAGE + caminho;
  } catch (err) {
    console.error('[whatsapp-midia] Erro ao salvar mídia', mediaId, err);
    return null;
  }
}
