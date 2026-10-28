import { Fragment, type ReactNode } from "react";

/**
 * Renderizador de Markdown mínimo e seguro (sem HTML cru) para as respostas
 * da Biblioteca: títulos, parágrafos, listas, **negrito**, *itálico* e `código`.
 */
function inline(texto: string, chave: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) out.push(texto.slice(ultimo, m.index));
    const t = m[0];
    const k = `${chave}-${i++}`;
    if (t.startsWith("`")) {
      out.push(
        <code key={k} className="rounded-md bg-primary/[0.07] px-1.5 py-0.5 font-mono text-[0.85em] text-primary">
          {t.slice(1, -1)}
        </code>,
      );
    } else if (t.startsWith("**")) {
      out.push(
        <strong key={k} className="font-semibold text-foreground">
          {t.slice(2, -2)}
        </strong>,
      );
    } else {
      out.push(<em key={k}>{t.slice(1, -1)}</em>);
    }
    ultimo = m.index + t.length;
  }
  if (ultimo < texto.length) out.push(texto.slice(ultimo));
  return out;
}

export function Markdown({ texto }: { texto: string }) {
  const linhas = texto.replace(/\r/g, "").split("\n");
  const blocos: ReactNode[] = [];
  let lista: { ordenada: boolean; itens: { nivel: number; texto: string }[] } | null = null;
  let paragrafo: string[] = [];

  const fecharParagrafo = () => {
    if (!paragrafo.length) return;
    const k = `p${blocos.length}`;
    blocos.push(
      <p key={k} className="leading-relaxed">
        {paragrafo.map((l, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            {inline(l, `${k}-${i}`)}
          </Fragment>
        ))}
      </p>,
    );
    paragrafo = [];
  };
  const fecharLista = () => {
    if (!lista) return;
    const k = `l${blocos.length}`;
    const Tag = lista.ordenada ? "ol" : "ul";
    blocos.push(
      <Tag key={k} className={lista.ordenada ? "list-decimal space-y-1.5 pl-5" : "space-y-1.5"}>
        {lista.itens.map((it, i) =>
          lista!.ordenada ? (
            <li key={i} className="pl-1 leading-relaxed">
              {inline(it.texto, `${k}-${i}`)}
            </li>
          ) : (
            <li key={i} className="flex gap-2.5 leading-relaxed" style={{ paddingLeft: it.nivel * 18 }}>
              <span className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent-brand" />
              <span>{inline(it.texto, `${k}-${i}`)}</span>
            </li>
          ),
        )}
      </Tag>,
    );
    lista = null;
  };

  for (const bruta of linhas) {
    const l = bruta.replace(/\s+$/, "");
    const h = l.match(/^(#{1,4})\s+(.*)/);
    const ul = l.match(/^(\s*)[-*•]\s+(.*)/);
    const ol = l.match(/^(\s*)\d+[.)]\s+(.*)/);
    if (!l.trim()) {
      fecharParagrafo();
      fecharLista();
    } else if (h) {
      fecharParagrafo();
      fecharLista();
      const k = `h${blocos.length}`;
      blocos.push(
        <h4 key={k} className="pt-1 font-serif text-[1.05rem] font-semibold text-foreground">
          {inline(h[2].replace(/\*\*/g, ""), k)}
        </h4>,
      );
    } else if (ul || ol) {
      fecharParagrafo();
      const ordenada = !!ol && !ul;
      const m = (ul || ol)!;
      if (lista && lista.ordenada !== ordenada) fecharLista();
      if (!lista) lista = { ordenada, itens: [] };
      lista.itens.push({ nivel: Math.min(2, Math.floor(m[1].length / 2)), texto: m[2] });
    } else if (lista && /^\s{2,}/.test(bruta)) {
      lista.itens[lista.itens.length - 1].texto += " " + l.trim();
    } else {
      fecharLista();
      paragrafo.push(l);
    }
  }
  fecharParagrafo();
  fecharLista();
  return <div className="space-y-3 text-[0.94rem] text-foreground/85">{blocos}</div>;
}
