import { Link } from "react-router-dom";
import { FileSignature, Target } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ROTA_MODULO } from "@/config/modulos";
import { NIVEL_LABEL, type ComercialNivel } from "@/components/comercial/types";
import { brl, Cabecalho, CARTAO, Indicador } from "./comum";
import type { DadosComercial, DadosContratos } from "./dados";

const ESCOPO: Record<ComercialNivel, string> = {
  admin: "Todas as equipes",
  gerente: "Suas equipes",
  lider: "Sua equipe",
  direto: "Seus leads e propostas",
  nenhum: "",
};

/** Funil do usuário: leads e propostas que a hierarquia dele deixa ver. */
export function ResumoComercial({ dados, carregando, nivel }: { dados?: DadosComercial; carregando: boolean; nivel: ComercialNivel }) {
  const rota = ROTA_MODULO.comercial;
  return (
    <Card className={CARTAO}>
      <CardHeader className="pb-3 pt-4 px-5">
        <Cabecalho
          icone={Target}
          cor="bg-emerald-500/10 text-emerald-600"
          titulo="Comercial"
          subtitulo={nivel !== "nenhum" ? `${ESCOPO[nivel]} · ${NIVEL_LABEL[nivel]}` : undefined}
          direita={
            <Link to={rota} className="text-xs text-primary hover:underline">
              Abrir funil
            </Link>
          }
        />
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-3">
        {carregando || !dados ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : (
          <>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Leads</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Indicador valor={dados.leads.abertos} rotulo="Em aberto" para={rota} />
                <Indicador valor={dados.leads.novos7d} rotulo="Novos em 7 dias" para={rota} />
                <Indicador valor={dados.leads.ganhosMes} rotulo="Ganhos no mês" cor="text-emerald-600" para={rota} />
                <Indicador valor={dados.leads.perdidosMes} rotulo="Perdidos no mês" cor={dados.leads.perdidosMes ? "text-red-600" : ""} para={rota} />
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Propostas</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Indicador valor={dados.cotacoes.rascunho} rotulo="Em rascunho" para={rota} />
                <Indicador
                  valor={dados.cotacoes.aguardando}
                  rotulo="Aguardando aceite"
                  detalhe={dados.cotacoes.aguardando ? brl(dados.cotacoes.valorAguardando) : undefined}
                  cor="text-blue-600"
                  para={rota}
                />
                <Indicador valor={dados.cotacoes.aceitas} rotulo="Aceitas" detalhe="a caminho do contrato" cor="text-violet-600" para={rota} />
                <Indicador
                  valor={dados.cotacoes.emitidasMes}
                  rotulo="Emitidas no mês"
                  detalhe={dados.cotacoes.emitidasMes ? brl(dados.cotacoes.valorEmitidoMes) : undefined}
                  cor="text-emerald-600"
                  para={rota}
                />
                <Indicador valor={dados.cotacoes.vencidas} rotulo="Vencidas sem aceite" cor={dados.cotacoes.vencidas ? "text-amber-600" : ""} para={rota} />
                <Indicador valor={dados.cotacoes.recusadas} rotulo="Recusadas" cor={dados.cotacoes.recusadas ? "text-red-600" : ""} para={rota} />
                <Indicador valor={dados.cotacoes.canceladas} rotulo="Canceladas" para={rota} />
                <Indicador valor={dados.cotacoes.pedidosCancelamento} rotulo="Cancelamento pedido" cor={dados.cotacoes.pedidosCancelamento ? "text-amber-600" : ""} para={rota} />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Contratos do Uon1 Sign que o usuário pode ver (próprios, equipe ou todos). */
export function ResumoContratos({ dados, carregando }: { dados?: DadosContratos; carregando: boolean }) {
  const rota = ROTA_MODULO.contratos;
  return (
    <Card className={CARTAO}>
      <CardHeader className="pb-3 pt-4 px-5">
        <Cabecalho
          icone={FileSignature}
          cor="bg-amber-500/10 text-amber-600"
          titulo="Contratos"
          subtitulo="Uon1 Sign"
          direita={
            <Link to={rota} className="text-xs text-primary hover:underline">
              Abrir contratos
            </Link>
          }
        />
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-3">
        {carregando || !dados ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Indicador valor={dados.aAssinar.length} rotulo="A assinar" cor="text-amber-600" para={rota} />
              <Indicador valor={dados.assinados} rotulo="Assinados" detalhe={`${dados.assinadosMes} neste mês`} cor="text-emerald-600" para={rota} />
              <Indicador valor={dados.rascunhos} rotulo="Rascunhos" para={rota} />
              <Indicador valor={dados.expirados} rotulo="Vencidos sem assinar" cor={dados.expirados ? "text-amber-600" : ""} para={rota} />
              <Indicador valor={dados.cancelados} rotulo="Cancelados" para={rota} />
              <Indicador valor={dados.recusados} rotulo="Recusados" cor={dados.recusados ? "text-red-600" : ""} para={rota} />
            </div>
            {dados.aAssinar.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Aguardando assinatura</p>
                {dados.aAssinar.slice(0, 4).map((k) => (
                  <Link key={k.id} to={rota} className="flex items-center gap-2 rounded-lg px-2.5 py-2 bg-muted/40 hover:bg-muted/60 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{k.contratante_nome || k.titulo}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {k.numero}
                        {k.expira_em && ` · assinar até ${new Date(k.expira_em).toLocaleDateString("pt-BR")}`}
                      </p>
                    </div>
                    <span className="text-[11px] rounded-full px-2 py-0.5 bg-amber-500/15 text-amber-700 shrink-0">
                      {k.status === "parcialmente_assinado" ? "Falta 1" : "Pendente"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
