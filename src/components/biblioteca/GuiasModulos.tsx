import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Lightbulb, Search } from "lucide-react";
import { HELP_MODULES, type HelpModule } from "@/data/treinamentoContent";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

/** Guias passo a passo por módulo (conteúdo em src/data/treinamentoContent.ts). */

function normalizar(t: string) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function CardModulo({ mod, onClick }: { mod: HelpModule; onClick: () => void }) {
  const Icon = mod.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card p-5 pl-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <span className={cn("absolute inset-y-0 left-0 w-1 bg-current opacity-80", mod.color)} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <span className={cn("rounded-2xl bg-muted/70 p-2.5", mod.color)}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="rounded-lg bg-primary/10 px-2 py-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-primary">
          {mod.topics.length} {mod.topics.length === 1 ? "guia" : "guias"}
        </span>
      </div>
      <h3 className="mt-4 text-[1.08rem] font-semibold leading-snug text-foreground">{mod.title}</h3>
      <p className="mt-1.5 line-clamp-2 text-[0.84rem] text-muted-foreground">{mod.description}</p>
      <span className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-semibold text-primary opacity-0 transition group-hover:opacity-100">
        Abrir guias <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

function DetalheModulo({ mod, onBack, destaque }: { mod: HelpModule; onBack: () => void; destaque?: string }) {
  const Icon = mod.icon;
  const aberto = destaque ? mod.topics.findIndex((t) => t.title === destaque) : -1;
  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Todos os módulos
      </button>

      <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 pl-7 shadow-sm">
        <span className={cn("absolute inset-y-0 left-0 w-1 bg-current", mod.color)} aria-hidden />
        <div className="flex items-center gap-4">
          <span className={cn("rounded-2xl bg-muted/70 p-3", mod.color)}>
            <Icon className="h-6 w-6" />
          </span>
          <div>
            <h3 className="text-2xl font-semibold leading-tight">{mod.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{mod.description}</p>
          </div>
        </div>
      </div>

      <Accordion
        type="single"
        collapsible
        defaultValue={aberto >= 0 ? `t-${aberto}` : undefined}
        className="space-y-2.5"
      >
        {mod.topics.map((topic, idx) => (
          <AccordionItem
            key={idx}
            value={`t-${idx}`}
            className="overflow-hidden rounded-2xl border border-border bg-card px-5 shadow-sm"
          >
            <AccordionTrigger className="py-4 text-left text-[1rem] font-semibold hover:no-underline">
              {topic.title}
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 pb-3">
                <ol className="space-y-2.5">
                  {topic.steps.map((step, si) => (
                    <li key={si} className="flex gap-3 text-[0.9rem] leading-relaxed text-foreground/80">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {si + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                {topic.tip && (
                  <div className="flex gap-3 rounded-2xl border border-accent-brand/30 bg-accent-brand/[0.08] p-3.5">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent-brand" />
                    <p className="text-sm text-foreground/80">
                      <strong className="font-semibold text-foreground">Dica:</strong> {topic.tip}
                    </p>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

export type SelecaoGuia = { id: string; topico?: string } | null;

/** A seleção é controlada pela página, para a coluna lateral abrir um módulo direto. */
export default function GuiasModulos({
  selecionado,
  onSelecionar,
}: {
  selecionado: SelecaoGuia;
  onSelecionar: (s: SelecaoGuia) => void;
}) {
  const [busca, setBusca] = useState("");
  const setSelecionado = onSelecionar;

  const q = normalizar(busca.trim());
  const filtrados = useMemo(() => {
    if (!q) return HELP_MODULES;
    return HELP_MODULES.filter((m) =>
      normalizar([m.title, m.description, ...m.topics.flatMap((t) => [t.title, ...t.steps, t.tip || ""])].join(" ")).includes(q),
    );
  }, [q]);

  // tópicos que batem com a busca — atalho direto para o guia
  const topicos = useMemo(() => {
    if (q.length < 3) return [];
    return HELP_MODULES.flatMap((m) =>
      m.topics
        .filter((t) => normalizar(t.title + " " + t.steps.join(" ")).includes(q))
        .map((t) => ({ mod: m, topico: t.title })),
    ).slice(0, 6);
  }, [q]);

  const mod = selecionado ? HELP_MODULES.find((m) => m.id === selecionado.id) : null;
  if (mod) return <DetalheModulo mod={mod} destaque={selecionado?.topico} onBack={() => setSelecionado(null)} />;

  return (
    <div className="space-y-5">
      <div className="relative max-w-xl">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Filtrar guias por módulo ou palavra-chave…"
          className="h-11 w-full rounded-2xl border border-input bg-card pl-11 pr-4 text-sm shadow-sm transition focus:border-ring focus:outline-none focus:ring-[3px] focus:ring-ring/15"
        />
      </div>

      {topicos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {topicos.map((t) => (
            <button
              key={t.mod.id + t.topico}
              type="button"
              onClick={() => setSelecionado({ id: t.mod.id, topico: t.topico })}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent-brand/[0.12] px-3 py-1.5 text-xs font-semibold text-accent-brand transition hover:bg-accent-brand/20"
            >
              <span className="text-foreground/60">{t.mod.title} ·</span> {t.topico}
            </button>
          ))}
        </div>
      )}

      {filtrados.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border py-14 text-center text-muted-foreground">
          <p className="text-lg text-foreground">Nenhum guia encontrado para “{busca}”.</p>
          <p className="mt-1 text-sm">Experimente perguntar na caixa do topo — ela consulta o próprio sistema.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtrados.map((m) => (
            <CardModulo key={m.id} mod={m} onClick={() => setSelecionado({ id: m.id })} />
          ))}
        </div>
      )}
    </div>
  );
}
