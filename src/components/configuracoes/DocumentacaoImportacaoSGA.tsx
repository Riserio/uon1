import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Database,
  Clock,
  Info,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Importação SGA — acompanhamento ao vivo do backfill do histórico de cobrança.
 *
 * O histórico da Hinova é preenchido de forma progressiva: um processo no banco
 * (cron `backfill-cobranca-historico`, a cada 2 minutos) percorre o passado em
 * janelas de 5 dias, uma associação por vez, até alcançar o período que a
 * importação diária ("recente") já cobre. Enquanto isso não termina, os
 * gráficos históricos aparecem incompletos — não por erro de cálculo, mas
 * porque o dado ainda não chegou.
 *
 * Esta tela existe para que essa espera seja visível e verificável, em vez de
 * "o gráfico está estranho e ninguém sabe por quê".
 */

type Assoc = {
  nome: string;
  completo: boolean;
  cursor: string | null;
  ate: string | null;
  dias_restantes: number;
  percentual: number;
  boletos: number;
  atualizado_em: string | null;
  ultimo_erro: string | null;
};

type Status = {
  gerado_em: string;
  total: number;
  concluidas: number;
  dias_restantes: number;
  associacoes: Assoc[];
};

const fmtData = (d?: string | null) => {
  if (!d) return "—";
  const s = String(d).slice(0, 10).split("-");
  return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : String(d);
};

const fmtQuando = (d?: string | null) => {
  if (!d) return "—";
  const diff = (Date.now() - new Date(d).getTime()) / 60000;
  if (diff < 1) return "agora";
  if (diff < 60) return `há ${Math.round(diff)} min`;
  if (diff < 1440) return `há ${Math.round(diff / 60)} h`;
  return `há ${Math.round(diff / 1440)} dias`;
};

export default function DocumentacaoImportacaoSGA() {
  const [status, setStatus] = useState<Status | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data, error } = await supabase.rpc("status_backfill_cobranca" as never);
      if (!error) setStatus(data as unknown as Status);
    } catch (e) {
      console.error("[ImportacaoSGA] erro ao carregar status:", e);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    // Atualiza sozinho: o processo avança a cada 2 minutos.
    const t = setInterval(carregar, 60000);
    return () => clearInterval(t);
  }, [carregar]);

  // ~30 dias de histórico por execução, uma execução a cada 2 minutos.
  const horasEstimadas = status ? Math.round(((status.dias_restantes / 30) * 2) / 60) : 0;
  const pendentes = status ? status.total - status.concluidas : 0;

  return (
    <div className="space-y-5">
      {/* Cabeçalho + resumo */}
      <div className="rounded-2xl border border-border/50 bg-card p-5 sm:p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h3 className="font-semibold flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              Importação do histórico (SGA / Hinova)
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
              O histórico é reconstruído aos poucos, em janelas de 5 dias, uma associação por vez.
              Esta página mostra até onde cada uma já chegou.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={carregar} disabled={carregando} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="text-[11px] font-medium text-emerald-600 mb-1">Concluídas</div>
            <div className="text-xl font-bold tabular-nums text-emerald-600">
              {status ? `${status.concluidas}/${status.total}` : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">associações com histórico completo</div>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="text-[11px] font-medium text-amber-600 mb-1">Em andamento</div>
            <div className="text-xl font-bold tabular-nums text-amber-600">{status ? pendentes : "—"}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">ainda preenchendo o passado</div>
          </div>
          <div className="rounded-xl border border-border/50 bg-muted/30 p-3">
            <div className="text-[11px] font-medium text-muted-foreground mb-1">Dias a importar</div>
            <div className="text-xl font-bold tabular-nums">
              {status ? status.dias_restantes.toLocaleString("pt-BR") : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">somando todas as associações</div>
          </div>
          <div className="rounded-xl border border-border/50 bg-muted/30 p-3">
            <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground mb-1">
              <Clock className="h-3 w-3" /> Previsão
            </div>
            <div className="text-xl font-bold tabular-nums">
              {status ? (horasEstimadas > 0 ? `~${horasEstimadas} h` : "quase lá") : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">no ritmo atual, sem intervenção</div>
          </div>
        </div>

        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
          <div className="flex items-start gap-2.5">
            <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
            <div className="text-sm text-muted-foreground leading-relaxed">
              <span className="font-semibold text-blue-600">Por que é gradual? </span>
              A API da Hinova responde devagar para associações de alto volume, então o sistema pede
              períodos curtos (5 dias) e processa uma associação por vez. Isso evita sobrecarregar a
              Hinova e o banco. Roda inteiramente no banco de dados — não consome execuções de
              serviço — e para sozinho quando todas terminarem.
            </div>
          </div>
        </div>
      </div>

      {/* Lista por associação */}
      <div className="rounded-2xl border border-border/50 bg-card p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="font-semibold">Progresso por associação</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              A data indica até que ponto do passado o histórico já foi preenchido.
            </p>
          </div>
          {status && (
            <Badge variant="outline" className="text-[11px]">
              atualizado {fmtQuando(status.gerado_em)}
            </Badge>
          )}
        </div>

        {!status ? (
          <div className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando status…
          </div>
        ) : (
          <div className="space-y-3">
            {status.associacoes.map((a) => (
              <div key={a.nome} className="rounded-xl border border-border/50 p-3.5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    {a.completo ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <Loader2 className="h-4 w-4 text-amber-600 shrink-0 animate-spin" />
                    )}
                    <span className="font-medium text-sm truncate">{a.nome}</span>
                    {a.completo ? (
                      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                        completo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        {a.dias_restantes.toLocaleString("pt-BR")} dias restantes
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {a.boletos.toLocaleString("pt-BR")} boletos · {fmtQuando(a.atualizado_em)}
                  </div>
                </div>

                <div className="mt-2.5 flex items-center gap-3">
                  <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${a.completo ? "bg-emerald-500" : "bg-amber-500"}`}
                      style={{ width: `${Math.min(100, Math.max(2, a.percentual))}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold tabular-nums w-10 text-right">
                    {a.percentual}%
                  </span>
                </div>

                <div className="mt-1.5 text-[11px] text-muted-foreground">
                  {a.completo ? (
                    <>Histórico completo até {fmtData(a.ate)}.</>
                  ) : (
                    <>
                      Já importado até <strong className="text-foreground">{fmtData(a.cursor)}</strong> · falta chegar
                      em {fmtData(a.ate)}
                    </>
                  )}
                </div>

                {a.ultimo_erro && (
                  <div className="mt-2 flex items-start gap-1.5 text-[11px] text-red-600">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span className="leading-snug">Último erro registrado: {a.ultimo_erro}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
