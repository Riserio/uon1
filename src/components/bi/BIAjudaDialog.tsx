import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  CreditCard,
  Database,
  DollarSign,
  HelpCircle,
  Info,
  MessageSquare,
  RefreshCw,
  SlidersHorizontal,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  AJUDA_SECOES,
  AJUDA_VISAO_GERAL,
  PADRAO_SISTEMA,
  descreverFiltros,
  moduloAjudaDe,
  type AjudaSecao,
  type BIAjudaModulo,
} from "@/content/biAjuda";
import { useTiposBoleto } from "@/components/cobranca/TipoBoletoFilter";

/* ------------------------------------------------------------------ */
/* Tipos do retorno de bi_status_alimentacao                           */
/* ------------------------------------------------------------------ */
type FilaItem = { status: string; tentativas: number; mensagem: string | null; atualizado_em: string | null };
type StatusAlimentacao = {
  gerado_em: string;
  integracao: { usar_api: boolean; cobranca: boolean; eventos: boolean; mgf: boolean; hora_agendada: string | null } | null;
  fila: Partial<Record<"cobranca_recente" | "eventos" | "mgf", FilaItem>>;
  base: {
    importado_em: string | null; veiculos: number | null; coleta_fase: string | null; coleta_atualizada_em: string | null;
    coleta_erro: string | null; ultima_mensagem: string | null; ultima_conferencia: string | null; frota_diaria_ate: string | null;
  };
  indicadores: {
    mes_atual_atualizado_em: string | null; placas_ativas_mes_atual: number | null; meses_com_dado: number;
    primeiro_mes: string | null; complementares_em: string | null;
  };
  eventos: {
    atualizado_em: string | null; total: number | null; ultimo_cadastro: string | null; mes_atual: number;
    sem_local_no_sga: number; ultimos_90_dias: number; com_custo_mgf: number;
  };
  mgf: {
    atualizado_em: string | null; lancamentos: number | null; vencimento_ate: string | null; ligados_a_evento: number;
    com_cooperativa: number; mes_atual: number;
  };
  cobranca: {
    atualizado_em: string | null;
    importacoes: { nome: string; registros: number; atualizado_em: string; ciclo_completo: boolean | null }[] | null;
    tipos_relatorio: string[] | null; inadimplencia_base: string;
  };
  relatorio: {
    nome: string; horario: string; frequencia: string; ultimo_envio: string | null; status: string | null;
    aviso: string | null; proximo: string | null; destinatarios: number;
  }[] | null;
};

type FiltroSalvo = { tela: string; filtros: Record<string, unknown>; updated_at: string };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const ICONES: Record<BIAjudaModulo, typeof Activity> = {
  indicadores: TrendingUp,
  "estudo-base": Database,
  eventos: Activity,
  mgf: DollarSign,
  cobranca: CreditCard,
  relatorio: MessageSquare,
};

const quando = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    relativo: formatDistanceToNow(d, { addSuffix: true, locale: ptBR }),
    absoluto: format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }),
    horas: (Date.now() - d.getTime()) / 36e5,
  };
};
const dataBR = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "dd/MM/yyyy", { locale: ptBR });
};
const num = (v: number | null | undefined) => (v == null ? "—" : Number(v).toLocaleString("pt-BR"));

type Saude = "ok" | "atencao" | "erro" | "inativo";
function saudeDe(iso: string | null | undefined, fila?: FilaItem, ativo = true): Saude {
  if (!ativo) return "inativo";
  if (fila?.status === "erro") return "erro";
  const q = quando(iso);
  if (!q) return "erro";
  if (q.horas <= 26) return fila && fila.tentativas > 0 ? "atencao" : "ok";
  if (q.horas <= 72) return "atencao";
  return "erro";
}

