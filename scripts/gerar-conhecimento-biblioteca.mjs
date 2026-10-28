#!/usr/bin/env node
/**
 * Gera a base de conhecimento usada pelo "Pergunte à Biblioteca"
 * (edge function `biblioteca-perguntar`).
 *
 * Lê o PRÓPRIO código do uon1 — funções do banco (migrations), agendamentos
 * (cron), edge functions, comentários dos componentes, mapeamentos de colunas
 * das importações, tabelas e o conteúdo das ajudas — e quebra tudo em blocos
 * pesquisáveis. É isso que permite responder "o que essa função faz e de onde
 * vem o dado" com base no que o sistema realmente faz.
 *
 * Uso: node scripts/gerar-conhecimento-biblioteca.mjs
 * Saída: supabase/functions/biblioteca-perguntar/conhecimento.ts
 *
 * Roda sozinho no GitHub Actions a cada push na main
 * (.github/workflows/biblioteca-conhecimento.yml).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "supabase/functions/biblioteca-perguntar/conhecimento.ts");
const CHUNK = 2600; // caracteres por bloco (granularidade da busca)

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const read = (p) => fs.readFileSync(p, "utf8");

function walk(dir, filter, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", ".git", "dist"].includes(e.name)) continue;
      walk(p, filter, acc);
    } else if (filter(p)) acc.push(p);
  }
  return acc;
}

/** Remove tokens/segredos que possam estar no código (JWTs, chaves). */
function redigir(t) {
  return t
    .replace(/eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g, "[token]")
    .replace(/\b(sk|pk|rk)_(live|test)_[\w]{10,}/g, "[chave]")
    .replace(/(api[_-]?key|token|secret|senha|password)(["']?\s*[:=]\s*["'])[^"']{12,}(["'])/gi, "$1$2[redigido]$3");
}

const blocos = [];
function add(tipo, titulo, origem, texto) {
  texto = redigir(String(texto || "").replace(/\n{3,}/g, "\n\n").trim());
  if (texto.length < 40) return;
  if (texto.length <= CHUNK) {
    blocos.push({ tipo, titulo, origem, texto });
    return;
  }
  // quebra em linhas, respeitando o tamanho do bloco
  const linhas = texto.split("\n");
  let atual = "";
  let parte = 1;
  const flush = () => {
    if (atual.trim().length >= 40) blocos.push({ tipo, titulo: `${titulo} (parte ${parte})`, origem, texto: atual.trim() });
    parte++;
    atual = "";
  };
  for (const l of linhas) {
    if (atual.length + l.length + 1 > CHUNK && atual) flush();
    atual += (atual ? "\n" : "") + l.slice(0, CHUNK);
  }
  flush();
}

/* ------------------------------------------------------------------ */
/* 1. Funções do banco e agendamentos (estado final das migrations)     */
/* ------------------------------------------------------------------ */
const migrations = walk(path.join(ROOT, "supabase/migrations"), (p) => p.endsWith(".sql")).sort();
const funcoes = new Map();
const crons = new Map();
for (const f of migrations) {
  const s = read(f);
  const reFn = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?(\w+)"?\s*\(/gi;
  let m;
  while ((m = reFn.exec(s))) {
    const ini = m.index;
    const dm = /AS\s+(\$\w*\$)/i.exec(s.slice(ini, ini + 4000));
    if (!dm) continue;
    const delim = dm[1];
    const corpo = ini + dm.index + dm[0].length;
    const fim = s.indexOf(delim, corpo);
    if (fim < 0) continue;
    const pv = s.indexOf(";", fim);
    // comentário logo antes da função (-- linhas), se houver
    const antes = s.slice(Math.max(0, ini - 1500), ini).split("\n");
    const coment = [];
    for (let i = antes.length - 1; i >= 0; i--) {
      const l = antes[i].trim();
      if (l.startsWith("--")) coment.unshift(l.replace(/^--\s?/, ""));
      else if (l === "" && coment.length === 0) continue;
      else break;
    }
    funcoes.set(m[1], { def: s.slice(ini, pv + 1), coment: coment.join("\n"), arquivo: rel(f) });
  }
  for (const u of s.matchAll(/cron\.unschedule\(\s*'([^']+)'/gi)) crons.delete(u[1]);
  for (const c of s.matchAll(/cron\.schedule\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(\$\w*\$|')([\s\S]*?)\3\s*\)/gi)) {
    const alvo = (c[4].match(/functions\/v1\/([\w-]+)/) || [])[1] || c[4].replace(/\s+/g, " ").trim().slice(0, 200);
    crons.set(c[1], { quando: c[2], alvo, arquivo: rel(f) });
  }
}
for (const [nome, f] of funcoes) {
  add("funcao_banco", `Função do banco: ${nome}`, f.arquivo, (f.coment ? f.coment + "\n\n" : "") + f.def);
}
if (crons.size) {
  const linhas = [...crons].map(
    ([n, c]) => `- ${n}: agenda cron "${c.quando}" (horário UTC; Brasília = UTC-3) → executa ${c.alvo}`,
  );
  add(
    "agendamento",
    "Agendamentos automáticos (cron do banco)",
    "supabase/migrations",
    "Rotinas automáticas no banco (pg_cron), conforme o estado final das migrations. Rotinas de backfill " +
      "podem se desligar sozinhas ao concluir; o estado real fica na tabela cron.job.\n" + linhas.join("\n"),
  );
}

/* ------------------------------------------------------------------ */
/* 2. Edge functions: comentários, tabelas/RPCs usadas, mapeamentos     */
/* ------------------------------------------------------------------ */
function comentarios(src) {
  const out = [];
  for (const m of src.matchAll(/\/\*\*?([\s\S]*?)\*\//g)) {
    const t = m[1].split("\n").map((l) => l.replace(/^\s*\*\s?/, "")).join("\n").trim();
    if (t.length > 60) out.push(t);
  }
  // blocos de // com 2+ linhas seguidas
  let bloco = [];
  for (const l of src.split("\n")) {
    const t = l.trim();
    if (t.startsWith("//") && !t.startsWith("///")) bloco.push(t.replace(/^\/\/\s?/, ""));
    else {
      if (bloco.length >= 2 && bloco.join(" ").length > 80) out.push(bloco.join("\n"));
      bloco = [];
    }
  }
  return out;
}
function usos(src) {
  const tabelas = new Set([...src.matchAll(/\.from\(\s*["'`](\w+)["'`]/g)].map((m) => m[1]));
  const rpcs = new Set([...src.matchAll(/\.rpc\(\s*["'`](\w+)["'`]/g)].map((m) => m[1]));
  const fns = new Set([...src.matchAll(/functions\.invoke\(\s*["'`]([\w-]+)["'`]/g)].map((m) => m[1]));
  const partes = [];
  if (tabelas.size) partes.push("Tabelas lidas/gravadas: " + [...tabelas].join(", "));
  if (rpcs.size) partes.push("Funções do banco chamadas (rpc): " + [...rpcs].join(", "));
  if (fns.size) partes.push("Edge functions chamadas: " + [...fns].join(", "));
  return partes.join("\n");
}
function mapeamentos(src) {
  // "DATA CONTRATO": "data_contrato"  |  campo: g(v, "a", "b")  |  campo: pick(v, "a")
  const out = [];
  for (const l of src.split("\n")) {
    const t = l.trim();
    if (/^"[A-ZÀ-Ú0-9][A-ZÀ-Ú0-9 /._()º°-]{2,}"\s*:\s*"[a-z_0-9]+"/.test(t)) out.push(t);
    else if (/^\w+\s*:\s*.*\b(g|pick|get)\(\s*\w+\s*,\s*["']/.test(t)) out.push(t);
  }
  return out;
}

const edgeDir = path.join(ROOT, "supabase/functions");
for (const nome of fs.readdirSync(edgeDir)) {
  const idx = path.join(edgeDir, nome, "index.ts");
  if (!fs.existsSync(idx) || nome === "biblioteca-perguntar") continue;
  const src = read(idx);
  const partes = [];
  const cs = comentarios(src);
  if (cs.length) partes.push(cs.join("\n\n"));
  const u = usos(src);
  if (u) partes.push(u);
  const mp = mapeamentos(src);
  if (mp.length) partes.push("Mapeamento de campos (origem → campo gravado):\n" + mp.join("\n"));
  add("edge_function", `Função de servidor (edge function): ${nome}`, rel(idx), partes.join("\n\n"));
}

/* ------------------------------------------------------------------ */
/* 3. Front-end: comentários explicativos, consultas e mapeamentos      */
/* ------------------------------------------------------------------ */
const front = walk(path.join(ROOT, "src"), (p) => /\.(tsx?|jsx?)$/.test(p)).filter(
  (p) => !/src[\\/](components[\\/]ui|integrations)[\\/]/.test(p) && !/treinamentoContent|biAjuda/.test(p),
);
for (const f of front.sort()) {
  const src = read(f);
  const cs = comentarios(src);
  const u = usos(src);
  const mp = mapeamentos(src);
  if (!cs.length && !mp.length && !u) continue;
  // rótulos visíveis na tela ajudam a achar o arquivo pelo nome que o usuário vê
  const rotulos = [...new Set([...src.matchAll(/>\s*([A-ZÀ-Úa-zà-ú][^<>{}\n]{3,60}?)\s*</g)].map((m) => m[1].trim()))]
    .filter((r) => /[a-zà-ú]/.test(r) && r.split(" ").length <= 8)
    .slice(0, 40);
  const partes = [];
  if (rotulos.length) partes.push("Textos exibidos na tela: " + rotulos.join(" · "));
  if (cs.length) partes.push(cs.join("\n\n"));
  if (u) partes.push(u);
  if (mp.length) partes.push("Mapeamento de colunas (planilha/SGA → campo):\n" + mp.join("\n"));
  if (!cs.length && !mp.length) continue; // só consultas, sem explicação: pouco útil
  add("tela", `Tela/componente: ${rel(f).replace(/^src\//, "")}`, rel(f), partes.join("\n\n"));
}

/* ------------------------------------------------------------------ */
/* 4. Tabelas do banco (colunas)                                        */
/* ------------------------------------------------------------------ */
const typesPath = path.join(ROOT, "src/integrations/supabase/types.ts");
if (fs.existsSync(typesPath)) {
  const t = read(typesPath);
  const tablesIni = t.indexOf("Tables: {");
  const viewsIni = t.indexOf("Views: {", tablesIni);
  const sec = t.slice(tablesIni, viewsIni > 0 ? viewsIni : undefined);
  for (const m of sec.matchAll(/\n {6}(\w+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/g)) {
    const cols = [...m[2].matchAll(/^\s+(\w+)\??: ([^\n]+)/gm)].map((c) => `${c[1]} (${c[2].trim()})`);
    add("tabela", `Tabela do banco: ${m[1]}`, "src/integrations/supabase/types.ts", `Colunas da tabela ${m[1]}: ${cols.join(", ")}`);
  }
}

/* ------------------------------------------------------------------ */
/* 5. Conteúdo das ajudas (Central de Ajuda + Ajuda do BI)              */
/* ------------------------------------------------------------------ */
async function importarTs(arquivo) {
  const esbuild = await import("esbuild");
  const r = await esbuild.build({
    entryPoints: [arquivo],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    external: ["lucide-react", "react"],
    alias: { "@": path.join(ROOT, "src") },
    logLevel: "silent",
  });
  const tmp = path.join(ROOT, "node_modules/.cache-biblioteca-" + path.basename(arquivo) + ".mjs");
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, r.outputFiles[0].text);
  try {
    return await import(pathToFileURL(tmp).href + "?t=" + Date.now());
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

try {
  const { HELP_MODULES } = await importarTs(path.join(ROOT, "src/data/treinamentoContent.ts"));
  for (const mod of HELP_MODULES) {
    for (const tp of mod.topics) {
      add(
        "ajuda",
        `Guia ${mod.title}: ${tp.title}`,
        "src/data/treinamentoContent.ts",
        `${mod.title} — ${mod.description}\n${tp.title}\n` +
          tp.steps.map((s, i) => `${i + 1}. ${s}`).join("\n") +
          (tp.tip ? `\nDica: ${tp.tip}` : ""),
      );
    }
  }
} catch (e) {
  console.warn("[biblioteca] não consegui ler treinamentoContent:", e.message);
}

try {
  const aj = await importarTs(path.join(ROOT, "src/content/biAjuda.ts"));
  if (aj.AJUDA_VISAO_GERAL) {
    add("ajuda", `Ajuda do BI: ${aj.AJUDA_VISAO_GERAL.titulo}`, "src/content/biAjuda.ts", JSON.stringify(aj.AJUDA_VISAO_GERAL, null, 1));
  }
  for (const s of aj.AJUDA_SECOES || []) {
    const txt = [
      `${s.titulo}: ${s.resumo}`,
      s.origem?.length ? "Origem dos dados:\n- " + s.origem.join("\n- ") : "",
      s.atualizacao?.length ? "Atualização:\n- " + s.atualizacao.join("\n- ") : "",
      s.regras?.length ? "Regras de cálculo:\n" + s.regras.map((r) => `- ${r.titulo}: ${r.texto}`).join("\n") : "",
      s.graficos?.length ? "Gráficos:\n" + s.graficos.map((g) => `- ${g.titulo}: ${g.mostra} Fonte: ${g.fonte}${g.observacao ? " Obs.: " + g.observacao : ""}`).join("\n") : "",
      s.foraDaApi?.length ? "Fora da API:\n- " + s.foraDaApi.join("\n- ") : "",
      s.duvidas?.length ? "Dúvidas comuns:\n" + s.duvidas.map((d) => `- ${d.pergunta} ${d.resposta}`).join("\n") : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    add("ajuda", `Ajuda do BI: ${s.titulo}`, "src/content/biAjuda.ts", txt);
  }
} catch (e) {
  console.warn("[biblioteca] não consegui ler biAjuda:", e.message);
}

/* ------------------------------------------------------------------ */
/* 6. Documentos (README, docs/*.md)                                    */
/* ------------------------------------------------------------------ */
const docs = [
  ...walk(path.join(ROOT, "docs"), (p) => p.endsWith(".md")),
  ...fs.readdirSync(ROOT).filter((n) => n.endsWith(".md")).map((n) => path.join(ROOT, n)),
];
for (const d of docs) {
  const secoes = read(d).split(/\n(?=#{1,3} )/);
  for (const s of secoes) {
    const titulo = (s.match(/^#{1,3} (.+)/) || [, path.basename(d)])[1];
    add("documento", `Documento ${path.basename(d)}: ${titulo}`, rel(d), s);
  }
}

/* ------------------------------------------------------------------ */
const cab = `// ARQUIVO GERADO — não edite à mão.
// Gerado por scripts/gerar-conhecimento-biblioteca.mjs a partir do código do uon1.
// ${blocos.length} blocos.
export type Bloco = { tipo: string; titulo: string; origem: string; texto: string };
const BLOCOS: Bloco[] = `;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, cab + JSON.stringify(blocos) + ";\nexport default BLOCOS;\n");
const porTipo = blocos.reduce((a, b) => ((a[b.tipo] = (a[b.tipo] || 0) + 1), a), {});
console.log(`[biblioteca] ${blocos.length} blocos → ${rel(OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`, porTipo);
