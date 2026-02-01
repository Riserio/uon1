import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Save, Loader2, Eye, EyeOff, RefreshCw, CheckCircle, XCircle, Clock, History, Square, Info, Github } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import MGFAutomacaoLogs from "./MGFAutomacaoLogs";

interface MGFAutomacaoConfigProps {
  corretoraId: string;
  corretoraNome?: string;
  onSuccess?: () => void;
}

// Centros de custo com EVENTOS que serão selecionados
const CENTROS_CUSTO_EVENTOS = [
  "EVENTOS",
  "EVENTOS NAO PROVISIONADO", 
  "EVENTOS RATEAVEIS"
];

interface AutomacaoConfig {
  id?: string;
  corretora_id: string;
  hinova_url: string;
  hinova_user: string;
  hinova_pass: string;
  hinova_codigo_cliente: string;
  layout_relatorio: string;
  ativo: boolean;
  hora_agendada: string;
  ultima_execucao?: string;
  ultimo_status?: string;
  ultimo_erro?: string;
  filtro_centros_custo: string[];
}

interface CurrentExecution {
  id: string;
  github_run_id?: string | null;
}

const DEFAULT_CONFIG: Omit<AutomacaoConfig, 'corretora_id'> = {
  hinova_url: '',
  hinova_user: '',
  hinova_pass: '',
  hinova_codigo_cliente: '',
  layout_relatorio: 'BI VANGARD FINANCEIROS EVENTOS',
  ativo: false,
  hora_agendada: '09:00',
  filtro_centros_custo: CENTROS_CUSTO_EVENTOS,
};