const SAUDE_ESTILO: Record<Saude, { cls: string; icone: typeof CheckCircle2; texto: string }> = {
  ok: { cls: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30", icone: CheckCircle2, texto: "Em dia" },
  atencao: { cls: "text-amber-600 bg-amber-500/10 border-amber-500/30", icone: AlertTriangle, texto: "Atenção" },
  erro: { cls: "text-red-600 bg-red-500/10 border-red-500/30", icone: XCircle, texto: "Desatualizado" },
  inativo: { cls: "text-muted-foreground bg-muted border-border", icone: Info, texto: "Não contratado" },
};

function SaudeBadge({ saude }: { saude: Saude }) {
  const s = SAUDE_ESTILO[saude];
  const Icone = s.icone;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", s.cls)}>
      <Icone className="h-3 w-3" /> {s.texto}
    </span>
  );
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: ReactNode; destaque?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{rotulo}</span>
      <span className={cn("text-sm text-right tabular-nums", destaque && "font-semibold")}>{valor}</span>
    </div>
  );
}

function Bloco({ titulo, icone: Icone, children }: { titulo: string; icone: typeof Info; children: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-4 space-y-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <Icone className="h-4 w-4 text-primary" /> {titulo}
      </h4>
      {children}
    </section>
  );
}

function Quando({ iso }: { iso: string | null | undefined }) {
  const q = quando(iso);
  if (!q) return <span className="text-muted-foreground">sem registro</span>;
  return <span title={q.absoluto}>{q.absoluto} <span className="text-muted-foreground">({q.relativo})</span></span>;
}

