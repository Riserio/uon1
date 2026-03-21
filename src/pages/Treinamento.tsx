import { useState, useMemo } from "react";
import { HELP_MODULES, HelpModule } from "@/data/treinamentoContent";
import { Search, Lightbulb, ArrowLeft, BookOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

function ModuleCard({ mod, onClick }: { mod: HelpModule; onClick: () => void }) {
  const Icon = mod.icon;
  return (
    <button
      onClick={onClick}
      className="text-left rounded-2xl border bg-card hover:bg-muted/40 transition-all duration-200 hover:shadow-md group overflow-hidden"
    >
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className={cn("p-2.5 rounded-xl bg-muted/60 group-hover:bg-muted", mod.color)}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-foreground">{mod.title}</h3>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{mod.description}</p>
            <span className="text-[11px] text-muted-foreground/60 mt-2 inline-block">
              {mod.topics.length} {mod.topics.length === 1 ? "tópico" : "tópicos"}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function ModuleDetail({ mod, onBack }: { mod: HelpModule; onBack: () => void }) {
  const Icon = mod.icon;
  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para todos os módulos
      </button>

      <div className="rounded-2xl border bg-card overflow-hidden">
        {mod.image && (
          <div className="w-full h-48 md:h-64 overflow-hidden">
            <img
              src={mod.image}
              alt={mod.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="flex items-center gap-4 p-5">
          <div className={cn("p-3 rounded-xl bg-muted/60", mod.color)}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">{mod.title}</h2>
            <p className="text-sm text-muted-foreground">{mod.description}</p>
          </div>
        </div>
      </div>

      <Accordion type="single" collapsible className="space-y-2">
        {mod.topics.map((topic, idx) => (
          <AccordionItem
            key={idx}
            value={`topic-${idx}`}
            className="border rounded-xl px-4 bg-card overflow-hidden"
          >
            <AccordionTrigger className="text-sm font-medium hover:no-underline py-3">
              {topic.title}
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 pb-2">
                <ol className="space-y-2">
                  {topic.steps.map((step, si) => (
                    <li key={si} className="flex gap-3 text-sm text-muted-foreground">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold mt-0.5">
                        {si + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                {topic.tip && (
                  <div className="flex gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <Lightbulb className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      <strong>Dica:</strong> {topic.tip}
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

export default function Treinamento() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return HELP_MODULES;
    const q = search.toLowerCase();
    return HELP_MODULES.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.topics.some(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.steps.some((s) => s.toLowerCase().includes(q))
        )
    );
  }, [search]);

  const selectedModule = selectedId
    ? HELP_MODULES.find((m) => m.id === selectedId) ?? null
    : null;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <BookOpen className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ajuda</h1>
          <p className="text-sm text-muted-foreground">
            Aprenda a usar cada área do sistema com guias passo a passo
          </p>
        </div>
      </div>

      {/* Search */}
      {!selectedModule && (
        <div className="relative mt-6 mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por módulo, funcionalidade ou palavra-chave..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 rounded-xl bg-muted/40 border-muted"
          />
        </div>
      )}

      {/* Content */}
      {selectedModule ? (
        <ModuleDetail mod={selectedModule} onBack={() => setSelectedId(null)} />
      ) : (
        <>
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum resultado encontrado para "{search}"</p>
              <p className="text-xs mt-1">Tente termos mais gerais como "sinistro", "financeiro" ou "whatsapp"</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((mod) => (
                <ModuleCard key={mod.id} mod={mod} onClick={() => setSelectedId(mod.id)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
