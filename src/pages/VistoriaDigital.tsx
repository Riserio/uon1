import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Link as LinkIcon, Mail, MessageCircle, Copy, AlertTriangle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { openWhatsApp } from "@/utils/whatsapp";

export default function VistoriaDigital() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/sinistros";
  const [step, setStep] = useState(1);
  const [tipoVistoria, setTipoVistoria] = useState<"sinistro" | "reativacao">("sinistro");
  const [vistoriaId, setVistoriaId] = useState("");
  const [linkToken, setLinkToken] = useState("");
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [creating, setCreating] = useState(false);
  const [corretoras, setCorretoras] = useState<any[]>([]);
  const [selectedCorretora, setSelectedCorretora] = useState("");
  const [tipoSinistro, setTipoSinistro] = useState("");
  const [clienteCpf, setClienteCpf] = useState("");
  const [horarioInicio, setHorarioInicio] = useState("08:00");
  const [horarioFim, setHorarioFim] = useState("18:00");

  // NOVOS ESTADOS
  const [validadeAtivada, setValidadeAtivada] = useState(false); // por padrão desativado
  const [diasValidade, setDiasValidade] = useState(2);
  const [prazoConfig, setPrazoConfig] = useState<{ prazo_dias: number; prazo_horas: number } | null>(null);

  useEffect(() => {
    loadCorretoras();
  }, []);

  // Carregar configuração de prazo quando associação é selecionada
  useEffect(() => {
    const loadPrazoConfig = async () => {
      if (!selectedCorretora) {
        setPrazoConfig(null);
        return;
      }
      
      const { data } = await supabase
        .from('vistoria_prazo_config')
        .select('prazo_dias, prazo_horas')
        .eq('corretora_id', selectedCorretora)
        .eq('ativo', true)
        .maybeSingle();
      
      if (data) {
        setPrazoConfig(data);
      } else {
        setPrazoConfig(null);
      }
    };
    
    loadPrazoConfig();
  }, [selectedCorretora]);

  const loadCorretoras = async () => {
    const { data } = await supabase.from("corretoras").select("id, nome").order("nome");

    if (data) {
      setCorretoras(data);
    }
  };

  // Função para calcular prazo_validade baseado na configuração
  const calcularPrazoValidade = () => {
    if (validadeAtivada) {
      // Prazo manual ativado - usar dias de validade configurado manualmente
      const prazo = new Date();
      prazo.setDate(prazo.getDate() + diasValidade);
      return { prazoValidade: prazo.toISOString(), prazoManual: true };
    }
    
    if (prazoConfig) {
      // Usar prazo configurado para a associação
      const prazo = new Date();
      prazo.setDate(prazo.getDate() + prazoConfig.prazo_dias);
      prazo.setHours(prazo.getHours() + prazoConfig.prazo_horas);
      return { prazoValidade: prazo.toISOString(), prazoManual: false };
    }
    
    return { prazoValidade: null, prazoManual: false };
  };

  // Estado para confirmação de duplicata
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [existingVistoria, setExistingVistoria] = useState<any>(null);

  const checkDuplicate = async (): Promise<boolean> => {
    if (!clienteCpf || clienteCpf.trim() === "") return false;

    const cpfClean = clienteCpf.replace(/\D/g, "");
    
    const { data: existing } = await supabase
      .from("vistorias")
      .select("id, numero, cliente_nome, veiculo_placa, status, created_at")
      .eq("cliente_cpf", cpfClean)
      .not("status", "eq", "concluida")
      .order("created_at", { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      setExistingVistoria(existing[0]);
      return true;
    }
    return false;
  };

  const handleCreateClick = async () => {
    if (creating) return; // Evitar cliques múltiplos
    
    const hasDuplicate = await checkDuplicate();
    if (hasDuplicate) {
      setShowDuplicateDialog(true);
    } else {
      createVistoria();
    }
  };

  const createVistoria = async () => {
    if (creating) return; // Evitar cliques múltiplos
    setCreating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Calcular prazo de validade
      const { prazoValidade, prazoManual } = calcularPrazoValidade();

      const { data: vistoria, error: vistoriaError} = await supabase
        .from("vistorias")
        .insert({
          tipo_abertura: "digital",
          tipo_vistoria: tipoVistoria,
          tipo_sinistro: tipoSinistro || null,
          status: "aguardando_fotos",
          created_by: user.id,
          corretora_id: selectedCorretora && selectedCorretora.trim() !== "" ? selectedCorretora : null,
          cliente_cpf: clienteCpf || null,
          horario_inicio: horarioInicio,
          horario_fim: horarioFim,
          dias_validade: validadeAtivada ? diasValidade : null,
          prazo_validade: prazoValidade,
          prazo_manual: prazoManual,
        })
        .select()
        .single();

      if (vistoriaError) throw vistoriaError;

      const { data: fluxos, error: fluxosError } = await supabase
        .from("fluxos")
        .select("id")
        .eq("ativo", true)
        .order("ordem")
        .limit(1);

      if (fluxosError) throw fluxosError;

      if (fluxos && fluxos.length > 0) {
        const fluxoId = fluxos[0].id;

        const { data: statusList, error: statusError } = await supabase
          .from("status_config")
          .select("nome")
          .eq("fluxo_id", fluxoId)
          .eq("ativo", true)
          .order("ordem")
          .limit(1);

        if (statusError) throw statusError;

        if (statusList && statusList.length > 0) {
          // Criar atendimento com dados sincronizados - usando o mesmo numero da vistoria
          const { data: atendimento, error: atendimentoError } = await supabase.from("atendimentos").insert({
            user_id: user.id,
            corretora_id: selectedCorretora && selectedCorretora.trim() !== "" ? selectedCorretora : null,
            assunto: `Vistoria ${tipoVistoria === "sinistro" ? "Sinistro" : "Reativação"} #${vistoria.numero}`,
            prioridade: "Alta",
            status: statusList[0].nome,
            fluxo_id: fluxoId,
            tipo_atendimento: "sinistro",
            numero: vistoria.numero, // Sincronizar número
            observacoes: `Vistoria digital criada - Aguardando envio de fotos pelo cliente.\nLink Token: ${vistoria.link_token}`,
          }).select().single();

          if (atendimentoError) {
            console.error("Erro ao criar atendimento:", atendimentoError);
          } else if (atendimento) {
            // Vincular vistoria ao atendimento para sincronização bidirecional
            const { error: updateError } = await supabase
              .from("vistorias")
              .update({ atendimento_id: atendimento.id })
              .eq("id", vistoria.id);
            
            if (updateError) {
              console.error("Erro ao vincular vistoria ao atendimento:", updateError);
            }
          }
        }
      }

      setVistoriaId(vistoria.id);
      setLinkToken(vistoria.link_token);
      setStep(2);
      toast.success("Vistoria digital criada com sucesso!");
    } catch (error) {
      console.error("Erro ao criar vistoria:", error);
      toast.error("Erro ao criar vistoria digital");
    } finally {
      setCreating(false);
    }
  };

  const getVistoriaLink = () => `${window.location.origin}/vistoria/${linkToken}`;

  const copyLink = () => {
    navigator.clipboard.writeText(getVistoriaLink());
    toast.success("Link copiado para a área de transferência!");
  };

  const sendEmail = async () => {
    if (!email) return toast.error("Por favor, insira um email");
    try {
      toast.success("Email enviado com sucesso!");
      setShowLinkDialog(false);
    } catch (error) {
      console.error("Erro ao enviar email:", error);
      toast.error("Erro ao enviar email");
    }
  };

  const sendWhatsApp = () => {
    if (!telefone) return toast.error("Por favor, insira um telefone");
    openWhatsApp({
      phone: telefone,
      message: `Olá! Segue o link para realizar a vistoria digital do seu veículo:\n\n${getVistoriaLink()}\n\nPor favor, siga as instruções na tela para fotografar seu veículo.`
    });
    toast.success("Redirecionando para WhatsApp...");
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="mb-6">
        <Button variant="outline" onClick={() => navigate(returnTo)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-6 w-6" />
            Abertura Digital
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 1 && (
            <div className="space-y-6">
              {/* Tipo de Vistoria */}
              <div>
                <Label className="text-base mb-4 block">Tipo de Vistoria</Label>
                <RadioGroup
                  value={tipoVistoria}
                  onValueChange={(value) => setTipoVistoria(value as "sinistro" | "reativacao")}
                >
                  <div className="flex items-center space-x-2 p-4 rounded-lg border hover:border-primary transition-colors">
                    <RadioGroupItem value="sinistro" id="sinistro" />
                    <Label htmlFor="sinistro" className="flex-1 cursor-pointer">
                      <div className="font-semibold">Sinistro</div>
                      <div className="text-sm text-muted-foreground">
                        Para veículos que sofreram algum tipo de dano ou acidente
                      </div>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-4 rounded-lg border hover:border-primary transition-colors">
                    <RadioGroupItem value="reativacao" id="reativacao" />
                    <Label htmlFor="reativacao" className="flex-1 cursor-pointer">
                      <div className="font-semibold">Reativação</div>
                      <div className="text-sm text-muted-foreground">
                        Para reativar apólices ou avaliar estado geral do veículo
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Tipo de Sinistro */}
              {tipoVistoria === "sinistro" && (
                <div>
                  <Label>Tipo de Sinistro</Label>
                  <select
                    value={tipoSinistro}
                    onChange={(e) => setTipoSinistro(e.target.value)}
                    className="w-full border rounded-md p-2"
                  >
                    <option value="">Selecione o tipo</option>
                    <option value="Colisão">Colisão</option>
                    <option value="Roubo/Furto">Roubo/Furto</option>
                    <option value="Incêndio">Incêndio</option>
                    <option value="Enchente">Enchente/Alagamento</option>
                    <option value="Danos a Terceiros">Danos a Terceiros</option>
                    <option value="Quebra de Vidros">Quebra de Vidros</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
              )}

              {/* Associação e CPF */}
              <div className="space-y-4">
                <div>
                  <Label>Associação</Label>
                  <select
                    value={selectedCorretora}
                    onChange={(e) => setSelectedCorretora(e.target.value)}
                    className="w-full border rounded-md p-2"
                  >
                    <option value="">Selecione a associação</option>
                    {corretoras.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                  {prazoConfig && (
                    <p className="text-xs text-blue-600 mt-1">
                      ✓ Prazo automático: {prazoConfig.prazo_dias} dia{prazoConfig.prazo_dias !== 1 ? 's' : ''} 
                      {prazoConfig.prazo_horas > 0 && ` e ${prazoConfig.prazo_horas} hora${prazoConfig.prazo_horas !== 1 ? 's' : ''}`}
                    </p>
                  )}
                </div>

                <div>
                  <Label>CPF do Cliente (opcional)</Label>
                  <Input
                    value={clienteCpf}
                    onChange={(e) => setClienteCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    maxLength={14}
                  />
                </div>
              </div>

              {/* Configurações de Horário e Validade */}
              <div className="space-y-4 border rounded-lg p-4 bg-muted/50">
                <h3 className="font-semibold text-sm">Configurações de Validade do Link</h3>

                {/* Label acima do switch */}
                <div className="flex flex-col items-start mb-2">
                  <Label className="text-xs mb-1">Ativar vencimento do link?</Label>
                  <Switch
                    checked={validadeAtivada}
                    onCheckedChange={(checked) => setValidadeAtivada(checked as boolean)}
                  />
                </div>

                {/* Campos animados */}
                <div
                  className={`grid grid-cols-3 gap-4 transition-all duration-300 ease-in-out overflow-hidden ${
                    validadeAtivada ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  <div>
                    <Label className="text-xs">Horário Início</Label>
                    <Input
                      type="time"
                      value={horarioInicio}
                      onChange={(e) => setHorarioInicio(e.target.value)}
                      disabled={!validadeAtivada}
                    />
                    <p className="text-xs text-muted-foreground mt-1">A partir de que horas</p>
                  </div>

                  <div>
                    <Label className="text-xs">Horário Fim</Label>
                    <Input
                      type="time"
                      value={horarioFim}
                      onChange={(e) => setHorarioFim(e.target.value)}
                      disabled={!validadeAtivada}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Até que horas</p>
                  </div>

                  <div>
                    <Label className="text-xs">Dias de Validade</Label>
                    <Input
                      type="number"
                      min="1"
                      max="30"
                      value={diasValidade}
                      onChange={(e) => setDiasValidade(parseInt(e.target.value))}
                      disabled={!validadeAtivada}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Quantos dias ativo</p>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleCreateClick}
                disabled={creating}
                className="w-full bg-gradient-to-r from-primary to-primary/80"
                size="lg"
              >
                {creating ? "Criando..." : "Criar Vistoria Digital"}
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg p-4">
                <h3 className="font-semibold text-green-900 dark:text-green-100 mb-2">
                  ✓ Vistoria criada com sucesso!
                </h3>
                <p className="text-sm text-green-800 dark:text-green-200">
                  Um card foi criado automaticamente no kanban. Use o link abaixo para enviar ao cliente.
                </p>
              </div>

              <div>
                <Label className="mb-2 block">Link da Vistoria</Label>
                <div className="flex gap-2">
                  <Input value={getVistoriaLink()} readOnly className="font-mono text-sm" />
                  <Button onClick={copyLink} variant="outline">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Button
                  onClick={() => setShowLinkDialog(true)}
                  variant="outline"
                  size="lg"
                  className="h-24 flex-col gap-2"
                >
                  <Mail className="h-6 w-6" />
                  <span>Enviar por Email</span>
                </Button>

                <Button
                  onClick={() => setShowLinkDialog(true)}
                  variant="outline"
                  size="lg"
                  className="h-24 flex-col gap-2"
                >
                  <MessageCircle className="h-6 w-6" />
                  <span>Enviar por WhatsApp</span>
                </Button>
              </div>

              <Button onClick={() => navigate(returnTo)} className="w-full" variant="secondary">
                Concluir
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar Link de Vistoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Email do Cliente</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cliente@exemplo.com"
              />
              <Button onClick={sendEmail} className="w-full mt-2" variant="outline">
                <Mail className="h-4 w-4 mr-2" />
                Enviar por Email
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">ou</span>
              </div>
            </div>

            <div>
              <Label>Telefone do Cliente (com DDD)</Label>
              <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 99999-9999" />
              <Button onClick={sendWhatsApp} className="w-full mt-2 bg-green-600 hover:bg-green-700">
                <MessageCircle className="h-4 w-4 mr-2" />
                Enviar por WhatsApp
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação de duplicata */}
      <AlertDialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Vistoria já existente
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Já existe uma vistoria aberta para este CPF:</p>
              {existingVistoria && (
                <div className="bg-muted p-3 rounded-lg text-sm">
                  <p><strong>Número:</strong> #{existingVistoria.numero}</p>
                  <p><strong>Cliente:</strong> {existingVistoria.cliente_nome || "Não informado"}</p>
                  <p><strong>Placa:</strong> {existingVistoria.veiculo_placa || "Não informada"}</p>
                  <p><strong>Status:</strong> {existingVistoria.status}</p>
                  <p><strong>Criada em:</strong> {new Date(existingVistoria.created_at).toLocaleDateString("pt-BR")}</p>
                </div>
              )}
              <p className="text-yellow-600 font-medium">Deseja criar outra vistoria mesmo assim?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowDuplicateDialog(false); createVistoria(); }}>
              Criar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
