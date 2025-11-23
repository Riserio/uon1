import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Clock, Send, Loader2, User, Calendar, Mail, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Andamento {
  id: string;
  descricao: string;
  created_at: string;
  created_by: string;
  criador?: {
    nome: string;
  };
}

interface AndamentosDialogProps {
  atendimentoId: string;
  atendimentoAssunto: string;
  atendimentoNumero?: number;
  mode: "view" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AndamentosDialog({
  atendimentoId,
  atendimentoAssunto,
  atendimentoNumero,
  mode,
  open,
  onOpenChange,
}: AndamentosDialogProps) {
  const [andamentos, setAndamentos] = useState<Andamento[]>([]);
  const [novoAndamento, setNovoAndamento] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailDialog, setEmailDialog] = useState<{ open: boolean; andamento: Andamento | null }>({
    open: false,
    andamento: null,
  });
  const [emailDestinatario, setEmailDestinatario] = useState("");
  const [enviandoEmail, setEnviandoEmail] = useState(false);

  useEffect(() => {
    if (open && atendimentoId) {
      loadAndamentos();
    }
  }, [open, atendimentoId]);

  const loadAndamentos = async () => {
    const { data, error } = await supabase
      .from("andamentos")
      .select("*")
      .eq("atendimento_id", atendimentoId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar andamentos");
      console.error(error);
      return;
    }

    // Buscar nomes dos criadores
    const userIds = [...new Set(data?.map((a) => a.created_by) || [])];
    const { data: profiles } = await supabase.from("profiles").select("id, nome").in("id", userIds);

    const profilesMap = new Map(profiles?.map((p) => [p.id, p.nome]) || []);

    setAndamentos(
      (data || []).map((item) => ({
        id: item.id,
        descricao: item.descricao,
        created_at: item.created_at,
        created_by: item.created_by,
        criador: { nome: profilesMap.get(item.created_by) || "Usuário" },
      })),
    );
  };

  const handleAddAndamento = async () => {
    if (!novoAndamento.trim()) {
      toast.error("Digite um andamento");
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      const { error } = await supabase.from("andamentos").insert({
        atendimento_id: atendimentoId,
        descricao: novoAndamento,
        created_by: user.id,
      });

      if (error) throw error;

      toast.success("Andamento adicionado");
      setNovoAndamento("");
      loadAndamentos();
    } catch (error) {
      console.error("Erro ao adicionar andamento:", error);
      toast.error("Erro ao adicionar andamento");
    } finally {
      setLoading(false);
    }
  };

  const handleEnviarEmail = async () => {
    if (!emailDestinatario || !emailDialog.andamento) {
      toast.error("Preencha o e-mail do destinatário");
      return;
    }

    setEnviandoEmail(true);

    try {
      const { data: atendimento } = await supabase
        .from("atendimentos")
        .select("assunto")
        .eq("id", atendimentoId)
        .single();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      const response = await supabase.functions.invoke("enviar-email-atendimento", {
        body: {
          destinatario: emailDestinatario,
          assunto: `Andamento do atendimento: ${atendimento?.assunto || atendimentoAssunto}`,
          mensagem: emailDialog.andamento.descricao,
          atendimentoId,
          userId: user.id,
        },
      });

      if (response.error) throw response.error;

      toast.success("E-mail enviado com sucesso!");
      setEmailDialog({ open: false, andamento: null });
      setEmailDestinatario("");
    } catch (error) {
      console.error("Erro ao enviar e-mail:", error);
      toast.error("Erro ao enviar e-mail. Verifique as configurações.");
    } finally {
      setEnviandoEmail(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <DialogTitle className="text-xl">
                  {mode === "view" ? "Visualizar Andamentos" : "Gerenciar Andamentos"}
                </DialogTitle>
                <DialogDescription className="mt-1">{atendimentoAssunto}</DialogDescription>
              </div>
              <Badge variant="secondary" className="h-6 px-3">
                {andamentos.length} {andamentos.length === 1 ? "andamento" : "andamentos"}
              </Badge>
            </div>
          </DialogHeader>

          <div className="px-6 py-4 space-y-6">
            {mode === "edit" && (
              <div className="space-y-3 p-4 rounded-lg border bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Adicionar Novo Andamento
                </Label>
                <Textarea
                  value={novoAndamento}
                  onChange={(e) => setNovoAndamento(e.target.value)}
                  placeholder="Descreva o andamento... (Use #123 para mencionar outros atendimentos)"
                  rows={3}
                  className="resize-none bg-background/80"
                />
                <p className="text-xs text-muted-foreground">
                  💡 Dica: Use #123 para mencionar outros atendimentos. O link será criado automaticamente no histórico!
                </p>
                <Button onClick={handleAddAndamento} disabled={loading} className="w-full" size="lg">
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adicionando...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar Andamento
                    </>
                  )}
                </Button>
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Histórico de Andamentos
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <ScrollArea className="h-[450px]">
                {andamentos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="p-4 rounded-full bg-muted/50 mb-4">
                      <Clock className="h-10 w-10 text-muted-foreground/50" />
                    </div>
                    <h4 className="font-semibold text-lg mb-2">Nenhum andamento registrado</h4>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      {mode === "edit"
                        ? "Adicione o primeiro andamento para começar o histórico de acompanhamento."
                        : "Este atendimento ainda não possui andamentos registrados."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 pr-4 relative before:absolute before:left-[13px] before:top-8 before:bottom-8 before:w-0.5 before:bg-gradient-to-b before:from-primary/50 before:via-primary/20 before:to-transparent">
                    {andamentos.map((andamento, index) => (
                      <div
                        key={andamento.id}
                        className="relative pl-10 pb-4 animate-fade-in"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <div className="absolute left-0 top-2 w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20">
                          <div className="w-3 h-3 rounded-full bg-background" />
                        </div>

                        <div className="border rounded-xl p-4 bg-card hover:shadow-md transition-all duration-300 group">
                          <div className="flex items-start justify-between mb-3 gap-3">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="secondary" className="flex items-center gap-1.5">
                                  <User className="h-3 w-3" />
                                  {andamento.criador?.nome}
                                </Badge>
                                {index === 0 && (
                                  <Badge variant="default" className="animate-pulse">
                                    Mais recente
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Calendar className="h-3.5 w-3.5" />
                                {format(new Date(andamento.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", {
                                  locale: ptBR,
                                })}
                              </div>
                            </div>
                            {mode === "edit" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEmailDialog({ open: true, andamento })}
                                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Send className="h-3.5 w-3.5 mr-1.5" />
                                Comunicar
                              </Button>
                            )}
                          </div>
                          <Separator className="mb-3" />
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{andamento.descricao}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={emailDialog.open} onOpenChange={(open) => setEmailDialog({ open, andamento: null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <DialogTitle>Enviar Andamento por E-mail</DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                E-mail do Destinatário
              </Label>
              <Input
                id="email"
                type="email"
                value={emailDestinatario}
                onChange={(e) => setEmailDestinatario(e.target.value)}
                placeholder="exemplo@email.com"
                className="h-11"
              />
            </div>

            {emailDialog.andamento && (
              <div className="p-4 bg-gradient-to-br from-muted to-muted/50 rounded-lg border">
                <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
                  Andamento a ser enviado:
                </p>
                <p className="text-sm leading-relaxed">{emailDialog.andamento.descricao}</p>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setEmailDialog({ open: false, andamento: null })}>
                Cancelar
              </Button>
              <Button onClick={handleEnviarEmail} disabled={enviandoEmail}>
                {enviandoEmail ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Enviar E-mail
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
