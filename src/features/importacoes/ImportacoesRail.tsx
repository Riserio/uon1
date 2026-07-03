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
  type ResumoAssociacao,
  type StatusImportacao,
} from "./useImportacoesRecentes";

const MODULO_META: Record<ModuloImportacao, { label: string; icon: typeof DollarSign; cor: string }> = {
  cobranca: { label: "Cobrança", icon: DollarSign, cor: "text-emerald-600 bg-emerald-500/10" },
  eventos: { label: "Eventos", icon: ClipboardList, cor: "text-blue-600 bg-blue-500/10" },
  mgf: { label: "MGF", icon: FileBarChart, cor: "text-violet-600 bg-violet-500/10" },
};

const STATUS_META: Record<StatusImportacao, { label: string; cls: string; ring: string; icon: JSX.Element }> = {
  executando: { label: "Rodando", cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400", ring: "hsl(217 91% 60%)", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  sucesso: { label: "Sucesso", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", ring: "hsl(160 84% 39%)", icon: <CheckCircle2 className="h-3 w-3" /> },
  erro: { label: "Erro", cls: "bg-red-500/10 text-red-600 dark:text-red-400", ring: "hsl(0 84% 60%)", icon: <XCircle className="h-3 w-3" /> },
  parado: { label: "Parado", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400", ring: "hsl(38 92% 50%)", icon: <AlertTriangle className="h-3 w-3" /> },
  outro: { label: "Aguardando", cls: "bg-muted text-muted-foreground", ring: "hsl(215 16% 65%)", icon: <Clock className="h-3 w-3" /> },
};

function iniciais(nome: string) {
  return nome
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Avatar circular da associação com anel de progresso/status ao redor */
function AvatarAnel({ assoc, onClick }: { assoc: ResumoAssociacao; onClick: () => void }) {
  const rodando = assoc.status === "executando";
  const cor = STATUS_META[assoc.status].ring;
  const R = 15.5;
  const C = 2 * Math.PI * R;

  return (
    <button
      onClick={onClick}
      title={`${assoc.nome} — ${STATUS_META[assoc.status].label}`}
      className="relative h-9 w-9 shrink-0 transition-transform hover:scale-110 focus-visible:outline-none">
      <svg viewBox="0 0 36 36" className="absolute inset-0 h-9 w-9 -rotate-90">
        <circle cx="18" cy="18" r={R} fill="none" stroke="hsl(var(--border))" strokeWidth="2" />
        {rodando ? (
          <circle
            cx="18"
            cy="18"
            r={R}
            fill="none"
            stroke={cor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${C * 0.28} ${C}`}
            className="origin-center animate-spin"
            style={{ animationDuration: "1.1s" }}
          />
        ) : (
          <circle cx="18" cy="18" r={R} fill="none" stroke={cor} strokeWidth="2.5" strokeLinecap="round" />
        )}
      </svg>
      <span className="absolute inset-[3.5px] rounded-full overflow-hidden bg-muted flex items-center justify-center ring-1 ring-background">
        {assoc.logoUrl ? (
          <img
            src={assoc.logoUrl}
            alt={assoc.nome}
            className="h-full w-full object-cover"
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
          />
        ) : (
          <span className="text-[9px] font-bold text-muted-foreground">{iniciais(assoc.nome)}</span>
        )}
      </span>
      {assoc.rodando > 1 && (
        <span className="absolute -bottom-0.5 -right-0.5 h-3.5 min-w-3.5 rounded-full bg-blue-600 text-white text-[8px] font-bold flex items-center justify-center px-0.5 ring-1 ring-background">
          {assoc.rodando}
        </span>
      )}
    </button>
  );
}

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
 * Rail lateral fino (desktop): botões circulares com a logo de cada associação e
 * anel de progresso girando enquanto sincroniza. Clique abre o painel completo.
 */
export default function ImportacoesRail() {
  const [open, setOpen] = useState(false);
  const { itens, emAndamento, resumoAssociacoes, temImportacaoRodando, loading } = useImportacoesRecentes();

  const recentes = itens.filter((i) => i.status !== "executando").slice(0, 30);
  const bolhas = resumoAssociacoes.slice(0, 8);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* Barra fina na borda direita */}
      <div className="hidden lg:flex fixed right-0 top-1/2 -translate-y-1/2 z-40 flex-col items-center gap-2 rounded-l-2xl border border-r-0 border-border/50 bg-card/80 backdrop-blur-md py-3 px-1.5 shadow-lg">
        {bolhas.length > 0 ? (
          bolhas.map((a) => <AvatarAnel key={a.corretoraId} assoc={a} onClick={() => setOpen(true)} />)
        ) : (
          <SheetTrigger asChild>
            <button
              aria-label="Acompanhar importações"
              title="Importações"
              className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
              <Activity className="h-4 w-4" />
            </button>
          </SheetTrigger>
        )}

        {bolhas.length > 0 && (
          <>
            <span className="h-px w-5 bg-border/60" />
            <SheetTrigger asChild>
              <button
                aria-label="Ver todas as importações"
                title="Ver todas"
                className={`relative h-8 w-8 rounded-full flex items-center justify-center transition-colors ${
                  temImportacaoRodando ? "text-blue-600" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}>
                <Activity className="h-4 w-4" />
                {temImportacaoRodando && (
                  <span className="absolute inset-0 rounded-full ring-2 ring-blue-500/40 animate-pulse" />
                )}
              </button>
            </SheetTrigger>
          </>
        )}
      </div>

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
  );
}
