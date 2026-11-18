import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Download, File, ImageOff, Loader2 } from 'lucide-react';

export const TIPOS_MIDIA_WHATSAPP = ['image', 'audio', 'video', 'document', 'sticker'] as const;

interface MsgMidia {
  id: string;
  type: string;
  media_url: string | null;
  media_mime_type?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw_payload?: any;
}

// Cache de URLs assinadas (valem 1h no servidor; renovamos antes).
const VALIDADE_CACHE_MS = 50 * 60 * 1000;
const cache = new Map<string, { url: string | null; em: number }>();
const pendentes = new Set<string>();

function doCache(id: string) {
  const c = cache.get(id);
  if (!c) return undefined;
  if (Date.now() - c.em > VALIDADE_CACHE_MS) {
    cache.delete(id);
    return undefined;
  }
  return c.url;
}

const ehMidia = (m: MsgMidia) => (TIPOS_MIDIA_WHATSAPP as readonly string[]).includes(m.type);

/**
 * Resolve as URLs (assinadas) das mídias das mensagens em uma só chamada à
 * função `whatsapp-midia`. Mensagens sem mídia são ignoradas.
 * Retorno: id → url | null (indisponível) | undefined (carregando).
 */
export function useWhatsAppMidiaUrls(mensagens: MsgMidia[]) {
  const [urls, setUrls] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const faltando = mensagens
      .filter((m) => ehMidia(m) && doCache(m.id) === undefined && !pendentes.has(m.id))
      .map((m) => m.id);

    // Atualiza o estado com o que já está em cache.
    const doCacheAtual: Record<string, string | null> = {};
    mensagens.forEach((m) => {
      const u = doCache(m.id);
      if (u !== undefined) doCacheAtual[m.id] = u;
    });
    if (Object.keys(doCacheAtual).length) setUrls((prev) => ({ ...prev, ...doCacheAtual }));

    if (!faltando.length) return;
    let ativo = true;
    faltando.forEach((id) => pendentes.add(id));

    (async () => {
      const lotes: string[][] = [];
      for (let i = 0; i < faltando.length; i += 50) lotes.push(faltando.slice(i, i + 50));
      for (const lote of lotes) {
        const { data, error } = await supabase.functions.invoke('whatsapp-midia', {
          body: { message_ids: lote },
        });
        const recebidas: Record<string, string | null> = {};
        lote.forEach((id) => {
          pendentes.delete(id);
          const url = error ? null : (data?.urls?.[id] ?? null);
          // Erro de rede não fica em cache: tenta de novo na próxima abertura.
          if (!error) cache.set(id, { url, em: Date.now() });
          recebidas[id] = url;
        });
        if (ativo) setUrls((prev) => ({ ...prev, ...recebidas }));
      }
    })();

    return () => {
      ativo = false;
    };
  }, [mensagens]);

  return urls;
}

function nomeDocumento(msg: MsgMidia) {
  return msg.raw_payload?.document?.filename || 'Documento';
}

export function WhatsAppMidia({
  msg,
  url,
  saida,
}: {
  msg: MsgMidia;
  url: string | null | undefined;
  saida?: boolean;
}) {
  const [falhou, setFalhou] = useState(false);
  const corSecundaria = saida ? 'text-primary-foreground/80' : 'text-muted-foreground';

  if (url === undefined) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 text-xs mb-1',
          msg.type === 'image' || msg.type === 'video' ? 'h-40 w-56 justify-center rounded-lg bg-muted/60' : 'py-2',
          corSecundaria,
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando {rotulo(msg.type)}…
      </div>
    );
  }

  if (!url || falhou) {
    return (
      <div className={cn('flex items-center gap-2 text-xs italic mb-1 py-1', corSecundaria)}>
        <ImageOff className="h-4 w-4" /> {rotuloMaiusculo(msg.type)} indisponível
      </div>
    );
  }

  switch (msg.type) {
    case 'image':
      return (
        <img
          src={url}
          alt="Imagem"
          loading="lazy"
          className="max-w-full max-h-80 rounded-lg mb-1 cursor-pointer object-contain"
          onClick={() => window.open(url, '_blank')}
          onError={() => setFalhou(true)}
        />
      );
    case 'sticker':
      return <img src={url} alt="Figurinha" loading="lazy" className="max-w-[150px] mb-1" onError={() => setFalhou(true)} />;
    case 'video':
      return (
        <video src={url} controls preload="metadata" className="max-w-full max-h-80 rounded-lg mb-1" onError={() => setFalhou(true)} />
      );
    case 'audio':
      return (
        <div className="mb-1 min-w-[240px]">
          <audio src={url} controls preload="metadata" className="w-full" onError={() => setFalhou(true)} />
          <a href={url} target="_blank" rel="noopener noreferrer" className={cn('inline-flex items-center gap-1 text-[11px] underline mt-1', corSecundaria)}>
            <Download className="h-3 w-3" /> Baixar áudio
          </a>
        </div>
      );
    case 'document':
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-2 mb-1 text-sm',
            saida ? 'bg-primary-foreground/10' : 'bg-muted/60 hover:bg-muted',
          )}
        >
          <File className="h-5 w-5 shrink-0" />
          <span className="truncate max-w-[220px]">{nomeDocumento(msg)}</span>
          <Download className="h-4 w-4 shrink-0 ml-auto" />
        </a>
      );
    default:
      return null;
  }
}

function rotulo(tipo: string) {
  return (
    { image: 'imagem', audio: 'áudio', video: 'vídeo', document: 'documento', sticker: 'figurinha' } as Record<string, string>
  )[tipo] || 'mídia';
}

function rotuloMaiusculo(tipo: string) {
  const r = rotulo(tipo);
  return r.charAt(0).toUpperCase() + r.slice(1);
}
