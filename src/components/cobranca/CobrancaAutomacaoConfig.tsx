import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Save, Loader2, Eye, EyeOff, RefreshCw, CheckCircle, XCircle, Clock, History, Square, Filter, Calendar, FileText, Info, Github } from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import CobrancaAutomacaoLogs from "./CobrancaAutomacaoLogs";

interface CobrancaAutomacaoConfigProps {
  corretoraId: string;
  corretoraNome?: string;
}

// Situações de boleto disponíveis no Hinova (seção "Situação Boleto")
const SITUACOES_BOLETO = [
  { value: "ABERTO", label: "Aberto" },
  { value: "ABERTO MIGRADO", label: "Aberto Migrado" },
  { value: "BAIXADO", label: "Baixado" },
  { value: "BAIXADO C/ PENDÊNCIA", label: "Baixado c/ Pendência" },
  { value: "BAIXADOS MIGRADOS", label: "Baixados Migrados" },
  { value: "CANCELADO", label: "Cancelado" },
];

// Situações padrão marcadas conforme screenshot (sem CANCELADO)
const SITUACOES_PADRAO = [
  "ABERTO",
  "ABERTO MIGRADO", 
  "BAIXADO",
  "BAIXADO C/ PENDÊNCIA",
  "BAIXADOS MIGRADOS"
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
  ultima_execucao?: string;
  ultimo_status?: string;
  ultimo_erro?: string;
  // Novos campos de filtros
  filtro_periodo_tipo: string;
  filtro_data_inicio?: string | null;
  filtro_data_fim?: string | null;
  filtro_situacoes: string[];
  filtro_boletos_anteriores: string;
  filtro_referencia: string;
}

interface CurrentExecution {
  id: string;
  github_run_id?: string | null;
}

// Valores padrão - conforme screenshot do portal Hinova
const DEFAULT_CONFIG: Omit<AutomacaoConfig, 'corretora_id'> = {
  hinova_url: '',
  hinova_user: '',
  hinova_pass: '',
  hinova_codigo_cliente: '',
  layout_relatorio: '',
  ativo: false,
  // Filtros padrão conforme screenshot
  filtro_periodo_tipo: 'mes_atual',
  filtro_data_inicio: null,
  filtro_data_fim: null,
  filtro_situacoes: SITUACOES_PADRAO, // Conforme screenshot (sem CANCELADO)
  filtro_boletos_anteriores: 'possui', // POSSUI conforme screenshot
  filtro_referencia: 'vencimento_original',
};

