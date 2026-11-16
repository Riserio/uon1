// Radar do mercado: tipos e leitura das notícias, usados no painel e na
// página pública /radar. Leitura em páginas: só busca mais quando a pessoa
// rola até o fim da lista.
import { supabase } from "@/integrations/supabase/client";

export type TipoRadar = "oficial" | "setor" | "comunicado";

export interface ItemRadar {
  id: string;
  tipo: TipoRadar;
  titulo: string;
  resumo: string | null;
  link: string | null;
  origem: string;
  host: string | null;
  imagem: string | null;
  data: string;
  /** id em mercado_noticias (null para comunicado interno) */
  noticiaId: string | null;
}

export const TIPO_RADAR: Record<TipoRadar, string> = {
  oficial: "Órgão oficial",
  setor: "Setor",
  comunicado: "Comunicado interno",
};
export const PONTO_RADAR: Record<TipoRadar, string> = {
  oficial: "bg-blue-500",
  setor: "bg-fuchsia-500",
  comunicado: "bg-amber-500",
};
/** Campo de cor do destaque: cada origem tem a sua. */
export const CAMPO_RADAR: Record<TipoRadar, string> = {
  oficial: "from-indigo-950 via-indigo-800 to-blue-600",
  setor: "from-violet-950 via-purple-800 to-fuchsia-600",
  comunicado: "from-amber-900 via-orange-700 to-amber-500",
};

export const POR_PAGINA = 12;
export const logoFonte = (host: string | null) => (host ? `https://www.google.com/s2/favicons?domain=${host}&sz=128` : null);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Uma página de notícias, da mais nova para a mais antiga. */
export async function paginaNoticias(pagina: number, categoria: "oficial" | "setor" | null): Promise<ItemRadar[]> {
  let q = db
    .from("mercado_noticias")
    .select("id, categoria, titulo, resumo, link, origem, origem_host, publicado_em")
    .eq("oculto", false)
    .in("categoria", ["oficial", "setor"])
    .order("publicado_em", { ascending: false })
    .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
  if (categoria) q = q.eq("categoria", categoria);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as {
    id: string;
    categoria: "oficial" | "setor";
    titulo: string;
    resumo: string | null;
    link: string;
    origem: string | null;
    origem_host: string | null;
    publicado_em: string;
  }[]).map((n) => ({
    id: n.id,
    tipo: n.categoria,
    titulo: n.titulo,
    resumo: n.resumo,
    link: n.link,
    origem: n.origem ?? TIPO_RADAR[n.categoria],
    host: n.origem_host,
    imagem: null,
    data: n.publicado_em,
    noticiaId: n.id,
  }));
}

export async function ultimaColetaRadar(): Promise<string | null> {
  const { data } = await db.rpc("mercado_radar_ultima_coleta");
  return (data as string | null) ?? null;
}

/** Endereço público do Radar (para o Instagram e afins). */
export function urlRadarPublico(base: string) {
  return `${base.replace(/\/$/, "")}/radar`;
}

export interface ComunicadoRadar {
  id: string;
  titulo: string;
  mensagem: string;
  link?: string | null;
  imagem_url?: string | null;
  created_at: string;
  publico?: boolean;
}

/** Comunicado no formato de item do Radar. */
export function comunicadoParaItem(c: ComunicadoRadar, origem: string): ItemRadar {
  return {
    id: `c-${c.id}`,
    tipo: "comunicado",
    titulo: c.titulo,
    resumo: c.mensagem,
    link: c.link ?? null,
    origem,
    host: null,
    imagem: c.imagem_url ?? null,
    data: c.created_at,
    noticiaId: null,
  };
}

/**
 * Comunicados entram na fila normal, pela data: se chega uma notícia mais
 * nova, o comunicado desce uma posição. Enquanto houver notícias por carregar,
 * só entram os comunicados mais novos que a última notícia já carregada (os
 * mais antigos aparecem quando a lista chegar até a data deles).
 */
export function mesclarPorData(comunicados: ItemRadar[], noticias: ItemRadar[], temMais: boolean): ItemRadar[] {
  const maisAntiga = noticias.length ? noticias[noticias.length - 1].data : "";
  return [...comunicados.filter((c) => !temMais || c.data >= maisAntiga), ...noticias].sort((a, b) => b.data.localeCompare(a.data));
}

/** Comunicados marcados como "interno e externo", para a página pública. */
export async function comunicadosPublicosRadar(): Promise<ItemRadar[]> {
  const { data, error } = await db.rpc("radar_comunicados_publicos", { p_limite: 30 });
  if (error) throw error;
  return ((data ?? []) as ComunicadoRadar[]).map((c) => comunicadoParaItem(c, "Vangard Gestora"));
}
