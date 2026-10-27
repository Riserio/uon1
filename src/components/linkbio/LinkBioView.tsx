import { BadgeCheck, Globe, Instagram, Mail, MapPin, MessageCircle, Phone, Star, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type EstiloBotao = "sombra" | "solido" | "contorno";

export interface LinkBioTema {
  cor_fundo?: string;
  cor_texto?: string;
  cor_botao?: string;
  cor_texto_botao?: string;
  cor_sombra?: string;
  estilo_botao?: EstiloBotao;
  mostrar_icones?: boolean;
}

export interface LinkBioItem {
  id: string;
  rotulo: string;
  url: string;
  tipo: string;
  ordem: number;
  ativo: boolean;
  cliques?: number;
}

export interface LinkBioPagina {
  id: string;
  slug: string;
  titulo: string;
  subtitulo: string | null;
  avatar_url: string | null;
  verificado: boolean;
  ativo: boolean;
  tema: LinkBioTema | null;
  visitas?: number;
}

/** Padrão inspirado na página atual da Vangard: laranja com sombra azul-marinho. */
export const TEMA_PADRAO: Required<LinkBioTema> = {
  cor_fundo: "#ffffff",
  cor_texto: "#111827",
  cor_botao: "#FA914F",
  cor_texto_botao: "#ffffff",
  cor_sombra: "#0B3155",
  estilo_botao: "sombra",
  mostrar_icones: false,
};

export const TIPOS_LINK: { value: string; label: string; icon: React.ElementType }[] = [
  { value: "link", label: "Link", icon: Link2 },
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { value: "site", label: "Site", icon: Globe },
  { value: "google", label: "Avaliação Google", icon: Star },
  { value: "mapa", label: "Como chegar", icon: MapPin },
  { value: "instagram", label: "Instagram", icon: Instagram },
  { value: "email", label: "E-mail", icon: Mail },
  { value: "telefone", label: "Telefone", icon: Phone },
];

export function iconeDoTipo(tipo: string) {
  return TIPOS_LINK.find((t) => t.value === tipo)?.icon ?? Link2;
}

export function temaCompleto(t: LinkBioTema | null | undefined): Required<LinkBioTema> {
  return { ...TEMA_PADRAO, ...(t || {}) };
}

interface Props {
  pagina: Pick<LinkBioPagina, "titulo" | "subtitulo" | "avatar_url" | "verificado" | "tema">;
  itens: LinkBioItem[];
  onClickItem?: (item: LinkBioItem) => void;
  /** No preview do editor os links não navegam. */
  preview?: boolean;
  className?: string;
}

export function LinkBioView({ pagina, itens, onClickItem, preview, className }: Props) {
  const tema = temaCompleto(pagina.tema);
  const visiveis = itens.filter((i) => i.ativo && i.rotulo.trim()).sort((a, b) => a.ordem - b.ordem);

  return (
    <div
      className={cn("w-full flex flex-col items-center px-5 pt-12 pb-10", className)}
      style={{ backgroundColor: tema.cor_fundo, color: tema.cor_texto }}
    >
      <div className="relative">
        <div
          className="h-28 w-28 rounded-full overflow-hidden bg-white flex items-center justify-center"
          style={{ boxShadow: "0 0 0 3px rgba(0,0,0,.06)" }}
        >
          {pagina.avatar_url ? (
            <img src={pagina.avatar_url} alt={pagina.titulo} className="h-full w-full object-contain p-2" />
          ) : (
            <span className="text-4xl font-bold opacity-40">{pagina.titulo?.charAt(0) || "?"}</span>
          )}
        </div>
        {pagina.verificado && (
          <BadgeCheck
            className="absolute -bottom-0.5 right-0.5 h-8 w-8"
            style={{ color: "#fff", fill: "#1D9BF0" }}
            aria-label="Verificado"
          />
        )}
      </div>

      <h1 className="mt-5 text-2xl font-bold tracking-wide text-center">{pagina.titulo || "Título"}</h1>
      {pagina.subtitulo && <p className="mt-1 text-lg font-medium text-center">{pagina.subtitulo}</p>}

      <div className="mt-8 w-full max-w-md flex flex-col gap-5">
        {visiveis.map((item) => {
          const Icon = iconeDoTipo(item.tipo);
          const conteudo = (
            <>
              {tema.mostrar_icones && <Icon className="h-5 w-5 shrink-0" />}
              <span className="truncate">{item.rotulo}</span>
            </>
          );
          const estilo = tema.estilo_botao;
          const style: React.CSSProperties =
            estilo === "contorno"
              ? { backgroundColor: "transparent", color: tema.cor_botao, borderColor: tema.cor_botao }
              : {
                  backgroundColor: tema.cor_botao,
                  color: tema.cor_texto_botao,
                  borderColor: estilo === "sombra" ? tema.cor_sombra : tema.cor_botao,
                  boxShadow: estilo === "sombra" ? `8px 8px 0 0 ${tema.cor_sombra}` : undefined,
                };
          const classes =
            "flex items-center justify-center gap-2 w-[calc(100%-8px)] min-h-[56px] px-6 rounded-full border-2 text-lg font-semibold transition-transform active:translate-x-[3px] active:translate-y-[3px] hover:-translate-y-0.5";
          return preview ? (
            <div key={item.id} className={classes} style={style}>
              {conteudo}
            </div>
          ) : (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className={classes}
              style={style}
              onClick={() => onClickItem?.(item)}
            >
              {conteudo}
            </a>
          );
        })}
      </div>
    </div>
  );
}