export default function MGFAutomacaoConfig({ corretoraId, corretoraNome }: MGFAutomacaoConfigProps) {
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

  // Subscrição realtime
  useEffect(() => {
    if (!config.id) return;

    const channel = supabase
      .channel(`mgf-automacao-config-${config.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mgf_automacao_config',
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
        .from("mgf_automacao_config")
        .select("*")
        .eq("corretora_id", corretoraId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const centros = typeof data.filtro_centros_custo === 'string' 
          ? JSON.parse(data.filtro_centros_custo) 
          : (data.filtro_centros_custo || CENTROS_CUSTO_EVENTOS);
        
        setConfig({
          ...data,
          filtro_centros_custo: centros,
          hora_agendada: data.hora_agendada ? String(data.hora_agendada).slice(0, 5) : '09:00',
        });
        
        // Verificar execução em andamento
        const { data: execAtual } = await supabase
          .from("mgf_automacao_execucoes")
          .select("id, github_run_id, status, created_at, finalizado_at")
          .eq("config_id", data.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        const isOrphan = execAtual && 
          execAtual.status === 'executando' && 
          !execAtual.finalizado_at &&
          (new Date().getTime() - new Date(execAtual.created_at).getTime()) > 70 * 60 * 1000;
        
        if (isOrphan && execAtual) {
          await supabase
            .from("mgf_automacao_execucoes")
            .update({
              status: 'erro',
              erro: 'Execução não finalizada - timeout',
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
        layout_relatorio: config.layout_relatorio,
        ativo: config.ativo,
        hora_agendada: config.hora_agendada || '09:00',
        filtro_centros_custo: config.filtro_centros_custo,
      };

      if (config.id) {
        const { error } = await supabase
          .from("mgf_automacao_config")
          .update(dataToSave)
          .eq("id", config.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("mgf_automacao_config")
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
      const { data, error } = await supabase.functions.invoke('disparar-mgf-workflow', {
        body: { action: 'dispatch', corretora_id: corretoraId }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Workflow MGF GitHub disparado! Acompanhe o status no histórico.");
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
        await supabase.functions.invoke('disparar-mgf-workflow', {
          body: { action: 'cancel', run_id: currentExecution.github_run_id }
        });
      }

      await supabase
        .from("mgf_automacao_config")
        .update({
          ultimo_status: 'parado',
          ultimo_erro: 'Execução interrompida pelo usuário',
        })
        .eq("id", config.id);

      const { data: execucaoAtual } = await supabase
        .from("mgf_automacao_execucoes")
        .select("id")
        .eq("config_id", config.id)
        .eq("status", "executando")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (execucaoAtual) {
        await supabase
          .from("mgf_automacao_execucoes")
          .update({
            status: 'parado',
            erro: 'Execução interrompida pelo usuário',
            finalizado_at: new Date().toISOString(),
          })
          .eq("id", execucaoAtual.id);
      }

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
                <Settings className="h-5 w-5 text-orange-500" />
                Automação MGF Hinova
                <Github className="h-4 w-4 text-muted-foreground" />
              </CardTitle>
              <CardDescription className="mt-1">
                {corretoraNome} • Relatório 5.1 de Lançamentos
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
                : 'bg-muted border-border'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {config.ultimo_status === 'sucesso' && <CheckCircle className="h-4 w-4 text-green-500" />}
                  {config.ultimo_status === 'erro' && <XCircle className="h-4 w-4 text-red-500" />}
                  {config.ultimo_status === 'executando' && <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />}
                  {config.ultimo_status === 'parado' && <Square className="h-4 w-4 text-orange-500" />}
                  <span className="text-sm font-medium capitalize">{config.ultimo_status}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {new Date(config.ultima_execucao).toLocaleString('pt-BR')}
                </div>
              </div>
              {config.ultimo_erro && config.ultimo_status === 'erro' && (
                <p className="text-xs text-red-600 mt-2 line-clamp-2">{config.ultimo_erro}</p>
              )}
            </div>
          )}

          {/* Botões de ação */}
          <div className="flex gap-2">
            {isExecuting ? (
              <Button
                variant="destructive"
                onClick={handleStop}
                disabled={stopping}
                className="flex-1"
              >
                {stopping ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Square className="h-4 w-4 mr-2" />
                )}
                Parar Execução
              </Button>
            ) : (
              <Button
                onClick={handleExecute}
                disabled={!config.id || !config.hinova_user || !config.hinova_pass}
                className="flex-1 bg-orange-600 hover:bg-orange-700"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Executar Agora
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs de Configuração e Histórico */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="config" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configuração
          </TabsTrigger>
          <TabsTrigger value="historico" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              {/* Credenciais Hinova */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Credenciais Hinova
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hinova-url">URL do Portal</Label>
                    <Input
                      id="hinova-url"
                      value={config.hinova_url}
                      onChange={(e) => setConfig(prev => ({ ...prev, hinova_url: e.target.value }))}
                      placeholder="https://eris.hinova.com.br/sga/..."
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="codigo-cliente">Código do Cliente</Label>
                    <Input
                      id="codigo-cliente"
                      value={config.hinova_codigo_cliente}
                      onChange={(e) => setConfig(prev => ({ ...prev, hinova_codigo_cliente: e.target.value }))}
                      placeholder="Ex: 2363"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hinova-user">Usuário</Label>
                    <Input
                      id="hinova-user"
                      value={config.hinova_user}
                      onChange={(e) => setConfig(prev => ({ ...prev, hinova_user: e.target.value }))}
                      placeholder="Usuário Hinova"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="hinova-pass">Senha</Label>
                    <div className="relative">
                      <Input
                        id="hinova-pass"
                        type={showPassword ? "text" : "password"}
                        value={config.hinova_pass}
                        onChange={(e) => setConfig(prev => ({ ...prev, hinova_pass: e.target.value }))}
                        placeholder="Senha Hinova"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Info do Robô */}
              <div className="p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-orange-700 space-y-1">
                    <p className="font-medium">O robô irá automaticamente:</p>
                    <ul className="list-disc list-inside text-xs space-y-0.5">
                      <li>Acessar MGF → Relatórios → 5.1 de Lançamentos</li>
                      <li>Marcar Centro de Custo: <strong>EVENTOS, EVENTOS NAO PROVISIONADO, EVENTOS RATEAVEIS</strong></li>
                      <li>Selecionar Layout: <strong>BI VANGARD FINANCEIROS EVENTOS</strong></li>
                      <li>Selecionar tipo: <strong>Em Excel</strong></li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Centros de Custo (readonly) */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Centros de Custo Selecionados</Label>
                <div className="flex flex-wrap gap-2">
                  {config.filtro_centros_custo.map((centro, index) => (
                    <Badge key={index} variant="secondary" className="bg-orange-100 text-orange-800">
                      {centro}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Botão Salvar */}
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar Configuração
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          {config.id ? (
            <MGFAutomacaoLogs configId={config.id} corretoraId={corretoraId} />
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                Salve a configuração para ver o histórico de execuções.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
