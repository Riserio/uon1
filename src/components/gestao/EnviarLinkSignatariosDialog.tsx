import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, Mail, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { openWhatsApp } from "@/utils/whatsapp";

type Canal = "whatsapp" | "email";

interface Destinatario {
  id: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  tipo?: string | null;
  status?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  canal: Canal;
  contrato: any;
}

export default function EnviarLinkSignatariosDialog({ open, onOpenChange, canal, contrato }: Props) {
  const destinatarios = useMemo<Destinatario[]>(() => {
    if (!contrato) return [];
    const lista: Destinatario[] = [];
    const assinaturas: any[] = contrato.contrato_assinaturas || [];

    // Use as assinaturas como fonte canônica (inclui contratante + extras)
    assinaturas.forEach((a) => {
      if (a.status === "assinado") return; // já assinou, não precisa enviar
      // ignorar contratada auto-assinada (já tratado pelo filtro acima)
      lista.push({
        id: a.id,
        nome: a.nome || "Sem nome",
        email: a.email,
        telefone: a.telefone,
        tipo: a.tipo,
        status: a.status,
      });
    });

    // Fallback: se não houver assinaturas (contratos antigos), usa contratante
    if (lista.length === 0 && contrato.contratante_nome) {
      lista.push({
        id: "contratante",
        nome: contrato.contratante_nome,
        email: contrato.contratante_email,
        telefone: contrato.contratante_telefone,
        tipo: "contratante",
      });
    }

    return lista;
  }, [contrato]);

  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({});

  const todosMarcados = destinatarios.length > 0 && destinatarios.every((d) => selecionados[d.id]);
  const algumMarcado = destinatarios.some((d) => selecionados[d.id]);

  const toggleTodos = () => {
    if (todosMarcados) {
      setSelecionados({});
    } else {
      const novo: Record<string, boolean> = {};
      destinatarios.forEach((d) => (novo[d.id] = true));
      setSelecionados(novo);
    }
  };

  const handleEnviar = () => {
    const alvos = destinatarios.filter((d) => selecionados[d.id]);
    if (alvos.length === 0) {
      toast.error("Selecione ao menos um destinatário.");
      return;
    }

    if (!contrato.link_token) {
      toast.error("Link ainda não disponível. Envie o contrato para assinatura primeiro.");
      return;
    }
    const link = `${window.location.origin}/contrato/${contrato.link_token}`;

    if (canal === "whatsapp") {
      const semTelefone = alvos.filter((a) => !a.telefone);
      if (semTelefone.length === alvos.length) {
        toast.error("Nenhum destinatário selecionado possui telefone cadastrado.");
        return;
      }
      alvos.forEach((a) => {
        if (!a.telefone) return;
        openWhatsApp({
          phone: a.telefone,
          message: `Olá ${a.nome}!\n\nSegue o link para assinatura do contrato "${contrato.titulo}":\n\n${link}\n\nAtenciosamente.`,
        });
      });
      if (semTelefone.length > 0) {
        toast.warning(`${semTelefone.length} destinatário(s) sem telefone foram ignorados.`);
      } else {
        toast.success("WhatsApp aberto para os destinatários selecionados.");
      }
    } else {
      // E-mail: agrupa todos em um único mailto (To)
      const emails = alvos.map((a) => a.email).filter(Boolean) as string[];
      if (emails.length === 0) {
        toast.error("Nenhum destinatário selecionado possui e-mail cadastrado.");
        return;
      }
      const nomes = alvos.map((a) => a.nome).join(", ");
      const subject = encodeURIComponent(`Contrato para assinatura: ${contrato.titulo}`);
      const body = encodeURIComponent(
        `Olá ${nomes}!\n\nSegue o link para assinatura do contrato "${contrato.titulo}":\n\n${link}\n\nAtenciosamente.`,
      );
      const mailtoUrl = `mailto:${emails.join(",")}?subject=${subject}&body=${body}`;
      window.open(mailtoUrl, "_blank");
      toast.success("E-mail preparado para os destinatários selecionados.");
    }

    onOpenChange(false);
    setSelecionados({});
  };

  const Icon = canal === "whatsapp" ? MessageCircle : Mail;
  const titulo = canal === "whatsapp" ? "Enviar via WhatsApp" : "Enviar por E-mail";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {titulo}
          </DialogTitle>
          <DialogDescription>
            Selecione quem deve receber o link de assinatura.
          </DialogDescription>
        </DialogHeader>

        {destinatarios.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Nenhum signatário pendente neste contrato.
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={toggleTodos}
              className="flex items-center gap-3 w-full rounded-lg border bg-muted/40 px-3 py-2 text-left hover:bg-muted/60 transition-colors"
            >
              <Checkbox checked={todosMarcados} className="pointer-events-none" />
              <span className="font-medium text-sm">
                {todosMarcados ? "Desmarcar todos" : "Enviar para todos"}
              </span>
              <Badge variant="secondary" className="ml-auto">
                {destinatarios.length}
              </Badge>
            </button>

            <ScrollArea className="max-h-[320px] pr-2">
              <div className="space-y-2">
                {destinatarios.map((d) => {
                  const checked = !!selecionados[d.id];
                  const contato = canal === "whatsapp" ? d.telefone : d.email;
                  const semContato = !contato;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() =>
                        setSelecionados((s) => ({ ...s, [d.id]: !checked }))
                      }
                      className={`flex items-start gap-3 w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                        checked ? "bg-primary/5 border-primary/40" : "hover:bg-muted/40"
                      }`}
                    >
                      <Checkbox checked={checked} className="mt-0.5 pointer-events-none" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{d.nome}</span>
                          {d.tipo && (
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {d.tipo}
                            </Badge>
                          )}
                        </div>
                        <p
                          className={`text-xs truncate ${
                            semContato ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          {contato || (canal === "whatsapp" ? "Sem telefone cadastrado" : "Sem e-mail cadastrado")}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleEnviar} disabled={!algumMarcado}>
            <Icon className="h-4 w-4 mr-2" />
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}