import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { CheckCircle2, Copy, Eye, FileSignature, Loader2, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import NovoContratoWizard from "@/components/uonisign/NovoContratoWizard";
import { uonisign } from "@/lib/uonisign/api";
import { urlPublica } from "@/lib/trust";
import { emailValido, mascarar, soDigitos, type Dados } from "../../../supabase/functions/uonisign/modelo";
import type { ComercialCotacao } from "./types";

const fmt = (iso?: string | null) => (iso ? format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "");

interface Props {
  cotacao: ComercialCotacao | null;
  templateId: string;
  termos: Dados;
  leadNome: string;
  podeEditar: boolean;
  /** Grava a cotação (com os valores da tela) e devolve o id. */
  salvar: () => Promise<string>;
  /** Fecha o diálogo da cotação depois de uma ação concluída. */
  onFeito: () => void;
}

/** Da cotação para o contrato: enviar a proposta ao cliente ou preencher o contrato. */
export function PropostaContrato({ cotacao, templateId, termos, leadNome, podeEditar, salvar, onFeito }: Props) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [celular, setCelular] = useState("");
  const [whatsapp, setWhatsapp] = useState(false);
  const [ocupado, setOcupado] = useState<"enviar" | "contrato" | null>(null);
  const [wizard, setWizard] = useState<{ template_id: string; dados: Dados; cotacao_id: string } | null>(null);

  useEffect(() => {
    setEmail(cotacao?.cliente_email ?? "");
    setCelular(cotacao?.cliente_telefone ?? "");
    setWhatsapp((cotacao?.proposta_canais ?? []).includes("whatsapp"));
  }, [cotacao?.id, cotacao?.cliente_email, cotacao?.cliente_telefone, cotacao?.proposta_canais]);

  const aceita = !!cotacao?.aceite_em;
  const temContrato = !!cotacao?.contrato_id;
  const encerrada = !!cotacao && ["cancelada", "cancelamento_solicitado", "emitida"].includes(cotacao.status);
  const link = cotacao?.proposta_token ? `${urlPublica()}/proposta/${cotacao.proposta_token}` : null;
  const podeAgir = podeEditar && !encerrada && !temContrato;

  const enviar = async () => {
    if (!emailValido(email)) return toast.error("Informe um e-mail válido do cliente");
    if (whatsapp && soDigitos(celular).length !== 11) return toast.error("Celular com WhatsApp deve ter DDD + 9 dígitos");
    try {
      setOcupado("enviar");
      const id = await salvar();
      const r = await uonisign.propEnviar({ cotacao_id: id, email: email.trim(), telefone: soDigitos(celular), whatsapp });
      toast.success("Proposta enviada ao cliente!");
      if (whatsapp && r.whatsapp === false) toast.warning("O WhatsApp não foi entregue. O e-mail foi enviado normalmente.");
      qc.invalidateQueries({ queryKey: ["comercial_cotacoes"] });
      onFeito();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  const preencherContrato = async () => {
    try {
      setOcupado("contrato");
      const id = await salvar();
      qc.invalidateQueries({ queryKey: ["comercial_cotacoes"] });
      const dados: Dados = { ...termos };
      if (emailValido(email)) dados.Email = email.trim().toLowerCase();
      if (leadNome) dados.Representante_Legal = leadNome;
      setWizard({ template_id: templateId, dados, cotacao_id: id });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

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

      {temContrato && (
        <p className="text-sm rounded-lg bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 px-3 py-2">
          Contrato gerado. Acompanhe as assinaturas em <strong>Uon1 Sign</strong>.
        </p>
      )}

      {aceita && !temContrato && (
        <p className="text-sm rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 px-3 py-2">
          O cliente aceitou os valores, mas ainda não concluiu o preenchimento dos dados. Você pode reenviar o link ou preencher o contrato por ele.
        </p>
      )}

      {podeAgir && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="prop-email">E-mail do cliente</Label>
              <Input id="prop-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@empresa.com.br" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prop-cel">Celular com WhatsApp {whatsapp ? "" : "(opcional)"}</Label>
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
            <MessageCircle className="h-4 w-4 text-emerald-600" /> Também enviar a proposta e o código por WhatsApp
          </label>
          <div className="flex flex-wrap gap-2">
            {!aceita && (
              <Button onClick={enviar} disabled={!!ocupado}>
                {ocupado === "enviar" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                {cotacao?.proposta_enviada_em ? "Reenviar proposta" : "Enviar proposta ao cliente"}
              </Button>
            )}
            <Button variant="outline" onClick={preencherContrato} disabled={!!ocupado}>
              {ocupado === "contrato" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileSignature className="h-4 w-4 mr-1" />}
              Preencher o contrato eu mesmo
            </Button>
            {link && (
              <Button
                variant="ghost"
                onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Link da proposta copiado"))}
              >
                <Copy className="h-4 w-4 mr-1" /> Copiar link
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Na proposta, o cliente vê os valores, confirma o aceite com um código, preenche os dados da empresa e já assina o contrato. A
            proposta vale 15 dias.
          </p>
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
}
