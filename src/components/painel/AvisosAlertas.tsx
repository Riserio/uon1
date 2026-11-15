import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Clock, FileSignature, Hourglass, ThumbsUp, Users } from "lucide-react";
import { ROTA_MODULO } from "@/config/modulos";
import type { DadosComercial, DadosContratos } from "./dados";

interface Aviso {
  icone: LucideIcon;
  texto: string;
  detalhe?: string;
  para: string;
  urgente?: boolean;
}

/**
 * Faixa de pendências com prazo, logo abaixo da saudação. Só aparece quando há
 * algo que nenhuma outra tela avisa sozinha (prazo de assinatura acabando,
 * proposta aceita sem contrato, pedido de cancelamento). Mensagens e WhatsApp
 * não lidos ficam de fora: o menu já mostra esses contadores.
 */
export function AvisosFaixa({
  comercial,
  contratos,
  gestorComercial,
  usuariosPendentes,
}: {
  comercial?: DadosComercial;
  contratos?: DadosContratos;
  gestorComercial: boolean;
  usuariosPendentes: number;
}) {
  const rc = ROTA_MODULO.comercial;
  const rk = ROTA_MODULO.contratos;
  const nomes = (l: { lead?: { nome: string } | null; contratante_nome?: string | null; numero: string | number }[]) =>
    l
      .slice(0, 2)
      .map((x) => x.lead?.nome ?? x.contratante_nome ?? String(x.numero))
      .join(", ") + (l.length > 2 ? ` e mais ${l.length - 2}` : "");
  const p = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

  const avisos: Aviso[] = [];
  if (contratos?.prazoAcabando.length)
    avisos.push({ icone: Hourglass, urgente: true, para: rk, texto: p(contratos.prazoAcabando.length, "contrato com prazo de assinatura acabando", "contratos com prazo de assinatura acabando"), detalhe: nomes(contratos.prazoAcabando) });
  if (gestorComercial && comercial?.cotacoes.pedidosCancelamento)
    avisos.push({ icone: AlertTriangle, urgente: true, para: rc, texto: p(comercial.cotacoes.pedidosCancelamento, "pedido de cancelamento para decidir", "pedidos de cancelamento para decidir") });
  if (comercial?.aceitasSemContrato.length)
    avisos.push({ icone: ThumbsUp, para: rc, texto: p(comercial.aceitasSemContrato.length, "proposta aceita esperando os dados do cliente", "propostas aceitas esperando os dados do cliente"), detalhe: nomes(comercial.aceitasSemContrato) });
  if (comercial?.vencendo.length)
    avisos.push({ icone: Hourglass, para: rc, texto: p(comercial.vencendo.length, "proposta vence em até 3 dias", "propostas vencem em até 3 dias"), detalhe: nomes(comercial.vencendo) });
  if (contratos?.parados.length)
    avisos.push({ icone: FileSignature, para: rk, texto: p(contratos.parados.length, "contrato sem assinatura há mais de 7 dias", "contratos sem assinatura há mais de 7 dias"), detalhe: nomes(contratos.parados) });
  if (contratos?.vigenciaVencendo.length)
    avisos.push({ icone: Clock, para: rk, texto: p(contratos.vigenciaVencendo.length, "contrato com vigência vencendo em 30 dias", "contratos com vigência vencendo em 30 dias"), detalhe: nomes(contratos.vigenciaVencendo) });
  if (usuariosPendentes) avisos.push({ icone: Users, para: "/usuarios", texto: p(usuariosPendentes, "usuário aguardando aprovação", "usuários aguardando aprovação") });

  if (!avisos.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="list" aria-label="Pendências com prazo">
      {avisos.map((a) => (
        <Link
          key={a.texto}
          to={a.para}
          role="listitem"
          title={a.detalhe}
          className={`shrink-0 inline-flex items-center gap-2 rounded-full pl-3 pr-4 py-2 text-sm font-medium transition-colors ${
            a.urgente
              ? "bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-500/20"
              : "bg-amber-500/15 text-amber-800 dark:text-amber-300 hover:bg-amber-500/25"
          }`}
        >
          <a.icone className="h-4 w-4 shrink-0" />
          {a.texto}
        </Link>
      ))}
    </div>
  );
}
