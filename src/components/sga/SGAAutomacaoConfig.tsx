import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Save, Loader2, Eye, EyeOff, RefreshCw, CheckCircle, XCircle, History, Square, Info, Github } from "lucide-react";
import { toast } from "sonner";
import { format, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import SGAAutomacaoLogs from "./SGAAutomacaoLogs";

interface SGAAutomacaoConfigProps {
  corretoraId: string;
  corretoraNome?: string;
}

interface AutomacaoConfig {
  id?: string;
  corretora_id: string;
  hinova_url: string;
  hinova_user: string;
  hinova_pass: string;
  hinova_codigo_cliente: string;
  ativo: boolean;
  hora_agendada: string;
  ultima_execucao?: string;
  ultimo_status?: string;
  ultimo_erro?: string;
}

interface CurrentExecution {
  id: string;
  github_run_id?: string | null;
}

// Valores padrão
const DEFAULT_CONFIG: Omit<AutomacaoConfig, 'corretora_id'> = {
  hinova_url: '',
  hinova_user: '',
  hinova_pass: '',
  hinova_codigo_cliente: '',
  ativo: false,
  hora_agendada: '09:00',
};

export default function SGAAutomacaoConfig({ corretoraId, corretoraNome }: SGAAutomacaoConfigProps) {
  const [config, setConfig] = useState<AutomacaoConfig>({
    ...DEFAULT_CONFIG,
    corretora_id: corretoraId,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState("config");
  const [currentExecution, setCurrentExecution] = useState<CurrentExecution | null>(null);

  useEffect(() => {
    if (corretoraId) {
      loadConfig();
    }
  }, [corretoraId]);

  // Subscrição realtime para atualizações de status
  useEffect(() => {
    if (!config.id) return;

    const channel = supabase
      .channel(`sga-automacao-config-${config.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sga_automacao_config',
          filter: `id=eq.${config.id}`,
        },
        (payload) => {
          const newData = payload.new as any;
          setConfig(prev => ({
            ...prev,
            ultimo_status: newData.ultimo_status,
            ultima_execucao: newData.ultima_execucao,
            ultimo_erro: newData.ultimo_erro,
          }));
          
          if (newData.ultimo_status !== 'executando') {
            setExecuting(false);
            setCurrentExecution(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [config.id]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sga_automacao_config")
        .select("*")
        .eq("corretora_id", corretoraId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setConfig({
          ...data,
          hora_agendada: data.hora_agendada ? String(data.hora_agendada).slice(0, 5) : '09:00',
        });
        
        // Verificar se está executando
        const { data: execAtual } = await supabase
          .from("sga_automacao_execucoes")
          .select("id, github_run_id, status, created_at, finalizado_at")
          .eq("config_id", data.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        // Verificar se a execução é órfã (mais de 70 minutos sem finalizar)
        const isOrphan = execAtual && 
          execAtual.status === 'executando' && 
          !execAtual.finalizado_at &&
          (new Date().getTime() - new Date(execAtual.created_at).getTime()) > 70 * 60 * 1000;
        
        if (isOrphan && execAtual) {
          await supabase
            .from("sga_automacao_execucoes")
            .update({
              status: 'erro',
              erro: 'Execução não finalizada - timeout ou falha de comunicação',
              finalizado_at: new Date().toISOString(),
            })
            .eq("id", execAtual.id);
        }
        
        if (execAtual && execAtual.status === 'executando' && !isOrphan) {
          setExecuting(true);
          setCurrentExecution({ id: execAtual.id, github_run_id: execAtual.github_run_id });
        } else {
          setExecuting(false);
          setCurrentExecution(null);
        }
      } else {
        setConfig({
          ...DEFAULT_CONFIG,
          corretora_id: corretoraId,
        });
        setExecuting(false);
        setCurrentExecution(null);
      }
    } catch (error) {
      console.error("Erro ao carregar configuração:", error);
      toast.error("Erro ao carregar configuração de automação");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config.hinova_user || !config.hinova_pass) {
      toast.error("Usuário e senha são obrigatórios");
      return;
    }

    setSaving(true);
    try {
      const dataToSave = {
        corretora_id: corretoraId,
        hinova_url: config.hinova_url,
        hinova_user: config.hinova_user,
        hinova_pass: config.hinova_pass,
        hinova_codigo_cliente: config.hinova_codigo_cliente,
        ativo: config.ativo,
        hora_agendada: config.hora_agendada || '09:00',
      };

      if (config.id) {
        const { error } = await supabase
          .from("sga_automacao_config")
          .update(dataToSave)
          .eq("id", config.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("sga_automacao_config")
          .insert(dataToSave)
          .select()
          .single();

        if (error) throw error;
        setConfig(prev => ({ ...prev, id: data.id }));
      }

      toast.success("Configuração salva com sucesso!");
    } catch (error: any) {
      console.error("Erro ao salvar configuração:", error);
      toast.error("Erro ao salvar: " + (error.message || "Erro desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  const handleExecute = async () => {
    if (!config.id) {
      toast.error("Salve a configuração antes de executar");
      return;
    }

    if (!config.hinova_user || !config.hinova_pass) {
      toast.error("Configure usuário e senha antes de executar");
      return;
    }

    setExecuting(true);
    try {
      const { data, error } = await supabase.functions.invoke('disparar-sga-workflow', {
        body: { action: 'dispatch', corretora_id: corretoraId }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Workflow GitHub disparado! Acompanhe o status no histórico.");
        setActiveTab("historico");
        if (data.execucao_id && data.github_run_id) {
          setCurrentExecution({ id: data.execucao_id, github_run_id: data.github_run_id });
        }
        loadConfig();
      } else {
        toast.error(data?.message || "Erro ao disparar workflow");
        setExecuting(false);
      }
    } catch (error: any) {
      console.error("Erro ao executar automação:", error);
      toast.error("Erro ao executar: " + (error.message || "Erro desconhecido"));
      setExecuting(false);
    }
  };

  const handleStop = async () => {
    if (!config.id) return;

    setStopping(true);
    try {
      if (currentExecution?.github_run_id) {
        const { data: cancelData, error: cancelError } = await supabase.functions.invoke('disparar-sga-workflow', {
          body: { action: 'cancel', run_id: currentExecution.github_run_id }
        });
        
        if (cancelError) {
          console.warn("Erro ao cancelar no GitHub:", cancelError);
        } else if (cancelData?.success) {
          console.log("Solicitação de cancelamento enviada ao GitHub");
        }
      }

      const { error: updateError } = await supabase
        .from("sga_automacao_config")
        .update({
          ultimo_status: 'parado',
          ultimo_erro: 'Execução interrompida pelo usuário',
        })
        .eq("id", config.id);

      if (updateError) throw updateError;

      const { data: execucaoAtual } = await supabase
        .from("sga_automacao_execucoes")
        .select("id")
        .eq("config_id", config.id)
        .eq("status", "executando")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (execucaoAtual) {
        await supabase
          .from("sga_automacao_execucoes")
          .update({
            status: 'parado',
            erro: 'Execução interrompida pelo usuário',
            finalizado_at: new Date().toISOString(),
          })
          .eq("id", execucaoAtual.id);
      }

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("bi_audit_logs").insert({
        modulo: "sga_insights",
        acao: "execucao_parada",
        descricao: `Execução da automação SGA Hinova interrompida por ${user?.email || 'usuário'}`,
        corretora_id: corretoraId,
        user_id: user?.id || '',
        user_nome: user?.email || "Usuário",
        dados_novos: {
          config_id: config.id,
          github_run_id: currentExecution?.github_run_id,
          motivo: 'Interrupção manual pelo usuário',
        },
      });

      toast.success("Execução interrompida com sucesso");
      setExecuting(false);
      setCurrentExecution(null);
      loadConfig();
    } catch (error: any) {
      console.error("Erro ao parar automação:", error);
      toast.error("Erro ao parar: " + (error.message || "Erro desconhecido"));
    } finally {
      setStopping(false);
    }
  };

  // Calcular período exibido (fixo: 01/01/2000 até último dia do mês atual)
  const getPeriodoExibicao = () => {
    const hoje = new Date();
    const fim = endOfMonth(hoje);
    return `01/01/2000 - ${format(fim, 'dd/MM/yyyy')}`;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const isExecuting = executing || config.ultimo_status === 'executando';

  return (
    <div className="space-y-4">
      {/* Header com status e ações */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                Automação Eventos Hinova
                <Github className="h-4 w-4 text-muted-foreground" />
              </CardTitle>
              <CardDescription className="mt-1">
                {corretoraNome} • Execução via GitHub Actions
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="ativo-switch" className="text-sm">Execução Diária</Label>
                <Switch
                  id="ativo-switch"
                  checked={config.ativo}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, ativo: checked }))}
                />
              </div>
              {config.ativo && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="hora-input" className="text-xs text-muted-foreground">Horário (Brasília)</Label>
                  <Input
                    id="hora-input"
                    type="time"
                    value={config.hora_agendada}
                    onChange={(e) => setConfig(prev => ({ ...prev, hora_agendada: e.target.value }))}
                    className="w-24 h-7 text-xs"
                  />
                </div>
              )}
              <span className="text-xs text-muted-foreground">
                {config.ativo ? `Ativa às ${config.hora_agendada || '09:00'} (Brasília)` : "Desativada"}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Status da última execução */}
          {config.ultima_execucao && (
            <div className={`p-3 rounded-lg border mb-4 ${
              config.ultimo_status === 'sucesso' 
                ? 'bg-green-500/10 border-green-500/30' 
                : config.ultimo_status === 'erro'
                ? 'bg-red-500/10 border-red-500/30'
                : config.ultimo_status === 'executando'
                ? 'bg-yellow-500/10 border-yellow-500/30'
                : config.ultimo_status === 'parado'
                ? 'bg-orange-500/10 border-orange-500/30'
                : 'bg-muted border-border'
            }`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  {config.ultimo_status === 'sucesso' && <CheckCircle className="h-4 w-4 text-green-600" />}
                  {config.ultimo_status === 'erro' && <XCircle className="h-4 w-4 text-red-600" />}
                  {config.ultimo_status === 'executando' && <Loader2 className="h-4 w-4 text-yellow-600 animate-spin" />}
                  {config.ultimo_status === 'parado' && <Square className="h-4 w-4 text-orange-600" />}
                  <span className="text-sm">
                    <strong>Última execução:</strong> {format(new Date(config.ultima_execucao), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </span>
                </div>
                <Badge variant={
                  config.ultimo_status === 'sucesso' ? 'default' : 
                  config.ultimo_status === 'erro' ? 'destructive' : 
                  'secondary'
                }>
                  {config.ultimo_status === 'sucesso' ? 'Sucesso' : 
                   config.ultimo_status === 'erro' ? 'Erro' :
                   config.ultimo_status === 'executando' ? 'Em execução' :
                   config.ultimo_status === 'parado' ? 'Parado' : 
                   config.ultimo_status}
                </Badge>
              </div>
              {config.ultimo_erro && config.ultimo_status === 'erro' && (
                <p className="text-xs text-red-600 mt-2">{config.ultimo_erro}</p>
              )}
            </div>
          )}

          {/* Botões de ação */}
          <div className="flex gap-2 flex-wrap">
            {isExecuting ? (
              <Button 
                variant="destructive" 
                onClick={handleStop}
                disabled={stopping}
              >
                {stopping ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Parando...
                  </>
                ) : (
                  <>
                    <Square className="h-4 w-4 mr-2" />
                    Parar Execução
                  </>
                )}
              </Button>
            ) : (
              <Button 
                onClick={handleExecute}
                disabled={!config.id || executing}
              >
                {executing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Iniciando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Executar Agora
                  </>
                )}
              </Button>
            )}
            <Button variant="outline" onClick={loadConfig}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="config" className="gap-2">
            <Settings className="h-4 w-4" />
            Configuração
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-2">
            <History className="h-4 w-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Credenciais Hinova</CardTitle>
              <CardDescription>
                Configure as credenciais de acesso ao portal Hinova
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="hinova_url">URL do Portal</Label>
                  <Input
                    id="hinova_url"
                    placeholder="https://eris.hinova.com.br/sga/..."
                    value={config.hinova_url}
                    onChange={(e) => setConfig(prev => ({ ...prev, hinova_url: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hinova_codigo_cliente">Código do Cliente (opcional)</Label>
                  <Input
                    id="hinova_codigo_cliente"
                    placeholder="Ex: 12345"
                    value={config.hinova_codigo_cliente}
                    onChange={(e) => setConfig(prev => ({ ...prev, hinova_codigo_cliente: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="hinova_user">Usuário</Label>
                  <Input
                    id="hinova_user"
                    placeholder="Seu usuário Hinova"
                    value={config.hinova_user}
                    onChange={(e) => setConfig(prev => ({ ...prev, hinova_user: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hinova_pass">Senha</Label>
                  <div className="relative">
                    <Input
                      id="hinova_pass"
                      type={showPassword ? "text" : "password"}
                      placeholder="Sua senha Hinova"
                      value={config.hinova_pass}
                      onChange={(e) => setConfig(prev => ({ ...prev, hinova_pass: e.target.value }))}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Info sobre período automático */}
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-sm text-blue-800 dark:text-blue-300">
                      Período do Relatório (Automático)
                    </h4>
                    <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                      O robô extrai automaticamente todos os eventos desde <strong>01/01/2000</strong> até o <strong>último dia do mês atual</strong> ({getPeriodoExibicao()}).
                      Isso garante que todo o histórico seja importado a cada execução.
                    </p>
                  </div>
                </div>
              </div>

              {/* Info sobre campos selecionados */}
              <div className="p-3 bg-muted/50 rounded-lg border">
                <h4 className="font-medium text-sm mb-2">
                  Campos Selecionados Automaticamente
                </h4>
                <p className="text-xs text-muted-foreground">
                  O robô seleciona automaticamente todos os campos do relatório 12.9.1: Evento Estado, Data Cadastro Item, 
                  Data Evento, Motivo Evento, Tipo Evento, Situação Evento, Modelo Veículo, Placa, Valor Reparo, 
                  Custo Evento, Cooperativa, Regional, Voluntário, e mais 25 campos adicionais.
                </p>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Salvar Configuração
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          {config.id ? (
            <SGAAutomacaoLogs configId={config.id} corretoraId={corretoraId} />
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Salve a configuração para ver o histórico de execuções</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