export default function CobrancaAutomacaoConfig({ corretoraId, corretoraNome }: CobrancaAutomacaoConfigProps) {
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
      .channel(`automacao-config-${config.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'cobranca_automacao_config',
          filter: `id=eq.${config.id}`,
        },
        (payload) => {
          const newData = payload.new as any;
          // Atualizar config localmente sem refetch completo
          setConfig(prev => ({
            ...prev,
            ultimo_status: newData.ultimo_status,
            ultima_execucao: newData.ultima_execucao,
            ultimo_erro: newData.ultimo_erro,
          }));
          
          // Atualizar estado de execução
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
        .from("cobranca_automacao_config")
        .select("*")
        .eq("corretora_id", corretoraId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // Parse JSONB field to array if it's a string
        const situacoes = typeof data.filtro_situacoes === 'string' 
          ? JSON.parse(data.filtro_situacoes) 
          : (data.filtro_situacoes || SITUACOES_PADRAO);
        
        setConfig({
          ...data,
          filtro_situacoes: situacoes,
          filtro_periodo_tipo: data.filtro_periodo_tipo || 'mes_atual',
          filtro_boletos_anteriores: data.filtro_boletos_anteriores || 'possui',
          filtro_referencia: data.filtro_referencia || 'vencimento_original',
        });
        
        // Verificar se está executando baseado na execução real, não apenas no config
        const { data: execAtual } = await supabase
          .from("cobranca_automacao_execucoes")
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
          // Marcar como erro no banco
          await supabase
            .from("cobranca_automacao_execucoes")
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
          // Corrigir config se estiver desincronizado
          const correctStatus = isOrphan ? 'erro' : (execAtual?.status || 'erro');
          if (data.ultimo_status === 'executando') {
            await supabase
              .from("cobranca_automacao_config")
              .update({ 
                ultimo_status: correctStatus,
                ultimo_erro: isOrphan ? 'Execução não finalizada - timeout' : data.ultimo_erro
              })
              .eq("id", data.id);
            // Atualizar estado local
            setConfig(prev => ({ 
              ...prev, 
              ultimo_status: correctStatus,
              ultimo_erro: isOrphan ? 'Execução não finalizada - timeout' : prev.ultimo_erro
            }));
          }
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

    if (config.filtro_situacoes.length === 0) {
      toast.error("Selecione pelo menos uma situação de boleto");
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
        // Filtros
        filtro_periodo_tipo: config.filtro_periodo_tipo,
        filtro_data_inicio: config.filtro_periodo_tipo === 'customizado' ? config.filtro_data_inicio : null,
        filtro_data_fim: config.filtro_periodo_tipo === 'customizado' ? config.filtro_data_fim : null,
        filtro_situacoes: config.filtro_situacoes,
        filtro_boletos_anteriores: config.filtro_boletos_anteriores,
        filtro_referencia: config.filtro_referencia,
      };

      if (config.id) {
        const { error } = await supabase
          .from("cobranca_automacao_config")
          .update(dataToSave)
          .eq("id", config.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("cobranca_automacao_config")
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
      // Chamar a nova edge function que dispara o GitHub Actions
      const { data, error } = await supabase.functions.invoke('disparar-github-workflow', {
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
      // Se temos um github_run_id, tentar cancelar no GitHub primeiro
      if (currentExecution?.github_run_id) {
        const { data: cancelData, error: cancelError } = await supabase.functions.invoke('disparar-github-workflow', {
          body: { action: 'cancel', run_id: currentExecution.github_run_id }
        });
        
        if (cancelError) {
          console.warn("Erro ao cancelar no GitHub:", cancelError);
        } else if (cancelData?.success) {
          console.log("Solicitação de cancelamento enviada ao GitHub");
        }
      }

      // Atualizar status para "parado" no banco
      const { error: updateError } = await supabase
        .from("cobranca_automacao_config")
        .update({
          ultimo_status: 'parado',
          ultimo_erro: 'Execução interrompida pelo usuário',
        })
        .eq("id", config.id);

      if (updateError) throw updateError;

      // Buscar a execução em andamento e atualizar
      const { data: execucaoAtual } = await supabase
        .from("cobranca_automacao_execucoes")
        .select("id")
        .eq("config_id", config.id)
        .eq("status", "executando")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (execucaoAtual) {
        // Atualizar o registro de execução
        await supabase
          .from("cobranca_automacao_execucoes")
          .update({
            status: 'parado',
            erro: 'Execução interrompida pelo usuário',
            finalizado_at: new Date().toISOString(),
          })
          .eq("id", execucaoAtual.id);
      }

      // Registrar log de auditoria
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("bi_audit_logs").insert({
        modulo: "cobranca",
        acao: "execucao_parada",
        descricao: `Execução da automação Hinova interrompida por ${user?.email || 'usuário'}`,
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


  // Calcular período exibido
  const getPeriodoExibicao = () => {
    if (config.filtro_periodo_tipo === 'mes_atual') {
      const hoje = new Date();
      const inicio = startOfMonth(hoje);
      const fim = endOfMonth(hoje);
      return `${format(inicio, 'dd/MM/yyyy')} - ${format(fim, 'dd/MM/yyyy')}`;
    } else if (config.filtro_data_inicio && config.filtro_data_fim) {
      return `${format(new Date(config.filtro_data_inicio), 'dd/MM/yyyy')} - ${format(new Date(config.filtro_data_fim), 'dd/MM/yyyy')}`;
    }
    return 'Não definido';
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
                Automação Hinova
                <Github className="h-4 w-4 text-muted-foreground" />
              </CardTitle>
              <CardDescription className="mt-1">
                {corretoraNome} • Execução via GitHub Actions
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="ativo-switch" className="text-sm">Execução Diária</Label>
                <Switch
                  id="ativo-switch"
                  checked={config.ativo}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, ativo: checked }))}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {config.ativo ? "Ativa às 09:00 (Brasília)" : "Desativada"}
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
              <div className="flex items-center gap-3">
                {config.ultimo_status === 'sucesso' ? (
                  <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                ) : config.ultimo_status === 'erro' ? (
                  <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                ) : config.ultimo_status === 'executando' ? (
                  <Loader2 className="h-4 w-4 text-yellow-600 animate-spin shrink-0" />
                ) : config.ultimo_status === 'parado' ? (
                  <Square className="h-4 w-4 text-orange-600 shrink-0" />
                ) : (
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">Última execução:</span>{" "}
                    {format(new Date(config.ultima_execucao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    {config.ultimo_status === 'executando' && (
                      <span className="ml-2 text-yellow-600">(em andamento)</span>
                    )}
                    {config.ultimo_status === 'parado' && (
                      <span className="ml-2 text-orange-600">(interrompida)</span>
                    )}
                  </p>
                  {config.ultimo_erro && (
                    <p className="text-xs text-red-600 mt-1 truncate">{config.ultimo_erro}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Botões de ação em linha */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={loadConfig} disabled={saving || stopping}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Recarregar
            </Button>
            
            {isExecuting ? (
              <Button 
                variant="destructive" 
                size="sm"
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
                variant="default" 
                size="sm"
                onClick={handleExecute} 
                disabled={saving || !config.id}
                className="bg-green-600 hover:bg-green-700"
              >
                <Github className="h-4 w-4 mr-2" />
                Executar Agora
              </Button>
            )}
            
            <Button size="sm" onClick={handleSave} disabled={saving || isExecuting}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs: Configuração e Histórico */}
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

        <TabsContent value="config" className="mt-4 space-y-4">
          {/* Card de Acesso */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Credenciais de Acesso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="hinova-url">URL do Portal Hinova</Label>
                  <Input
                    id="hinova-url"
                    value={config.hinova_url}
                    onChange={(e) => setConfig(prev => ({ ...prev, hinova_url: e.target.value }))}
                    placeholder="https://eris.hinova.com.br/..."
                  />
                  <p className="text-xs text-muted-foreground">
                    URL completa da página de login do portal
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hinova-codigo">Código do Cliente</Label>
                  <Input
                    id="hinova-codigo"
                    value={config.hinova_codigo_cliente}
                    onChange={(e) => setConfig(prev => ({ ...prev, hinova_codigo_cliente: e.target.value }))}
                    placeholder="Ex: 2363"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hinova-user">Usuário</Label>
                  <Input
                    id="hinova-user"
                    value={config.hinova_user}
                    onChange={(e) => setConfig(prev => ({ ...prev, hinova_user: e.target.value }))}
                    placeholder="usuario@email.com"
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
                      placeholder="••••••••"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="layout-relatorio">Layout do Relatório</Label>
                  <Input
                    id="layout-relatorio"
                    value={config.layout_relatorio}
                    onChange={(e) => setConfig(prev => ({ ...prev, layout_relatorio: e.target.value }))}
                    placeholder="Ex: BI - Vangard Cobrança"
                  />
                  <p className="text-xs text-muted-foreground">
                    Nome exato do layout a ser selecionado
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card de Filtros Ativos (somente leitura) */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                Filtros Aplicados na Extração
              </CardTitle>
              <CardDescription>
                Filtros fixos configurados para a extração do relatório Hinova
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {/* Período */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 p-2 rounded-md bg-background/50">
                  <div className="flex items-center gap-2 min-w-[140px]">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Período:</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{getPeriodoExibicao()}</span>
                </div>

                {/* Situações */}
                <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 p-2 rounded-md bg-background/50">
                  <div className="flex items-center gap-2 min-w-[140px]">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Situações:</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {config.filtro_situacoes.map((sit) => (
                      <span key={sit} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                        {sit}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Boletos Anteriores */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 p-2 rounded-md bg-background/50">
                  <div className="flex items-center gap-2 min-w-[140px]">
                    <Info className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Boletos Anteriores:</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {config.filtro_boletos_anteriores === 'nao_possui' ? 'Não possui' 
                     : config.filtro_boletos_anteriores === 'possui' ? 'Possui' : 'Todos'}
                  </span>
                </div>

                {/* Referência */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 p-2 rounded-md bg-background/50">
                  <div className="flex items-center gap-2 min-w-[140px]">
                    <Clock className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Referência:</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {config.filtro_referencia === 'vencimento_original' ? 'Vencimento Original' : 'Data Pagamento'}
                  </span>
                </div>

                {/* Filtros Fixos */}
                <div className="mt-3 pt-3 border-t border-border/50">
                  <p className="text-xs text-muted-foreground mb-2">Filtros fixos (aplicados automaticamente):</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">Cooperativa: TODOS</span>
                    <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">Regional: TODOS</span>
                    <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">Situação Veículo: TODOS</span>
                    <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">Vencimento Veículo: TODOS</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          {config.id ? (
            <CobrancaAutomacaoLogs 
              configId={config.id} 
              corretoraId={corretoraId} 
            />
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
