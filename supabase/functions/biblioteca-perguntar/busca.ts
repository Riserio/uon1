/**
 * Busca dos blocos da base de conhecimento mais relevantes para uma pergunta.
 *
 * BM25 simples, sem embeddings (sem custo extra por pergunta): normaliza
 * acentos, quebra identificadores de código (resumo_base_corretora →
 * resumo, base, corretora), reduz as palavras a um radical curto
 * ("cadastros"/"cadastro" → "cadast") e expande alguns sinônimos do domínio.
 */
import type { Bloco } from "./conhecimento.ts";

const STOP = new Set(
  ("a o as os um uma uns umas de da do das dos em na no nas nos por para pra pro com sem que qual quais " +
    "quem como onde quando porque por que e ou se ao aos à às é ser sao são esta está estao estão isso esse essa " +
    "este esta aquele aquela aqui ali la lá eu voce você me meu minha seu sua ele ela eles elas tem ter tambem também " +
    "mais menos muito pouco ja já nao não sim tudo todo toda todos todas vai vem fazer faz feito ate até sobre entre " +
    "the of and to in is it this that for on").split(/\s+/),
);

// grupos de sinônimos do domínio (radicais já normalizados)
const SINONIMOS: string[][] = [
  ["cadast", "adesao", "contra", "adesoe", "entrad"],
  ["inadim", "atraso", "vencid", "debito"],
  ["placa", "veicul", "frota", "carro"],
  ["boleto", "cobran", "mensal", "fatura"],
  ["sinist", "evento"],
  ["cancel", "churn", "perda", "baixa"],
  ["renova", "reativ"],
  ["sga", "hinova"],
  ["financ", "mgf", "lancam"],
  ["associ", "corret", "parcei"],
  ["sincro", "import", "atuali", "agenda", "cron", "schedu"],
];
const SIN_MAP = new Map<string, string[]>();
for (const g of SINONIMOS) for (const t of g) SIN_MAP.set(t, g.filter((x) => x !== t));

const RADICAL = 6;

export function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Tokens com radical; mantém também identificadores inteiros (ex.: resumo_base_corretora). */
export function tokens(texto: string): string[] {
  const out: string[] = [];
  const bruto = texto
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-zÀ-ÿ0-9_]+/)
    .filter(Boolean);
  for (const w of bruto) {
    const n = normalizar(w);
    if (n.includes("_") && n.length > 4) out.push(n); // identificador completo
    for (const p of n.split("_")) {
      if (p.length < 2 || STOP.has(p) || /^\d+$/.test(p)) continue;
      out.push(p.length > RADICAL ? p.slice(0, RADICAL) : p.replace(/(es|s)$/, "") || p);
      if (p.length > RADICAL) out.push("=" + p); // palavra inteira: casa exato (ex.: sinistralidade ≠ sinistro)
    }
  }
  return out;
}

type Indice = {
  blocos: Bloco[];
  tf: Map<string, number>[];
  textoNorm: string[];
  tituloTf: Set<string>[];
  len: number[];
  df: Map<string, number>;
  media: number;
};

let cache: Indice | null = null;

export function indexar(blocos: Bloco[]): Indice {
  if (cache && cache.blocos === blocos) return cache;
  const tf: Map<string, number>[] = [];
  const textoNorm: string[] = [];
  const tituloTf: Set<string>[] = [];
  const len: number[] = [];
  const df = new Map<string, number>();
  for (const b of blocos) {
    const m = new Map<string, number>();
    const ts = tokens(b.titulo + " " + b.texto);
    for (const t of ts) m.set(t, (m.get(t) || 0) + 1);
    for (const t of m.keys()) df.set(t, (df.get(t) || 0) + 1);
    tf.push(m);
    textoNorm.push(normalizar(b.titulo + " " + b.texto).replace(/[^a-z0-9_]+/g, " "));
    tituloTf.push(new Set(tokens(b.titulo)));
    len.push(ts.length || 1);
  }
  cache = { blocos, tf, textoNorm, tituloTf, len, df, media: len.reduce((a, b) => a + b, 0) / Math.max(1, len.length) };
  return cache;
}

/**
 * Busca + "seguir as referências": se um trecho encontrado chama uma função
 * do banco ou edge function (ex.: o card chama resumo_base_corretora), traz
 * também a definição dela — é o caminho tela → função → tabela que explica
 * de onde o número vem.
 */
