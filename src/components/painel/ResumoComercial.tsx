import { Link } from "react-router-dom";
import { FileSignature, Target } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ROTA_MODULO } from "@/config/modulos";
import { NIVEL_LABEL, type ComercialNivel } from "@/components/comercial/types";
import { brl, Cabecalho, Caminho, CARTAO, Laterais, Rotulo } from "./comum";
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
    <section className={`${CARTAO} p-5 space-y-4 h-full`}>
      <Cabecalho
        icone={Target}
        cor="bg-emerald-500/10 text-emerald-600"
        titulo="Comercial"
        subtitulo={nivel !== "nenhum" ? `${ESCOPO[nivel]} (${NIVEL_LABEL[nivel]})` : undefined}
        direita={
          <Link to={rota} className="text-xs font-medium text-primary hover:underline">
            Abrir funil
          </Link>
        }
      />
      {carregando || !dados ? (
        <Skeleton className="h-44 rounded-2xl" />
      ) : (
        <>
          <div>
            <Rotulo>Propostas, do rascunho ao contrato</Rotulo>
            <Caminho
              para={rota}
              etapas={[
                { rotulo: "Não enviadas", valor: dados.cotacoes.rascunho, barra: "bg-slate-400", texto: "text-foreground" },
                {
                  rotulo: "Aguardando aceite",
                  valor: dados.cotacoes.aguardando,
                  detalhe: dados.cotacoes.aguardando ? brl(dados.cotacoes.valorAguardando) : undefined,
                  barra: "bg-blue-500",
                  texto: "text-blue-600",
                },
                { rotulo: "Aceitas", valor: dados.cotacoes.aceitas, detalhe: dados.cotacoes.aceitas ? "contrato a caminho" : undefined, barra: "bg-violet-500", texto: "text-violet-600" },
                {
                  rotulo: "Assinadas no mês",
                  valor: dados.cotacoes.emitidasMes,
                  detalhe: dados.cotacoes.emitidasMes ? brl(dados.cotacoes.valorEmitidoMes) : undefined,
                  barra: "bg-emerald-500",
                  texto: "text-emerald-600",
                },
              ]}
            />
            <div className="mt-2">
              <Laterais
                para={rota}
                itens={[
                  { rotulo: "vencidas sem resposta", valor: dados.cotacoes.vencidas, tom: "atencao" },
                  { rotulo: "recusadas", valor: dados.cotacoes.recusadas, tom: "alerta" },
                  { rotulo: "canceladas", valor: dados.cotacoes.canceladas },
                  { rotulo: "com cancelamento pedido", valor: dados.cotacoes.pedidosCancelamento, tom: "atencao" },
                ]}
              />
            </div>
          </div>
          <div>
            <Rotulo>Leads</Rotulo>
            <Link to={rota} className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border/60 rounded-2xl bg-muted/40 hover:bg-muted/60 transition-colors">
              {[
                { v: dados.leads.abertos, r: "em aberto", c: "" },
                { v: dados.leads.novos7d, r: "novos em 7 dias", c: "text-blue-600" },
                { v: dados.leads.ganhosMes, r: "ganhos no mês", c: "text-emerald-600" },
                { v: dados.leads.perdidosMes, r: "perdidos no mês", c: dados.leads.perdidosMes ? "text-red-600" : "" },
              ].map((x) => (
                <div key={x.r} className="px-4 py-3">
                  <p className={`text-xl font-bold tabular-nums ${x.c}`}>{x.v}</p>
                  <p className="text-xs text-muted-foreground">{x.r}</p>
                </div>
              ))}
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

/** Contratos do Uon1 Sign que o usuário pode ver (próprios, equipe ou todos). */
export function ResumoContratos({ dados, carregando }: { dados?: DadosContratos; carregando: boolean }) {
  const rota = ROTA_MODULO.contratos;
  return (
    <section className={`${CARTAO} p-5 space-y-4 h-full`}>
      <Cabecalho
        icone={FileSignature}
        cor="bg-amber-500/10 text-amber-600"
        titulo="Contratos"
        subtitulo="Uon1 Sign"
        direita={
          <Link to={rota} className="text-xs font-medium text-primary hover:underline">
            Abrir contratos
          </Link>
        }
      />
      {carregando || !dados ? (
        <Skeleton className="h-44 rounded-2xl" />
      ) : (
        <>
          <Caminho
            para={rota}
            etapas={[
              { rotulo: "Rascunhos", valor: dados.rascunhos, barra: "bg-slate-400", texto: "text-foreground" },
              { rotulo: "A assinar", valor: dados.aAssinar.length, barra: "bg-amber-500", texto: "text-amber-600" },
              { rotulo: "Assinados", valor: dados.assinados, detalhe: `${dados.assinadosMes} neste mês`, barra: "bg-emerald-500", texto: "text-emerald-600" },
            ]}
          />
          <Laterais
            para={rota}
            itens={[
              { rotulo: "vencidos sem assinar", valor: dados.expirados, tom: "atencao" },
              { rotulo: "recusados", valor: dados.recusados, tom: "alerta" },
              { rotulo: "cancelados", valor: dados.cancelados },
            ]}
          />
          {dados.aAssinar.length > 0 && (
            <div>
              <Rotulo>Aguardando assinatura</Rotulo>
              <div className="space-y-1">
                {dados.aAssinar.slice(0, 4).map((k) => (
                  <Link key={k.id} to={rota} className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-muted/60 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{k.contratante_nome || k.titulo}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {k.numero}
                        {k.expira_em && `, assinar até ${new Date(k.expira_em).toLocaleDateString("pt-BR")}`}
                      </p>
                    </div>
                    <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-amber-500/15 text-amber-700 dark:text-amber-300 shrink-0">
                      {k.status === "parcialmente_assinado" ? "Falta a contratada" : "Falta o cliente"}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
