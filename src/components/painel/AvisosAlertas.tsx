import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, BellRing, CheckCircle2, Clock, FileSignature, FileWarning, Hourglass, Mail, MessageSquare, ThumbsUp, Users } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ROTA_MODULO } from "@/config/modulos";
import { Cabecalho, CARTAO } from "./comum";
import type { DadosComercial, DadosContratos } from "./dados";

interface Aviso {
  icone: LucideIcon;
  texto: string;
  detalhe?: string;
  qtd: number;
  para: string;
  tom: "alerta" | "atencao" | "info";
}
const TOM = {
  alerta: { icone: "text-red-600", selo: "bg-red-500/15 text-red-700 dark:text-red-300" },
  atencao: { icone: "text-amber-600", selo: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  info: { icone: "text-blue-600", selo: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
};

/** O que pede ação do usuário agora. Só entra o que ele tem permissão para ver. */
export function AvisosAlertas({
  comercial,
  contratos,
  gestorComercial,
  whatsapp,
  mensagens,
  usuariosPendentes,
  podeVer,
}: {
  comercial?: DadosComercial;
  contratos?: DadosContratos;
  gestorComercial: boolean;
  whatsapp: number;
  mensagens: number;
  usuariosPendentes: number;
  podeVer: (modulo: string) => boolean;
}) {
  const rc = ROTA_MODULO.comercial;
  const rk = ROTA_MODULO.contratos;
  const nomes = (l: { lead?: { nome: string } | null; contratante_nome?: string | null; numero: string | number }[]) =>
    l
      .slice(0, 2)
      .map((x) => x.lead?.nome ?? x.contratante_nome ?? String(x.numero))
      .join(", ") + (l.length > 2 ? ` e mais ${l.length - 2}` : "");

  const avisos: Aviso[] = [];
  if (contratos) {
    if (contratos.prazoAcabando.length)
      avisos.push({ icone: Hourglass, tom: "alerta", qtd: contratos.prazoAcabando.length, para: rk, texto: "Contratos com prazo de assinatura acabando", detalhe: `Até 3 dias: ${nomes(contratos.prazoAcabando)}` });
    if (contratos.parados.length)
      avisos.push({ icone: FileSignature, tom: "atencao", qtd: contratos.parados.length, para: rk, texto: "Contratos sem assinatura há mais de 7 dias", detalhe: nomes(contratos.parados) });
    if (contratos.vigenciaVencendo.length)
      avisos.push({ icone: Clock, tom: "atencao", qtd: contratos.vigenciaVencendo.length, para: rk, texto: "Contratos com vigência vencendo em 30 dias", detalhe: nomes(contratos.vigenciaVencendo) });
    if (contratos.recusados) avisos.push({ icone: FileWarning, tom: "info", qtd: contratos.recusados, para: rk, texto: "Contratos recusados na assinatura" });
  }
  if (comercial) {
    if (comercial.aceitasSemContrato.length)
      avisos.push({ icone: ThumbsUp, tom: "atencao", qtd: comercial.aceitasSemContrato.length, para: rc, texto: "Propostas aceitas esperando os dados do cliente", detalhe: nomes(comercial.aceitasSemContrato) });
    if (comercial.vencendo.length)
      avisos.push({ icone: Hourglass, tom: "atencao", qtd: comercial.vencendo.length, para: rc, texto: "Propostas vencendo em até 3 dias sem aceite", detalhe: nomes(comercial.vencendo) });
    if (comercial.cotacoes.vencidas) avisos.push({ icone: Clock, tom: "info", qtd: comercial.cotacoes.vencidas, para: rc, texto: "Propostas vencidas sem resposta: reenvie ou encerre" });
    if (comercial.cotacoes.recusadas) avisos.push({ icone: FileWarning, tom: "info", qtd: comercial.cotacoes.recusadas, para: rc, texto: "Propostas recusadas pelo cliente" });
    if (gestorComercial && comercial.cotacoes.pedidosCancelamento)
      avisos.push({ icone: AlertTriangle, tom: "alerta", qtd: comercial.cotacoes.pedidosCancelamento, para: rc, texto: "Pedidos de cancelamento aguardando sua decisão" });
  }
  if (podeVer("emails") && whatsapp) avisos.push({ icone: MessageSquare, tom: "info", qtd: whatsapp, para: ROTA_MODULO.emails, texto: "Conversas de WhatsApp não lidas" });
  if (podeVer("mensagens") && mensagens) avisos.push({ icone: Mail, tom: "info", qtd: mensagens, para: ROTA_MODULO.mensagens, texto: "Mensagens internas não lidas" });
  if (usuariosPendentes) avisos.push({ icone: Users, tom: "atencao", qtd: usuariosPendentes, para: "/usuarios", texto: "Usuários aguardando aprovação" });

  const ordem = { alerta: 0, atencao: 1, info: 2 };
  avisos.sort((a, b) => ordem[a.tom] - ordem[b.tom]);

  return (
    <Card className={CARTAO}>
      <CardHeader className="pb-3 pt-4 px-5">
        <Cabecalho
          icone={BellRing}
          cor="bg-rose-500/10 text-rose-600"
          titulo="Avisos e alertas"
          direita={avisos.length ? <span className="text-xs text-muted-foreground">{avisos.length} para ver</span> : undefined}
        />
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {avisos.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle2 className="h-8 w-8 text-emerald-500/60 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Tudo em dia. Nada pede sua atenção agora.</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
            {avisos.map((a) => (
              <Link key={a.texto} to={a.para} className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors">
                <a.icone className={`h-4 w-4 shrink-0 ${TOM[a.tom].icone}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-snug">{a.texto}</p>
                  {a.detalhe && <p className="text-xs text-muted-foreground truncate">{a.detalhe}</p>}
                </div>
                <span className={`text-xs font-semibold rounded-full min-w-[28px] text-center px-2 py-0.5 tabular-nums ${TOM[a.tom].selo}`}>{a.qtd}</span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
