import { Link } from "react-router-dom";
import { ArrowRight, Scale } from "lucide-react";
import PergunteBiblioteca from "@/components/biblioteca/PergunteBiblioteca";
import GuiasModulos from "@/components/biblioteca/GuiasModulos";
import { HELP_MODULES } from "@/data/treinamentoContent";

/**
 * Biblioteca — área protegida (usuários internos).
 *  1. "Pergunte à Biblioteca": dúvidas respondidas a partir do código do uon1;
 *  2. Atalhos (Estudo Regulatório);
 *  3. Guias passo a passo por módulo (antiga Central de Ajuda, /ajuda).
 * Visual no estilo editorial do styleguide uon1 (serifada nos títulos,
 * faixa índigo, laranja da marca nos destaques).
 */
export default function Biblioteca() {
  const totalGuias = HELP_MODULES.reduce((s, m) => s + m.topics.length, 0);

  return (
    <PergunteBiblioteca>
      {({ caixa, conversa, temConversa }) => (
        <div className="min-h-screen bg-background">
          {/* Masthead */}
          <header className="relative overflow-hidden bg-primary text-primary-foreground">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-36 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.12),transparent_62%)]"
            />
            <div className="relative mx-auto max-w-5xl px-4 pb-10 pt-10 sm:px-8 md:pt-14">
              <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs">
                Biblioteca · uon1
              </span>
              <div className="mt-5 h-1 w-14 rounded-full bg-accent-brand" />
              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">Pergunte à Biblioteca</p>
              <h1 className="mt-2 max-w-[22ch] font-serif text-3xl font-semibold leading-[1.1] sm:text-[2.6rem]">
                Tire dúvidas sobre o sistema, direto da fonte
              </h1>
              <p className="mt-3 max-w-[62ch] text-[0.98rem] text-white/80">
                O que um número significa, de onde vem cada dado, o que uma função faz, quando sincroniza. As respostas
                são montadas a partir do próprio código do uon1 e mostram as fontes consultadas.
              </p>
              <div className="mt-7">{caixa}</div>
            </div>
          </header>

          <main className="mx-auto max-w-5xl px-4 sm:px-8">
            {temConversa && <section className="border-b border-border py-8">{conversa}</section>}

            {/* Atalhos */}
            <section className="border-b border-border py-10">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Acervo</p>
              <h2 className="mt-2 font-serif text-2xl font-semibold">Consulta e estudo</h2>
              <Link
                to="/biblioteca/estudoregulatorio"
                className="group relative mt-5 flex items-center gap-4 overflow-hidden rounded-3xl border border-border bg-card p-5 pl-7 shadow-sm transition hover:shadow-md"
              >
                <span className="absolute inset-y-0 left-0 w-1 bg-accent-brand" aria-hidden />
                <span className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <Scale className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-serif text-lg font-semibold">Estudo Regulatório</h3>
                    <span className="rounded-lg bg-accent-brand/[0.12] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-accent-brand">
                      Público
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Leis, resoluções do CNSP, circulares da Susep e normas de governança, riscos e compliance — com modos
                    de consulta, resumo e estudo.
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </Link>
            </section>

            {/* Guias */}
            <section className="py-10">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Central de ajuda</p>
              <h2 className="mt-2 font-serif text-2xl font-semibold">Guias por módulo</h2>
              <p className="mb-6 mt-1.5 max-w-[70ch] text-sm text-muted-foreground">
                {HELP_MODULES.length} módulos e {totalGuias} guias passo a passo para usar cada área do sistema.
              </p>
              <GuiasModulos />
            </section>
          </main>
        </div>
      )}
    </PergunteBiblioteca>
  );
}
