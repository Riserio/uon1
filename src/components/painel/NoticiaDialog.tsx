import { useState } from "react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowUpRight, Copy, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CAMPO_RADAR, logoFonte, PONTO_RADAR, TIPO_RADAR, type ItemRadar } from "./radar";

function LogoGrande({ item }: { item: ItemRadar }) {
  const [falhou, setFalhou] = useState(false);
  const src = logoFonte(item.host);
  return (
    <span className="h-14 w-14 rounded-2xl bg-white shadow-sm flex items-center justify-center shrink-0 overflow-hidden text-slate-700">
      {item.tipo === "comunicado" ? (
        <Megaphone className="h-6 w-6" />
      ) : src && !falhou ? (
        <img src={src} alt="" className="h-9 w-9 object-contain" onError={() => setFalhou(true)} />
      ) : (
        <span className="text-lg font-bold">{item.origem.slice(0, 1)}</span>
      )}
    </span>
  );
}

/**
 * Leitura da notícia sem sair da tela. Os sites de origem (Google Notícias,
 * Câmara, STJ...) não deixam a página deles ser aberta dentro de outra, então
 * o popup mostra o resumo e, ao lado, as outras notícias da mesma fonte; a
 * matéria completa abre no site.
 */
export function NoticiaDialog({
  item,
  relacionadas = [],
  onTrocar,
  onFechar,
}: {
  item: ItemRadar | null;
  relacionadas?: ItemRadar[];
  onTrocar?: (i: ItemRadar) => void;
  onFechar: () => void;
}) {
  const outras = item ? relacionadas.filter((r) => r.id !== item.id && (r.host === item.host || r.tipo === item.tipo)).slice(0, 4) : [];
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0 max-h-[90vh] flex flex-col">
        {item && (
          <>
            <div className={`relative bg-gradient-to-br ${CAMPO_RADAR[item.tipo]} text-white px-6 pt-6 pb-5`}>
              {item.imagem && <img src={item.imagem} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
              <div className="relative flex items-center gap-3">
                <LogoGrande item={item} />
                <div className="min-w-0">
                  <p className="font-semibold truncate">{item.origem}</p>
                  <p className="text-xs text-white/75">
                    {TIPO_RADAR[item.tipo]}, {format(parseISO(item.data), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </p>
                </div>
              </div>
              <DialogTitle className="relative mt-4 text-2xl font-bold leading-snug tracking-tight text-balance">{item.titulo}</DialogTitle>
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              <DialogDescription className="text-[15px] leading-relaxed text-foreground/85 whitespace-pre-wrap">
                {item.resumo || "A fonte não publica resumo desta notícia. Abra a matéria para ler o texto completo."}
              </DialogDescription>

              <div className="flex flex-wrap gap-2">
                {item.link && (
                  <Button asChild className="rounded-full">
                    <a href={item.link} target="_blank" rel="noopener noreferrer">
                      {item.tipo === "comunicado" ? "Abrir link" : "Ler a matéria completa"} <ArrowUpRight className="h-4 w-4 ml-1" />
                    </a>
                  </Button>
                )}
                {item.link && (
                  <Button
                    variant="outline"
                    className="rounded-full"
                    onClick={() => navigator.clipboard.writeText(item.link!).then(() => toast.success("Link copiado"))}
                  >
                    <Copy className="h-4 w-4 mr-1" /> Copiar link
                  </Button>
                )}
              </div>

              {outras.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-xs font-semibold text-muted-foreground mt-3 mb-1">Mais desta fonte</p>
                  <ul>
                    {outras.map((o) => (
                      <li key={o.id}>
                        <button type="button" onClick={() => onTrocar?.(o)} className="w-full text-left flex items-start gap-2.5 rounded-xl px-2 py-2 hover:bg-muted/60 transition-colors">
                          <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${PONTO_RADAR[o.tipo]}`} />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium leading-snug line-clamp-2">{o.titulo}</span>
                            <span className="block text-xs text-muted-foreground">{formatDistanceToNow(parseISO(o.data), { addSuffix: true, locale: ptBR })}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
