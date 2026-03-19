import { useState, useMemo } from "react";
import { HELP_MODULES, HelpModule, HelpImage } from "@/data/treinamentoContent";
import { Search, Lightbulb, ArrowLeft, BookOpen, ZoomIn } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function ModuleCard({ mod, onClick }: { mod: HelpModule; onClick: () => void }) {
  const Icon = mod.icon;
  return (
    <button
      onClick={onClick}
      className="text-left p-5 rounded-2xl border bg-card hover:bg-muted/40 transition-all duration-200 hover:shadow-md group"
    >
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
    </button>
  );
}

function ImageLightbox({
  image,
  open,
  onOpenChange,
}: {
  image: HelpImage | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!image) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] p-2 sm:p-4">
        <DialogTitle className="sr-only">{image.caption}</DialogTitle>
        <div className="space-y-2">
          <img
            src={image.src}
            alt={image.caption}
            className="w-full rounded-lg border"
          />
          {image.caption && (
            <p className="text-sm text-muted-foreground text-center px-2">
              {image.caption}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TopicImages({ images }: { images: HelpImage[] }) {
  const [lightboxImage, setLightboxImage] = useState<HelpImage | null>(null);

  return (
    <>
      <div className={cn(
        "grid gap-3 mt-3",
        images.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"
      )}>
        {images.map((img, i) => (
          <button
            key={i}
            onClick={() => setLightboxImage(img)}
            className="group relative rounded-xl overflow-hidden border bg-muted/30 hover:shadow-md transition-all duration-200"
          >
            <img
              src={img.src}
              alt={img.caption}
              className="w-full h-auto"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-background/90 rounded-full p-2 shadow-lg">
                <ZoomIn className="h-4 w-4 text-foreground" />
              </div>
            </div>
            {img.caption && (
              <p className="text-xs text-muted-foreground p-2 text-center border-t bg-muted/20">
                {img.caption}
              </p>
            )}
          </button>
        ))}
      </div>
      <ImageLightbox
        image={lightboxImage}
        open={!!lightboxImage}
        onOpenChange={(open) => !open && setLightboxImage(null)}
      />
    </>
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

      <div className="flex items-center gap-4 p-5 rounded-2xl border bg-card">
        <div className={cn("p-3 rounded-xl bg-muted/60", mod.color)}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">{mod.title}</h2>
          <p className="text-sm text-muted-foreground">{mod.description}</p>
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
                {topic.images && topic.images.length > 0 && (
                  <TopicImages images={topic.images} />
                )}
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
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-5xl mx-auto">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
