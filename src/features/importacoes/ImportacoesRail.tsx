import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  FileBarChart,
  Loader2,
  AlertTriangle,
  XCircle,
  ClipboardList,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useImportacoesRecentes,
  type ImportacaoItem,
  type ModuloImportacao,
  type StatusImportacao,
} from "./useImportacoesRecentes";

const MODULO_META: Record<ModuloImportacao, { label: string; icon: typeof DollarSign; cor: string }> = {
  cobranca: { label: "Cobrança", icon: DollarSign, cor: "text-emerald-600 bg-emerald-500/10" },
  eventos: { label: "Eventos", icon: ClipboardList, cor: "text-blue-600 bg-blue-500/10" },
  mgf: { label: "MGF", icon: FileBarChart, cor: "text-violet-600 bg-violet-500/10" },
};

const STATUS_META: Record<StatusImportacao, { label: string; cls: string; icon: JSX.Element }> = {
  executando: { label: "Rodando", cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  sucesso: { label: "Sucesso", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", icon: <CheckCircle2 className="h-3 w-3" /> },
  erro: { label: "Erro", cls: "bg-red-500/10 text-red-600 dark:text-red-400", icon: <XCircle className="h-3 w-3" /> },
  parado: { label: "Parado", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400", icon: <AlertTriangle className="h-3 w-3" /> },
  outro: { label: "Aguardando", cls: "bg-muted text-muted-foreground", icon: <Clock className="h-3 w-3" /> },
};

function ItemImportacao({ item }: { item: ImportacaoItem }) {
  const mod = MODULO_META[item.modulo];
  const st = STATUS_META[item.status];
  const Icon = mod.icon;
  const quando = formatDistanceToNow(new Date(item.criadoEm), { locale: ptBR, addSuffix: true });

  return (
    <div className="rounded-xl border border-border/60 p-3 hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${mod.cor}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-sm truncate">{item.corretoraNome}</p>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${st.cls}`}>
              {st.icon}
              {st.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {mod.label}
            {item.status === "executando" && item.etapa ? ` • ${item.etapa.toLowerCase()}` : ""}
            {item.status === "sucesso" && item.registros != null ? ` • ${item.registros.toLocaleString("pt-BR")} registros` : ""}
          </p>
          {item.status === "erro" && item.erro && (
            <p className="text-[11px] text-red-600/90 dark:text-red-400/90 mt-1 line-clamp-2">{item.erro}</p>
          )}
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-muted-foreground">{quando}</span>
            {item.runUrl && (
              <a
                href={item.runUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-primary inline-flex items-center gap-0.5 hover:underline">
                log <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Rail lateral (somente desktop) para acompanhar as importações em tempo real.
 * O botão pulsa quando há importação rodando.
 */
export default function ImportacoesRail() {
  const [open, setOpen] = useState(false);
  const { itens, emAndamento, temImportacaoRodando, loading } = useImportacoesRecentes();

  const recentes = itens.filter((i) => i.status !== "executando").slice(0, 30);

  return (
    <div className="hidden lg:block fixed right-0 bottom-20 z-40">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            aria-label="Acompanhar importações"
            title="Importações"
            className="group relative flex items-center justify-center h-10 w-8 rounded-l-lg border border-r-0 border-border/60 bg-card/90 backdrop-blur-sm shadow-sm hover:w-9 hover:bg-card transition-all">
            {/* Pulso discreto quando há importação rodando */}
            {temImportacaoRodando && (
              <span className="absolute inset-0 rounded-l-lg ring-2 ring-blue-500/40 animate-pulse pointer-events-none" />
            )}
            <Activity className={`h-4 w-4 ${temImportacaoRodando ? "text-blue-600" : "text-muted-foreground group-hover:text-foreground"}`} />
            {temImportacaoRodando && (
              <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center">
                <span className="absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-60 animate-ping" />
                <span className="relative inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue-600 text-white text-[8px] font-bold px-1">
                  {emAndamento.length}
                </span>
              </span>
            )}
          </button>
        </SheetTrigger>

        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="p-4 border-b border-border/50">
            <SheetTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Importações
              {temImportacaoRodando && (
                <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-0 gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> {emAndamento.length} rodando
                </Badge>
              )}
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1 p-4">
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-10">Carregando...</p>
            ) : itens.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <Activity className="h-8 w-8 mx-auto text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Nenhuma importação recente</p>
              </div>
            ) : (
              <div className="space-y-5">
                {emAndamento.length > 0 && (
                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-600 flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600" />
                      </span>
                      Em andamento ({emAndamento.length})
                    </h3>
                    {emAndamento.map((i) => (
                      <ItemImportacao key={i.id} item={i} />
                    ))}
                  </section>
                )}

                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recentes</h3>
                  {recentes.map((i) => (
                    <ItemImportacao key={i.id} item={i} />
                  ))}
                </section>
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