export function buscar(blocos: Bloco[], consulta: string, k = 12): { bloco: Bloco; score: number }[] {
  const base = buscarDireto(blocos, consulta, k);
  const porNome = nomesReferenciaveis(blocos);
  const ja = new Set(base.map((r) => r.bloco));
  const extras: { bloco: Bloco; score: number }[] = [];
  for (const r of base.slice(0, 6)) {
    const ids = new Set(r.bloco.texto.match(/\b[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+\b/g) || []);
    for (const id of ids) {
      const alvo = porNome.get(id);
      if (!alvo || ja.has(alvo)) continue;
      ja.add(alvo);
      extras.push({ bloco: alvo, score: r.score * 0.85 });
      if (extras.length >= 4) break;
    }
    if (extras.length >= 4) break;
  }
  return [...base.slice(0, k - extras.length), ...extras].sort((a, b) => b.score - a.score);
}

let nomesCache: { blocos: Bloco[]; mapa: Map<string, Bloco> } | null = null;
function nomesReferenciaveis(blocos: Bloco[]): Map<string, Bloco> {
  if (nomesCache?.blocos === blocos) return nomesCache.mapa;
  const mapa = new Map<string, Bloco>();
  for (const b of blocos) {
    const m = b.titulo.match(/^(?:Função do banco|Função de servidor \(edge function\)): ([\w-]+)(?: \(parte (\d+)\))?$/);
    if (m && (!m[2] || m[2] === "1") && !mapa.has(m[1])) mapa.set(m[1], b);
  }
  nomesCache = { blocos, mapa };
  return mapa;
}

function buscarDireto(blocos: Bloco[], consulta: string, k = 12): { bloco: Bloco; score: number }[] {
  const idx = indexar(blocos);
  const N = blocos.length;
  const pesos = new Map<string, number>();
  for (const t of tokens(consulta)) {
    const w = t.startsWith("=") ? 1.5 : 1;
    pesos.set(t, Math.max(pesos.get(t) || 0, w));
    for (const s of SIN_MAP.get(t) || []) pesos.set(s, Math.max(pesos.get(s) || 0, 0.5));
  }
  // expressões da pergunta ("cadastros do mes", "data contrato"): 2–3 palavras
  // seguidas, começando e terminando em palavra de conteúdo
  const palavras = normalizar(consulta).replace(/[^a-z0-9_]+/g, " ").trim().split(" ").filter(Boolean);
  const frases = new Set<string>();
  for (let i = 0; i < palavras.length; i++) {
    if (STOP.has(palavras[i])) continue;
    for (let n = 2; n <= 3 && i + n <= palavras.length; n++) {
      const fim = palavras[i + n - 1];
      if (STOP.has(fim) || fim.length < 3) continue;
      frases.add(" " + palavras.slice(i, i + n).join(" ") + " ");
    }
  }
  const k1 = 1.2;
  const bParam = 0.6;
  const res: { bloco: Bloco; score: number }[] = [];
  for (let i = 0; i < N; i++) {
    let s = 0;
    let acertos = 0;
    for (const [t, w] of pesos) {
      const f = idx.tf[i].get(t);
      if (!f) continue;
      acertos++;
      const df = idx.df.get(t) || 0;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      s += w * idf * ((f * (k1 + 1)) / (f + k1 * (1 - bParam + (bParam * idx.len[i]) / idx.media)));
      if (idx.tituloTf[i].has(t)) s += w * idf * 0.8; // termo no título vale mais
    }
    if (frases.size) {
      const txt = " " + idx.textoNorm[i] + " ";
      for (const f of frases) if (txt.includes(f)) s += 6;
    }
    // tabelas puras (só lista de colunas) ajudam, mas não devem dominar
    if (blocos[i].tipo === "tabela") s *= 0.7;
    if (s > 0 && acertos > 0) res.push({ bloco: blocos[i], score: s });
  }
  res.sort((a, b) => b.score - a.score);
  // evita 5 partes do mesmo arquivo ocupando todo o contexto
  const porOrigem = new Map<string, number>();
  const out: { bloco: Bloco; score: number }[] = [];
  for (const r of res) {
    const n = porOrigem.get(r.bloco.origem + r.bloco.titulo.replace(/ \(parte \d+\)$/, "")) || 0;
    if (n >= 3) continue;
    porOrigem.set(r.bloco.origem + r.bloco.titulo.replace(/ \(parte \d+\)$/, ""), n + 1);
    out.push(r);
    if (out.length >= k) break;
  }
  return out;
}
