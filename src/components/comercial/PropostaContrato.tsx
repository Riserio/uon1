import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { CheckCircle2, Copy, Eye, FileSignature, MessageCircle, Send, UserPen, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import NovoContratoWizard from "@/components/uonisign/NovoContratoWizard";
import { uonisign } from "@/lib/uonisign/api";
import { urlPublica } from "@/lib/trust";
import { emailValido, mascarar, soDigitos, type Dados } from "../../../supabase/functions/uonisign/modelo";
import { situacaoCotacao, type ComercialCotacao } from "./types";

const CONTRATO_ROTULO: Record<string, string> = {
  rascunho: "em rascunho",
  aguardando_assinatura: "aguardando a assinatura do cliente",
  parcialmente_assinado: "assinado pelo cliente; falta a contratada",
  assinado_processando: "assinado; gerando a via final",
  assinado: "assinado por todas as partes",
  recusado: "recusado na assinatura",
  expirado: "vencido sem assinatura",
  cancelado: "cancelado",
};

const fmt = (iso?: string | null) => (iso ? format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "");

export type ModoProposta = "enviar" | "preencher";

export interface PropostaContratoRef {
  /** Grava a cotação e segue pelo caminho escolhido (enviar ao cliente ou preencher o contrato). */
  executar: () => Promise<void>;
}

interface Props {
  cotacao: ComercialCotacao | null;
  leadId: string;
  templateId: string;
  termos: Dados;
  leadNome: string;
  podeEditar: boolean;
  modo: ModoProposta;
  onModo: (m: ModoProposta) => void;
  /** Avisa o diálogo se há ação disponível e se está ocupada (para o botão do rodapé). */
  onEstado: (e: { podeAgir: boolean; ocupado: boolean; podeEnviar: boolean }) => void;
  /** Grava a cotação (com os valores da tela) e devolve o id. */
  salvar: () => Promise<string>;
  /** Fecha o diálogo da cotação depois de uma ação concluída. */
  onFeito: () => void;
}

/** Celular como o sistema usa (DDD + 9 dígitos), aceitando número salvo com 55 na frente. */
const celularBR = (v?: string | null) => {
  const d = soDigitos(v ?? "");
  return d.length === 13 && d.startsWith("55") ? d.slice(2) : d;
};

/** Da cotação para o contrato: enviar a proposta ao cliente ou preencher o contrato. */
export const PropostaContrato = forwardRef<PropostaContratoRef, Props>(function PropostaContrato(
  { cotacao, leadId, templateId, termos, leadNome, podeEditar, modo, onModo, onEstado, salvar, onFeito },
  ref,
) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [celular, setCelular] = useState("");
  const [whatsapp, setWhatsapp] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [wizard, setWizard] = useState<{ template_id: string; dados: Dados; cotacao_id: string; telefone?: string; whatsapp?: boolean } | null>(null);

  // Contato cadastrado no lead: o celular já vem preenchido
  const { data: lead } = useQuery({
    queryKey: ["cotacao_lead_contato", leadId],
    enabled: !!leadId,
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("comercial_leads").select("whatsapp").eq("id", leadId).maybeSingle();
      return (data ?? null) as { whatsapp: string | null } | null;
    },
  });

  useEffect(() => {
    const tel = celularBR(cotacao?.cliente_telefone) || celularBR(lead?.whatsapp);
    setEmail(cotacao?.cliente_email ?? "");
    setCelular(tel);
    // já enviada: repete a escolha anterior; senão, WhatsApp ligado quando há celular
    setWhatsapp(cotacao?.proposta_canais ? cotacao.proposta_canais.includes("whatsapp") : tel.length === 11);
  }, [cotacao?.id, cotacao?.cliente_email, cotacao?.cliente_telefone, cotacao?.proposta_canais, lead?.whatsapp]);

  // Status do contrato no Uon1 Sign (a RLS só devolve se o usuário pode vê-lo)
  const { data: contrato } = useQuery({
    queryKey: ["cotacao_contrato", cotacao?.contrato_id],
    enabled: !!cotacao?.contrato_id,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("contratos").select("numero, status").eq("id", cotacao!.contrato_id).maybeSingle();
      return (data ?? null) as { numero: string; status: string } | null;
    },
  });
  const recusada = cotacao?.status === "recusada";
  const contratoEncerrado = !!contrato && ["recusado", "expirado", "cancelado"].includes(contrato.status);
  const aceita = !!cotacao?.aceite_em && !recusada;
  const temContrato = !!cotacao?.contrato_id && !recusada && !contratoEncerrado;
  const encerrada = !!cotacao && ["cancelada", "cancelamento_solicitado", "emitida"].includes(cotacao.status);
  const link = cotacao?.proposta_token ? `${urlPublica()}/proposta/${cotacao.proposta_token}` : null;
  const podeAgir = podeEditar && !encerrada && !temContrato;
  // depois do aceite não há o que reenviar: só resta preencher o contrato
  const podeEnviar = podeAgir && !aceita;

  useEffect(() => {
    if (podeAgir && !podeEnviar && modo === "enviar") onModo("preencher");
    onEstado({ podeAgir, ocupado, podeEnviar });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeAgir, podeEnviar, ocupado, modo]);

  const validarContato = () => {
    if (!emailValido(email)) return "Informe um e-mail válido do cliente";
    if (whatsapp && soDigitos(celular).length !== 11) return "Para enviar por WhatsApp, informe o celular com DDD + 9 dígitos";
    return null;
  };

  const enviar = async () => {
    const erro = validarContato();
    if (erro) return void toast.error(erro);
    const id = await salvar();
    const r = await uonisign.propEnviar({ cotacao_id: id, email: email.trim(), telefone: soDigitos(celular), whatsapp });
    toast.success("Proposta enviada ao cliente!");
    if (whatsapp && r.whatsapp === false) toast.warning("O WhatsApp não foi entregue. O e-mail foi enviado normalmente.");
    qc.invalidateQueries({ queryKey: ["comercial_cotacoes"] });
    onFeito();
  };

  const preencherContrato = async () => {
    if (whatsapp && soDigitos(celular).length !== 11) return void toast.error("Para enviar por WhatsApp, informe o celular com DDD + 9 dígitos");
    const id = await salvar();
    qc.invalidateQueries({ queryKey: ["comercial_cotacoes"] });
    const dados: Dados = { ...termos };
    if (emailValido(email)) dados.Email = email.trim().toLowerCase();
    if (leadNome) dados.Representante_Legal = leadNome;
    setWizard({ template_id: templateId, dados, cotacao_id: id, telefone: soDigitos(celular), whatsapp });
  };

  useImperativeHandle(ref, () => ({
    executar: async () => {
      if (!podeAgir || ocupado) return;
      try {
        setOcupado(true);
        await (modo === "enviar" && podeEnviar ? enviar() : preencherContrato());
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setOcupado(false);
      }
    },
  }));

  const OPCOES: { id: ModoProposta; icone: typeof Send; titulo: string; texto: string }[] = [
    { id: "enviar", icone: Send, titulo: "Enviar para o cliente", texto: "Ele vê os valores, aceita com um código, preenche os dados da empresa e assina." },
    { id: "preencher", icone: UserPen, titulo: "Eu preencho o contrato", texto: "Você informa os dados do cliente agora e envia o contrato pronto para assinatura." },
  ];

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <p className="text-sm font-semibold flex items-center gap-2">
        <FileSignature className="h-4 w-4" /> Proposta e contrato
      </p>

      {cotacao?.proposta_enviada_em && (
        <ul className="text-xs text-muted-foreground space-y-1">
          <li className="flex items-center gap-1.5">
            <Send className="h-3.5 w-3.5" /> Proposta enviada em {fmt(cotacao.proposta_enviada_em)}
            {cotacao.validade_ate && !aceita && ` · vale até ${format(new Date(cotacao.validade_ate), "dd/MM/yyyy")}`}
          </li>
          {cotacao.proposta_vista_em && (
            <li className="flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" /> Aberta pelo cliente em {fmt(cotacao.proposta_vista_em)}
            </li>
          )}
          {aceita && (
            <li className="flex items-center gap-1.5 text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Aceita em {fmt(cotacao.aceite_em)} (código por{" "}
              {cotacao.aceite_canal === "whatsapp" ? "WhatsApp" : "e-mail"}
              {cotacao.aceite_contato ? `: ${cotacao.aceite_contato}` : ""})
            </li>
          )}
        </ul>
      )}

      {recusada && (
        <p className="text-sm rounded-lg bg-red-500/10 text-red-800 dark:text-red-300 px-3 py-2 flex gap-2">
          <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Recusada{cotacao?.recusada_em ? ` em ${fmt(cotacao.recusada_em)}` : ""}.{cotacao?.motivo_recusa ? ` Motivo: ${cotacao.motivo_recusa}` : ""} Você pode
            ajustar os valores e enviar de novo.
          </span>
        </p>
      )}

      {cotacao?.contrato_id && contrato && !recusada && (
        <p
          className={`text-sm rounded-lg px-3 py-2 ${
            contratoEncerrado ? "bg-amber-500/10 text-amber-800 dark:text-amber-300" : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
          }`}
        >
          Contrato <strong>{contrato.numero}</strong>: {CONTRATO_ROTULO[contrato.status] ?? contrato.status}.
          {contratoEncerrado ? " Gere um novo contrato para seguir." : " Acompanhe em Uon1 Sign."}
        </p>
      )}

      {aceita && !temContrato && (
        <p className="text-sm rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 px-3 py-2">
          O cliente aceitou os valores, mas ainda não concluiu o preenchimento dos dados. Você pode preencher o contrato por ele.
        </p>
      )}

      {podeAgir && (
        <>
          {podeEnviar && (
            <div role="radiogroup" aria-label="Como seguir com esta cotação" className="grid gap-2 sm:grid-cols-2">
              {OPCOES.map((o) => {
                const ativo = modo === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    onClick={() => onModo(o.id)}
                    className={`text-left rounded-xl border p-3 transition-colors ${
                      ativo ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${ativo ? "border-primary" : "border-muted-foreground/40"}`}>
                        {ativo && <span className="h-2 w-2 rounded-full bg-primary" />}
                      </span>
                      <o.icone className="h-4 w-4" /> {o.titulo}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-1 pl-6">{o.texto}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="prop-email">E-mail do cliente</Label>
              <Input id="prop-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@empresa.com.br" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prop-cel">Celular do cliente</Label>
              <Input
                id="prop-cel"
                inputMode="tel"
                placeholder="(31) 99999-9999"
                value={mascarar("celular", celular)}
                onChange={(e) => setCelular(soDigitos(e.target.value))}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={whatsapp} onCheckedChange={setWhatsapp} />
            <MessageCircle className="h-4 w-4 text-emerald-600" /> Enviar também pelo WhatsApp
          </label>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] text-muted-foreground">
              {modo === "enviar" && podeEnviar ? "A proposta vale 15 dias. O e-mail sempre recebe o link." : "O contrato abre já com modelo, valores e contato preenchidos."}
            </p>
            {link && (
              <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Link da proposta copiado"))}>
                <Copy className="h-4 w-4 mr-1" /> Copiar link da proposta
              </Button>
            )}
          </div>
        </>
      )}

      <NovoContratoWizard
        open={!!wizard}
        onOpenChange={(o) => {
          if (!o) {
            setWizard(null);
            qc.invalidateQueries({ queryKey: ["comercial_cotacoes"] });
            onFeito();
          }
        }}
        inicial={wizard}
      />
    </div>
  );
});