/* ------------------------------------------------------------------ */
/* Status por módulo                                                   */
/* ------------------------------------------------------------------ */
function StatusModulo({ modulo, s }: { modulo: BIAjudaModulo; s: StatusAlimentacao }) {
  const integ = s.integracao;
  switch (modulo) {
    case "indicadores": {
      const saude = saudeDe(s.indicadores.mes_atual_atualizado_em);
      return (
        <Bloco titulo="Situação agora" icone={RefreshCw}>
          <div className="flex justify-end"><SaudeBadge saude={saude} /></div>
          <Linha rotulo="Mês atual recalculado em" valor={<Quando iso={s.indicadores.mes_atual_atualizado_em} />} />
          <Linha rotulo="Placas ativas (mês atual)" valor={num(s.indicadores.placas_ativas_mes_atual)} destaque />
          <Linha rotulo="Última conferência da base" valor={<Quando iso={s.base.ultima_conferencia} />} />
          <Linha rotulo="Complementares recalculados em" valor={<Quando iso={s.indicadores.complementares_em} />} />
          <Linha rotulo="Histórico disponível" valor={`${num(s.indicadores.meses_com_dado)} meses (desde ${dataBR(s.indicadores.primeiro_mes)})`} />
          <Linha rotulo="Frota diária registrada até" valor={dataBR(s.base.frota_diaria_ate)} />
        </Bloco>
      );
    }
    case "estudo-base": {
      const saude = saudeDe(s.base.ultima_conferencia ?? s.base.importado_em);
      return (
        <Bloco titulo="Situação agora" icone={RefreshCw}>
          <div className="flex justify-end"><SaudeBadge saude={saude} /></div>
          <Linha rotulo="Veículos na base" valor={num(s.base.veiculos)} destaque />
          <Linha rotulo="Última base conferida" valor={<Quando iso={s.base.ultima_conferencia ?? s.base.importado_em} />} />
          <Linha rotulo="Coleta em andamento" valor={s.base.coleta_fase && s.base.coleta_fase !== "concluido" ? `sim (${s.base.coleta_fase})` : "não"} />
          {s.base.coleta_erro && <Linha rotulo="Último erro da coleta" valor={<span className="text-red-600">{s.base.coleta_erro}</span>} />}
          {s.base.ultima_mensagem && <Linha rotulo="Última mensagem" valor={s.base.ultima_mensagem} />}
        </Bloco>
      );
    }
    case "eventos": {
      const fila = s.fila.eventos;
      const saude = saudeDe(s.eventos.atualizado_em, fila, integ?.eventos !== false);
      const semLocal = s.eventos.ultimos_90_dias > 0 ? Math.round((s.eventos.sem_local_no_sga / s.eventos.ultimos_90_dias) * 100) : 0;
      return (
        <Bloco titulo="Situação agora" icone={RefreshCw}>
          <div className="flex justify-end"><SaudeBadge saude={saude} /></div>
          <Linha rotulo="Última atualização" valor={<Quando iso={s.eventos.atualizado_em} />} />
          <Linha rotulo="Evento mais recente (cadastro)" valor={dataBR(s.eventos.ultimo_cadastro)} />
          <Linha rotulo="Eventos no mês atual" valor={num(s.eventos.mes_atual)} destaque />
          <Linha rotulo="Eventos importados (total)" valor={num(s.eventos.total)} />
          <Linha rotulo="Sem local informado no SGA (90 dias)" valor={`${num(s.eventos.sem_local_no_sga)} (${semLocal}%) — usa a cidade do associado`} />
          <Linha rotulo="Eventos com custo ligado (MGF)" valor={num(s.eventos.com_custo_mgf)} />
          {fila?.mensagem && fila.mensagem !== "em progresso" && (
            <Linha rotulo="Último aviso" valor={<span className="text-amber-600">{fila.mensagem}</span>} />
          )}
        </Bloco>
      );
    }
    case "mgf": {
      const fila = s.fila.mgf;
      const saude = saudeDe(s.mgf.atualizado_em, fila, integ?.mgf !== false);
      return (
        <Bloco titulo="Situação agora" icone={RefreshCw}>
          <div className="flex justify-end"><SaudeBadge saude={saude} /></div>
          <Linha rotulo="Última atualização" valor={<Quando iso={s.mgf.atualizado_em} />} />
          <Linha rotulo="Lançamentos importados" valor={num(s.mgf.lancamentos)} destaque />
          <Linha rotulo="Lançamentos com vencimento no mês" valor={num(s.mgf.mes_atual)} />
          <Linha rotulo="Vencimentos cobertos até" valor={dataBR(s.mgf.vencimento_ate)} />
          <Linha rotulo="Lançamentos ligados a evento" valor={num(s.mgf.ligados_a_evento)} />
          <Linha rotulo="Lançamentos com cooperativa" valor={num(s.mgf.com_cooperativa)} />
          {fila?.mensagem && <Linha rotulo="Último aviso" valor={<span className="text-amber-600">{fila.mensagem}</span>} />}
        </Bloco>
      );
    }
    case "cobranca": {
      const fila = s.fila.cobranca_recente;
      const saude = saudeDe(s.cobranca.atualizado_em, fila, integ?.cobranca !== false);
      const tipos = s.cobranca.tipos_relatorio;
      return (
        <Bloco titulo="Situação agora" icone={RefreshCw}>
          <div className="flex justify-end"><SaudeBadge saude={saude} /></div>
          <Linha rotulo="Última atualização" valor={<Quando iso={s.cobranca.atualizado_em} />} />
          {(s.cobranca.importacoes || []).map((i) => (
            <Linha key={i.nome} rotulo={i.nome} valor={`${num(i.registros)} boletos · ${quando(i.atualizado_em)?.absoluto ?? "—"}`} />
          ))}
          <Linha rotulo="Base da inadimplência" valor={s.cobranca.inadimplencia_base === "vencidos" ? "Só boletos vencidos" : "Todos os boletos do mês (regra validada)"} />
          <Linha rotulo="Tipos no resumo diário" valor={tipos && tipos.length ? tipos.join(", ") : "Todos"} />
          {fila?.mensagem && fila.mensagem !== "em progresso" && (
            <Linha rotulo="Último aviso" valor={<span className="text-amber-600">{fila.mensagem}</span>} />
          )}
          {fila?.mensagem === "em progresso" && <Linha rotulo="Leitura" valor="em andamento (blocos de 5 dias)" />}
        </Bloco>
      );
    }
    case "relatorio": {
      const rels = s.relatorio || [];
      if (!rels.length) {
        return (
          <Bloco titulo="Situação agora" icone={RefreshCw}>
            <p className="text-sm text-muted-foreground">Nenhum resumo diário configurado para esta associação.</p>
          </Bloco>
        );
      }
      return (
        <Bloco titulo="Situação agora" icone={RefreshCw}>
          {rels.map((r) => {
            const falhou = r.status === "failed" || (r.status || "").includes("erro(");
            return (
              <div key={r.nome} className="rounded-xl border p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{r.nome}</span>
                  <SaudeBadge saude={falhou ? "erro" : r.aviso ? "atencao" : saudeDe(r.ultimo_envio)} />
                </div>
                <Linha rotulo="Horário" valor={`${r.horario} · ${r.frequencia === "daily" ? "diário" : r.frequencia}`} />
                <Linha rotulo="Último envio" valor={<Quando iso={r.ultimo_envio} />} />
                <Linha rotulo="Próximo envio" valor={<Quando iso={r.proximo} />} />
                <Linha rotulo="Destinatários" valor={num(r.destinatarios)} />
                {r.aviso && <Linha rotulo="Aviso" valor={<span className="text-amber-600">{r.aviso}</span>} />}
              </div>
            );
          })}
        </Bloco>
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Filtros salvos                                                      */
/* ------------------------------------------------------------------ */
function FiltrosDoUsuario({
  secao,
  salvos,
  tiposLegenda,
}: {
  secao: AjudaSecao;
  salvos: FiltroSalvo[] | undefined;
  tiposLegenda: Map<string, string>;
}) {
  if (!secao.telaFiltros) return null;
  const salvo = salvos?.find((s) => s.tela === secao.telaFiltros);
  const filtros = salvo?.filtros ?? PADRAO_SISTEMA[secao.telaFiltros];
  const itens = descreverFiltros(secao.telaFiltros, filtros);
  const tiposSel = secao.telaFiltros === "cobranca" ? ((filtros?.tiposBoleto as string[] | undefined) ?? []) : [];

  return (
    <Bloco titulo="Seus filtros nesta tela" icone={SlidersHorizontal}>
      <p className="text-xs text-muted-foreground">
        {salvo
          ? <>Você salvou um padrão em {quando(salvo.updated_at)?.absoluto}. É assim que a tela abre para você — outros usuários podem ter padrões diferentes.</>
          : <>Você ainda não salvou um padrão. A tela abre com o padrão do sistema abaixo. Use <b>Salvar como padrão</b> na tela para guardar os seus.</>}
      </p>
      <div className="divide-y divide-border/50">
        {itens.map((i) => (
          <div key={i.rotulo} className="py-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-muted-foreground">{i.rotulo}</span>
              <span className="text-sm text-right">{i.valor}</span>
            </div>
            {i.efeito && <p className="text-[11px] text-muted-foreground mt-0.5">{i.efeito}</p>}
          </div>
        ))}
      </div>
      {tiposSel.length > 0 && (
        <div className="rounded-xl bg-muted/40 p-3 space-y-1">
          <p className="text-xs font-medium">O que são os tipos selecionados</p>
          {tiposSel.map((t) => (
            <p key={t} className="text-xs"><b>{t}</b>: {tiposLegenda.get(t.toUpperCase()) || "sem descrição cadastrada"}</p>
          ))}
        </div>
      )}
    </Bloco>
  );
}

/* ------------------------------------------------------------------ */
/* Conteúdo de um módulo                                               */
/* ------------------------------------------------------------------ */
function ConteudoModulo({
  secao,
  status,
  carregandoStatus,
  salvos,
  tiposLegenda,
  tipos,
}: {
  secao: AjudaSecao;
  status: StatusAlimentacao | undefined;
  carregandoStatus: boolean;
  salvos: FiltroSalvo[] | undefined;
  tiposLegenda: Map<string, string>;
  tipos: { tipo: string; descricao: string | null; grupo: string; qtd: number }[] | undefined;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">{secao.resumo}</p>

      <div className="grid gap-4 md:grid-cols-2">
        {carregandoStatus ? (
          <Skeleton className="h-48 rounded-2xl" />
        ) : status ? (
          <StatusModulo modulo={secao.id} s={status} />
        ) : (
          <Bloco titulo="Situação agora" icone={RefreshCw}>
            <p className="text-sm text-muted-foreground">Selecione uma associação para ver a situação da alimentação.</p>
          </Bloco>
        )}
        {secao.telaFiltros ? (
          <FiltrosDoUsuario secao={secao} salvos={salvos} tiposLegenda={tiposLegenda} />
        ) : (
          <Bloco titulo="Quando é atualizado" icone={Clock}>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {secao.atualizacao.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </Bloco>
        )}
      </div>

      <Bloco titulo="De onde vêm os dados" icone={Database}>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          {secao.origem.map((t) => <li key={t}>{t}</li>)}
        </ul>
        {secao.telaFiltros && (
          <>
            <p className="text-xs font-semibold pt-2">Quando é atualizado</p>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {secao.atualizacao.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </>
        )}
      </Bloco>

      <Bloco titulo="Regras de cálculo" icone={BookOpen}>
        <div className="grid gap-3 sm:grid-cols-2">
          {secao.regras.map((r) => (
            <div key={r.titulo} className="rounded-xl bg-muted/40 p-3">
              <p className="text-xs font-semibold mb-1">{r.titulo}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{r.texto}</p>
            </div>
          ))}
        </div>
      </Bloco>

      {secao.id === "cobranca" && tipos && tipos.length > 0 && (
        <Bloco titulo="Tipos de boleto desta associação (últimos 90 dias)" icone={CreditCard}>
          <div className="divide-y divide-border/50">
            {tipos.map((t) => (
              <div key={t.tipo} className="flex items-baseline justify-between gap-3 py-1.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t.tipo}</p>
                  <p className="text-[11px] text-muted-foreground">{t.descricao || "Sem descrição cadastrada"}</p>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">{num(t.qtd)} boletos</span>
              </div>
            ))}
          </div>
        </Bloco>
      )}

      {secao.graficos.length > 0 && (
        <Bloco titulo="Gráficos desta tela" icone={BarChart3}>
          <Accordion type="multiple" className="w-full">
            {secao.graficos.map((g) => (
              <AccordionItem key={g.titulo} value={g.titulo} className="border-border/50">
                <AccordionTrigger className="py-2.5 text-sm text-left hover:no-underline">{g.titulo}</AccordionTrigger>
                <AccordionContent className="space-y-1 text-xs">
                  <p><span className="text-muted-foreground">Mostra: </span>{g.mostra}</p>
                  <p><span className="text-muted-foreground">Fonte: </span>{g.fonte}</p>
                  {g.observacao && <p className="text-muted-foreground">{g.observacao}</p>}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Bloco>
      )}

      {secao.foraDaApi && (
        <Bloco titulo="O que não vem da Hinova" icone={Info}>
          {secao.foraDaApi.map((t) => <p key={t} className="text-sm text-muted-foreground">{t}</p>)}
        </Bloco>
      )}

      {secao.duvidas && secao.duvidas.length > 0 && (
        <Bloco titulo="Dúvidas comuns" icone={HelpCircle}>
          <Accordion type="multiple" className="w-full">
            {secao.duvidas.map((d) => (
              <AccordionItem key={d.pergunta} value={d.pergunta} className="border-border/50">
                <AccordionTrigger className="py-2.5 text-sm text-left hover:no-underline">{d.pergunta}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{d.resposta}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Bloco>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Visão geral                                                         */
/* ------------------------------------------------------------------ */
function VisaoGeral({ status, modulosVisiveis, onIr }: {
  status: StatusAlimentacao | undefined;
  modulosVisiveis: AjudaSecao[];
  onIr: (m: BIAjudaModulo) => void;
}) {
  const resumo = (m: BIAjudaModulo): { saude: Saude; iso: string | null } => {
    if (!status) return { saude: "inativo", iso: null };
    const i = status.integracao;
    switch (m) {
      case "indicadores": return { saude: saudeDe(status.indicadores.mes_atual_atualizado_em), iso: status.indicadores.mes_atual_atualizado_em };
      case "estudo-base": return { saude: saudeDe(status.base.ultima_conferencia ?? status.base.importado_em), iso: status.base.ultima_conferencia ?? status.base.importado_em };
      case "eventos": return { saude: saudeDe(status.eventos.atualizado_em, status.fila.eventos, i?.eventos !== false), iso: status.eventos.atualizado_em };
      case "mgf": return { saude: saudeDe(status.mgf.atualizado_em, status.fila.mgf, i?.mgf !== false), iso: status.mgf.atualizado_em };
      case "cobranca": return { saude: saudeDe(status.cobranca.atualizado_em, status.fila.cobranca_recente, i?.cobranca !== false), iso: status.cobranca.atualizado_em };
      case "relatorio": {
        const r = status.relatorio?.[0];
        return { saude: r ? (r.status === "failed" ? "erro" : saudeDe(r.ultimo_envio)) : "inativo", iso: r?.ultimo_envio ?? null };
      }
    }
  };

  return (
    <div className="space-y-4">
      {status && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {modulosVisiveis.map((sec) => {
            const r = resumo(sec.id);
            const Icone = ICONES[sec.id];
            return (
              <button key={sec.id} type="button" onClick={() => onIr(sec.id)}
                className="rounded-2xl border bg-card p-3 text-left hover:bg-muted/40 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium"><Icone className="h-4 w-4 text-primary" />{sec.titulo}</span>
                  <SaudeBadge saude={r.saude} />
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {quando(r.iso) ? `Atualizado ${quando(r.iso)!.relativo}` : "Sem registro de atualização"}
                </p>
              </button>
            );
          })}
        </div>
      )}

      <Bloco titulo={AJUDA_VISAO_GERAL.titulo} icone={Info}>
        {AJUDA_VISAO_GERAL.paragrafos.map((p) => <p key={p} className="text-sm text-muted-foreground leading-relaxed">{p}</p>)}
      </Bloco>

      <Bloco titulo="Calendário de atualização (horário de Brasília)" icone={Clock}>
        <div className="divide-y divide-border/50">
          {AJUDA_VISAO_GERAL.calendario.map((c) => (
            <div key={c.horario + c.oque} className="flex gap-3 py-1.5">
              <span className="w-40 shrink-0 text-xs font-semibold tabular-nums">
                {c.horario === "Horário da associação" && status?.integracao?.hora_agendada
                  ? `${status.integracao.hora_agendada} (sua associação)` : c.horario}
              </span>
              <span className="text-xs text-muted-foreground">{c.oque}</span>
            </div>
          ))}
        </div>
      </Bloco>

      <Bloco titulo="Glossário" icone={BookOpen}>
        <div className="grid gap-3 sm:grid-cols-2">
          {AJUDA_VISAO_GERAL.glossario.map((g) => (
            <div key={g.termo} className="rounded-xl bg-muted/40 p-3">
              <p className="text-xs font-semibold mb-1">{g.termo}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{g.texto}</p>
            </div>
          ))}
        </div>
      </Bloco>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Diálogo                                                             */
/* ------------------------------------------------------------------ */
type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  corretoraId: string | null | undefined;
  corretoraNome?: string | null;
  /** Aba inicial: módulo de onde a ajuda foi aberta. */
  moduloInicial?: string | null;
  /** Módulos visíveis para o usuário (ex.: modulos_bi do parceiro). Sem valor = todos. */
  modulosPermitidos?: string[] | null;
};

export default function BIAjudaDialog({ open, onOpenChange, corretoraId, corretoraNome, moduloInicial, modulosPermitidos }: Props) {
  const [aba, setAba] = useState<string>(() => moduloAjudaDe(moduloInicial));
  const [abertoAntes, setAbertoAntes] = useState(open);
  // ao reabrir, volta para a aba do módulo atual
  if (open && !abertoAntes) {
    setAbertoAntes(true);
    setAba(moduloAjudaDe(moduloInicial));
  } else if (!open && abertoAntes) {
    setAbertoAntes(false);
  }

  const idValido = !!corretoraId && corretoraId !== "__admin__";

  const statusQ = useQuery({
    queryKey: ["bi_status_alimentacao", corretoraId],
    enabled: open && idValido,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<StatusAlimentacao> => {
      const { data, error } = await supabase.rpc("bi_status_alimentacao" as never, { p_corretora_id: corretoraId } as never);
      if (error) throw error;
      return data as unknown as StatusAlimentacao;
    },
  });

  const salvosQ = useQuery({
    queryKey: ["bi_filtros_padrao_todos", corretoraId],
    enabled: open && idValido,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<FiltroSalvo[]> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return [];
      const { data, error } = await supabase
        .from("bi_filtros_padrao")
        .select("tela, filtros, updated_at")
        .eq("user_id", auth.user.id)
        .eq("corretora_id", corretoraId as string);
      if (error) throw error;
      return (data || []) as unknown as FiltroSalvo[];
    },
  });

  // Tipos de boleto: só busca quando a aba de cobrança é aberta (cache 30 min compartilhado com o filtro)
  const tiposQ = useTiposBoleto(open && idValido && aba === "cobranca" ? corretoraId : null);
  const tiposLegenda = useMemo(() => {
    const m = new Map<string, string>();
    (tiposQ.data || []).forEach((t) => t.descricao && m.set(t.tipo.toUpperCase(), t.descricao));
    if (!m.has("FECHAMENTO")) m.set("FECHAMENTO", "Mensalidade do mês");
    return m;
  }, [tiposQ.data]);

  const secoes = useMemo(() => {
    if (!modulosPermitidos || modulosPermitidos.length === 0) return AJUDA_SECOES;
    const perm = new Set(modulosPermitidos.map((m) => moduloAjudaDe(m)));
    return AJUDA_SECOES.filter((s) =>
      s.id === "relatorio" || perm.has(s.id) ||
      // Estudo de Base fica dentro de Indicadores no portal
      (s.id === "estudo-base" && perm.has("indicadores")),
    );
  }, [modulosPermitidos]);

  const erroStatus = statusQ.error ? (statusQ.error as { message?: string }).message : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[calc(100vw-1.5rem)] sm:w-full h-[92vh] sm:h-[88vh] p-0 gap-0 flex flex-col overflow-hidden rounded-2xl">
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0 text-left">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <HelpCircle className="h-5 w-5 text-primary" /> Ajuda do BI
          </DialogTitle>
          <DialogDescription className="text-xs">
            {corretoraNome ? <>Associação: <b>{corretoraNome}</b> · </> : null}
            O que cada tela mostra, de onde vem cada número e quando foi atualizado.
            {statusQ.data?.gerado_em && <> Situação consultada {quando(statusQ.data.gerado_em)?.relativo}.</>}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={aba} onValueChange={setAba} className="flex-1 flex flex-col min-h-0">
          <div className="px-3 sm:px-5 pt-3 shrink-0 overflow-x-auto scrollbar-hide">
            <TabsList className="h-auto p-1 rounded-xl w-max">
              <TabsTrigger value="geral" className="rounded-lg text-xs sm:text-sm gap-1.5"><Info className="h-3.5 w-3.5" />Visão geral</TabsTrigger>
              {secoes.map((s) => {
                const Icone = ICONES[s.id];
                return (
                  <TabsTrigger key={s.id} value={s.id} className="rounded-lg text-xs sm:text-sm gap-1.5">
                    <Icone className="h-3.5 w-3.5" />{s.titulo}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4">
            {erroStatus && (
              <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 flex items-center justify-between gap-2">
                <span>Não foi possível consultar a situação agora ({erroStatus}). O conteúdo de ajuda continua disponível.</span>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => statusQ.refetch()}>Tentar de novo</Button>
              </div>
            )}
            <TabsContent value="geral" className="mt-0">
              <VisaoGeral status={statusQ.data} modulosVisiveis={secoes} onIr={(m) => setAba(m)} />
            </TabsContent>
            {secoes.map((s) => (
              <TabsContent key={s.id} value={s.id} className="mt-0">
                <ConteudoModulo
                  secao={s}
                  status={statusQ.data}
                  carregandoStatus={statusQ.isLoading && idValido}
                  salvos={salvosQ.data}
                  tiposLegenda={tiposLegenda}
                  tipos={tiposQ.data}
                />
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
