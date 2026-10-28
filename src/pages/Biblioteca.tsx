import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, BookOpen, Scale, Sparkles } from "lucide-react";
import PergunteBiblioteca from "@/components/biblioteca/PergunteBiblioteca";
import GuiasModulos, { type SelecaoGuia } from "@/components/biblioteca/GuiasModulos";
import { HELP_MODULES } from "@/data/treinamentoContent";
import { cn } from "@/lib/utils";

/**
 * Biblioteca — área protegida (usuários internos).
 *  - Aba "Perguntar com IA": dúvidas respondidas a partir do código do uon1,
 *    com modos de resposta, filtro de área e prints (só consulta, nada é salvo);
 *  - Aba "Guias": passo a passo por módulo (antiga Central de Ajuda, /ajuda);
 *  - Coluna lateral: módulos do sistema (abre o guia) e o Estudo Regulatório.
 * Visual: estilo editorial do styleguide uon1 (serifada nos títulos, índigo
 * como primária, laranja da marca nos destaques).
 */
type Aba = "perguntar" | "guias";

export default function Biblioteca() {
  const [aba, setAba] = useState<Aba>("perguntar");
  const [guia, setGuia] = useState<SelecaoGuia>(null);
  const totalGuias = HELP_MODULES.reduce((s, m) => s + m.topics.length, 0);

  const abrirModulo = (id: string) => {
    setGuia({ id });
    setAba("guias");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1320px] px-4 pb-16 pt-8 sm:px-8 md:pt-10">
        {/* Cabeçalho */}
        <header>
          <div className="h-1 w-14 rounded-full bg-accent-brand" />
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Central de conhecimento</p>
          <h1 className="mt-1.5 font-serif text-4xl font-semibold leading-tight sm:text-[2.75rem]">Biblioteca</h1>
          <p className="mt-2 max-w-[72ch] text-[0.98rem] text-muted-foreground">
            Tudo sobre como o uon1 funciona: o que cada número significa, de onde vem cada dado e como usar cada tela.
          </p>

          <div className="mt-6 inline-flex gap-1 rounded-2xl bg-muted p-1" role="tablist">
            {(
              [
                { id: "perguntar", rotulo: "Perguntar com IA", curto: "Perguntar", icon: Sparkles },
                { id: "guias", rotulo: "Guias passo a passo", curto: "Guias", icon: BookOpen },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={aba === t.id}
                  type="button"
                  onClick={() => setAba(t.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                    aba === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="sm:hidden">{t.curto}</span>
                  <span className="hidden sm:inline">{t.rotulo}</span>
                </button>
              );
            })}
          </div>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Conteúdo */}
          <main className="min-w-0">
            {aba === "perguntar" ? (
              <PergunteBiblioteca />
            ) : (
              <section>
                <h2 className="font-serif text-2xl font-semibold">Guias por módulo</h2>
                <p className="mb-6 mt-1.5 text-sm text-muted-foreground">
                  {HELP_MODULES.length} módulos e {totalGuias} guias passo a passo para usar cada área do sistema.
                </p>
                <GuiasModulos selecionado={guia} onSelecionar={setGuia} />
              </section>
            )}
          </main>

          {/* Coluna lateral */}
          <aside className="space-y-8">
            <section>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Módulos do sistema
              </p>
              <ul className="space-y-2">
                {HELP_MODULES.map((m) => {
                  const Icon = m.icon;
                  const ativo = aba === "guias" && guia?.id === m.id;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => abrirModulo(m.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left text-sm transition hover:border-primary/30 hover:shadow-sm",
                          ativo ? "border-primary/40 ring-2 ring-primary/10" : "border-border",
                        )}
                      >
                        <Icon className={cn("h-4 w-4 shrink-0", m.color)} />
                        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{m.title}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">{m.topics.length}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">Clique num módulo para abrir os guias.</p>
            </section>

            <section>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Acervo</p>
              <Link
                to="/biblioteca/estudoregulatorio"
                className="group relative block overflow-hidden rounded-3xl border border-border bg-card p-5 pl-6 shadow-sm transition hover:shadow-md"
              >
                <span className="absolute inset-y-0 left-0 w-1 bg-accent-brand" aria-hidden />
                <div className="flex items-center justify-between">
                  <span className="rounded-2xl bg-primary/10 p-2.5 text-primary">
                    <Scale className="h-5 w-5" />
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </div>
                <h3 className="mt-3 font-serif text-lg font-semibold">Estudo Regulatório</h3>
                <p className="mt-1 text-[0.82rem] text-muted-foreground">
                  Leis, resoluções do CNSP, circulares da Susep e normas de governança, riscos e compliance.
                </p>
              </Link>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
