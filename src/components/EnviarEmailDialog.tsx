import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";

interface EnviarEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  atendimentoId: string;
  atendimentoAssunto: string;
  conteudoInicial?: string;
  emailInicial?: string;
  status?: string;
}

interface ResultadoEnvio {
  email: string;
  status: "enviado" | "erro";
  method?: string;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EnviarEmailDialog({
  open,
  onOpenChange,
  atendimentoId,
  atendimentoAssunto,
  conteudoInicial = "",
  emailInicial = "",
  status,
}: EnviarEmailDialogProps) {
  const [destinatario, setDestinatario] = useState("");
  const [assunto, setAssunto] = useState(`Atualização: ${atendimentoAssunto}`);
  const [mensagem, setMensagem] = useState(conteudoInicial);
  const [enviando, setEnviando] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  // Carrega template ativo do status ao abrir
  useEffect(() => {
    if (!open || !status) return;
    let cancelado = false;
    (async () => {
      setLoadingTemplate(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: templates, error } = await supabase
          .from("email_templates")
          .select("*")
          .eq("user_id", user.id)
          .eq("ativo", true)
          .contains("status", [status]);
        if (error) {
          console.error("Erro ao carregar template:", error);
          return;
        }
        if (!cancelado && templates && templates.length > 0) {
          setAssunto(templates[0].assunto);
          setMensagem(templates[0].corpo);
          toast.success("Template carregado automaticamente");
        }
      } catch (e) {
        console.error("Erro ao carregar template:", e);
      } finally {
        if (!cancelado) setLoadingTemplate(false);
      }
    })();
    return () => { cancelado = true; };
  }, [open, status]);

  useEffect(() => {
    if (emailInicial) setDestinatario(emailInicial);
  }, [emailInicial]);

  const resetCampos = () => {
    setDestinatario("");
    setAssunto(`Atualização: ${atendimentoAssunto}`);
    setMensagem("");
  };

  const handleEnviar = async () => {
    if (!destinatario.trim() || !assunto.trim() || !mensagem.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }

    const emails = destinatario.split(/[,;]/).map((e) => e.trim()).filter(Boolean);
    const invalidos = emails.filter((e) => !EMAIL_RE.test(e));
    if (invalidos.length > 0) {
      toast.error(`E-mail(s) inválido(s): ${invalidos.join(", ")}`);
      return;
    }

    setEnviando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data: atendimento } = await supabase
        .from("atendimentos")
        .select("status")
        .eq("id", atendimentoId)
        .maybeSingle();

      // A edge function envia E grava o histórico com o status real de cada destinatário.
      // Não duplicamos o registro aqui (antes gravava tudo como "enviado", mascarando falhas).
      const { data, error } = await supabase.functions.invoke("enviar-email-atendimento", {
        body: {
          to: emails,
          subject: assunto,
          message: mensagem,
          atendimentoAssunto,
          status: atendimento?.status || "andamento",
          atendimentoId,
        },
      });
      if (error) throw error;

      const resultados: ResultadoEnvio[] = data?.results ?? [];
      const enviados = resultados.filter((r) => r.status === "enviado");
      const falhas = resultados.filter((r) => r.status === "erro");

      // Sem results (resposta inesperada): trata como sucesso otimista do invoke
      if (resultados.length === 0) {
        toast.success(`E-mail enviado para ${emails.length} destinatário(s)`);
        onOpenChange(false);
        resetCampos();
        return;
      }

      if (enviados.length > 0 && falhas.length === 0) {
        toast.success(`E-mail enviado para ${enviados.length} destinatário(s)`);
        onOpenChange(false);
        resetCampos();
      } else if (enviados.length > 0 && falhas.length > 0) {
        toast.warning(`${enviados.length} enviado(s), ${falhas.length} falhou(aram): ${falhas.map((f) => f.email).join(", ")}`);
        // Mantém o diálogo aberto com os que falharam para reenvio
        setDestinatario(falhas.map((f) => f.email).join(", "));
      } else {
        toast.error(`Falha ao enviar: ${falhas[0]?.error || "verifique a configuração de e-mail"}`);
      }
    } catch (e) {
      console.error("Erro ao enviar e-mail:", e);
      toast.error(e instanceof Error ? e.message : "Erro ao enviar e-mail");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Enviar e-mail ao cliente</DialogTitle>
          <DialogDescription>Envie uma atualização sobre o atendimento por e-mail</DialogDescription>
        </DialogHeader>
        {loadingTemplate ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2 text-sm text-muted-foreground">Carregando template...</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="destinatario">E-mail do(s) destinatário(s) *</Label>
              <Input
                id="destinatario"
                type="text"
                placeholder="cliente@exemplo.com, outro@exemplo.com"
                value={destinatario}
                onChange={(e) => setDestinatario(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Separe múltiplos e-mails com vírgula ou ponto e vírgula</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assunto">Assunto *</Label>
              <Input id="assunto" value={assunto} onChange={(e) => setAssunto(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mensagem">Mensagem *</Label>
              <Textarea
                id="mensagem"
                rows={8}
                placeholder="Digite a mensagem para o cliente..."
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
                Cancelar
              </Button>
              <Button onClick={handleEnviar} disabled={enviando}>
                {enviando ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...</>
                ) : (
                  <><Send className="mr-2 h-4 w-4" /> Enviar e-mail</>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
