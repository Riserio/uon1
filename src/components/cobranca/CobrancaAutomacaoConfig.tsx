import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Settings, 
  Loader2, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Square, 
  Calendar, 
  FileText, 
  Github, 
  History,
  Zap,
  Shield,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
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
  // Campos de filtros
  filtro_periodo_tipo: string;
  filtro_data_inicio?: string | null;
  filtro_data_fim?: string | null;
  filtro_situacoes: string[];
  filtro_boletos_anteriores: string;
  filtro_referencia: string;
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
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (corretoraId) {
      loadConfig();
    }
  }, [corretoraId]);

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
        // Verificar se está executando
        if (data.ultimo_status === 'executando') {
          setExecuting(true);
        }
      } else {
        setConfig({
          ...DEFAULT_CONFIG,
          corretora_id: corretoraId,
        });
      }
      setHasChanges(false);
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

      setHasChanges(false);
      toast.success("Configuração salva com sucesso!");
    } catch (error: any) {
      console.error("Erro ao salvar configuração:", error);
      toast.error("Erro ao salvar: " + (error.message || "Erro desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  // Disparo via GitHub Actions
  const handleExecuteGitHub = async () => {
    // Salvar automaticamente antes de executar
    if (hasChanges || !config.id) {
      if (!config.hinova_user || !config.hinova_pass) {
        toast.error("Configure usuário e senha antes de executar");
        return;
      }
      await handleSave();
    }

    if (!config.id && !hasChanges) {
      toast.error("Configure a automação antes de executar");
      return;
    }

    setExecuting(true);
    try {
      const { data, error } = await supabase.functions.invoke('disparar-github-workflow', {
        body: { corretora_id: corretoraId, action: 'start' }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Execução iniciada! Acompanhe o progresso abaixo.");
        loadConfig();
      } else {
        toast.error(data?.message || "Erro ao disparar workflow");
        setExecuting(false);
      }
    } catch (error: any) {
      console.error("Erro ao disparar GitHub Actions:", error);
      toast.error("Erro ao disparar: " + (error.message || "Erro desconhecido"));
      setExecuting(false);
    }
  };

  const handleStop = async () => {
    if (!config.id) return;

    setStopping(true);
    try {
      // Tentar cancelar via GitHub primeiro
      const { data: githubData, error: githubError } = await supabase.functions.invoke('disparar-github-workflow', {
        body: { corretora_id: corretoraId, action: 'cancel' }
      });

      if (githubError) {
        console.warn("Erro ao cancelar via GitHub:", githubError);
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
          motivo: 'Interrupção manual pelo usuário',
        },
      });

      toast.success("Execução interrompida com sucesso");
      setExecuting(false);
      loadConfig();
    } catch (error: any) {
      console.error("Erro ao parar automação:", error);
      toast.error("Erro ao parar: " + (error.message || "Erro desconhecido"));
    } finally {
      setStopping(false);
    }
  };

  const toggleSituacao = (situacao: string) => {
    setConfig(prev => {
      const situacoes = prev.filtro_situacoes.includes(situacao)
        ? prev.filtro_situacoes.filter(s => s !== situacao)
        : [...prev.filtro_situacoes, situacao];
      return { ...prev, filtro_situacoes: situacoes };
    });
    setHasChanges(true);
  };

  const updateConfig = (updates: Partial<AutomacaoConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
    setHasChanges(true);
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
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isExecuting = executing || config.ultimo_status === 'executando';
  const isConfigured = config.hinova_user && config.hinova_pass;

  return (
    <div className="space-y-6">
      {/* Hero Section - Status e Ação Principal */}
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-primary/5 via-background to-primary/10">
        <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,transparent,black)]" />
        <div className="relative p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            {/* Info */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Automação Hinova</h2>
                  <p className="text-sm text-muted-foreground">{corretoraNome}</p>
                </div>
              </div>
              
              {/* Status Badges */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={config.ativo ? "default" : "secondary"} className="gap-1">
                  {config.ativo ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  {config.ativo ? "Ativa" : "Inativa"}
                </Badge>
                
                {isConfigured ? (
                  <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-700 border-green-500/30">
                    <Shield className="h-3 w-3" />
                    Configurada
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 bg-orange-500/10 text-orange-700 border-orange-500/30">
                    <AlertCircle className="h-3 w-3" />
                    Pendente configuração
                  </Badge>
                )}

                {config.ultima_execucao && (
                  <Badge variant="outline" className="gap-1">
                    <Clock className="h-3 w-3" />
                    {format(new Date(config.ultima_execucao), "dd/MM 'às' HH:mm", { locale: ptBR })}
                  </Badge>
                )}
              </div>

              {/* Last execution error */}
              {config.ultimo_erro && config.ultimo_status === 'erro' && (
                <p className="text-sm text-red-600 bg-red-500/10 rounded-md px-3 py-1.5 inline-flex items-center gap-2">
                  <XCircle className="h-4 w-4 shrink-0" />
                  {config.ultimo_erro}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 mr-2">
                <Label htmlFor="ativo-switch" className="text-sm font-medium">Automação</Label>
                <Switch
                  id="ativo-switch"
                  checked={config.ativo}
                  onCheckedChange={(checked) => updateConfig({ ativo: checked })}
                />
              </div>
              
              <Button variant="outline" size="sm" onClick={loadConfig} disabled={saving || stopping}>
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>

              {isExecuting ? (
                <Button 
                  variant="destructive"
                  onClick={handleStop} 
                  disabled={stopping}
                  className="gap-2"
                >
                  {stopping ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Parando...
                    </>
                  ) : (
                    <>
                      <Square className="h-4 w-4" />
                      Parar Execução
                    </>
                  )}
                </Button>
              ) : (
                <Button 
                  onClick={handleExecuteGitHub} 
                  disabled={saving || !isConfigured}
                  className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                >
                  <Github className="h-4 w-4" />
                  Executar Agora
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column - Configuration */}
        <div className="xl:col-span-2 space-y-6">
          {/* Credentials Card */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Credenciais de Acesso
              </CardTitle>
              <CardDescription>
                Configure as credenciais para acessar o portal Hinova
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="hinova-url">URL do Portal</Label>
                  <Input
                    id="hinova-url"
                    value={config.hinova_url}
                    onChange={(e) => updateConfig({ hinova_url: e.target.value })}
                    placeholder="https://eris.hinova.com.br/..."
                    className="font-mono text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hinova-codigo">Código do Cliente</Label>
                  <Input
                    id="hinova-codigo"
                    value={config.hinova_codigo_cliente}
                    onChange={(e) => updateConfig({ hinova_codigo_cliente: e.target.value })}
                    placeholder="Ex: 2363"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="layout-relatorio">Layout do Relatório</Label>
                  <Input
                    id="layout-relatorio"
                    value={config.layout_relatorio}
                    onChange={(e) => updateConfig({ layout_relatorio: e.target.value })}
                    placeholder="Ex: BI - Vangard Cobrança"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hinova-user">Usuário</Label>
                  <Input
                    id="hinova-user"
                    value={config.hinova_user}
                    onChange={(e) => updateConfig({ hinova_user: e.target.value })}
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
                      onChange={(e) => updateConfig({ hinova_pass: e.target.value })}
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
              </div>

              {hasChanges && (
                <div className="flex items-center justify-end pt-2">
                  <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2">
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        Salvar Alterações
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Filters Card */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" />
                Filtros do Relatório
              </CardTitle>
              <CardDescription>
                Configure os filtros que serão aplicados ao extrair o relatório
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Período de Vencimento */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Calendar className="h-4 w-4" />
                  Período de Vencimento Original
                </Label>
                <RadioGroup
                  value={config.filtro_periodo_tipo}
                  onValueChange={(value) => updateConfig({ filtro_periodo_tipo: value })}
                  className="flex flex-wrap gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="mes_atual" id="mes_atual" />
                    <Label htmlFor="mes_atual" className="font-normal cursor-pointer">
                      Mês atual ({format(startOfMonth(new Date()), 'dd/MM')} - {format(endOfMonth(new Date()), 'dd/MM')})
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="customizado" id="customizado" />
                    <Label htmlFor="customizado" className="font-normal cursor-pointer">
                      Período customizado
                    </Label>
                  </div>
                </RadioGroup>

                {config.filtro_periodo_tipo === 'customizado' && (
                  <div className="flex flex-wrap gap-4 mt-3 p-4 rounded-lg bg-muted/50">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Data Início</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                              "w-[140px] justify-start text-left font-normal",
                              !config.filtro_data_inicio && "text-muted-foreground"
                            )}
                          >
                            <Calendar className="mr-2 h-3 w-3" />
                            {config.filtro_data_inicio 
                              ? format(new Date(config.filtro_data_inicio), "dd/MM/yyyy")
                              : "Selecionar"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={config.filtro_data_inicio ? new Date(config.filtro_data_inicio) : undefined}
                            onSelect={(date) => updateConfig({ 
                              filtro_data_inicio: date ? format(date, 'yyyy-MM-dd') : null 
                            })}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Data Fim</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                              "w-[140px] justify-start text-left font-normal",
                              !config.filtro_data_fim && "text-muted-foreground"
                            )}
                          >
                            <Calendar className="mr-2 h-3 w-3" />
                            {config.filtro_data_fim 
                              ? format(new Date(config.filtro_data_fim), "dd/MM/yyyy")
                              : "Selecionar"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={config.filtro_data_fim ? new Date(config.filtro_data_fim) : undefined}
                            onSelect={(date) => updateConfig({ 
                              filtro_data_fim: date ? format(date, 'yyyy-MM-dd') : null 
                            })}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Situação do Boleto */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4" />
                  Situação do Boleto
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {SITUACOES_BOLETO.map((situacao) => (
                    <div key={situacao.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`situacao-${situacao.value}`}
                        checked={config.filtro_situacoes.includes(situacao.value)}
                        onCheckedChange={() => toggleSituacao(situacao.value)}
                      />
                      <Label 
                        htmlFor={`situacao-${situacao.value}`} 
                        className="font-normal cursor-pointer text-sm"
                      >
                        {situacao.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Outros Filtros */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="boletos-anteriores" className="text-sm">Boletos Anteriores</Label>
                  <Select
                    value={config.filtro_boletos_anteriores}
                    onValueChange={(value) => updateConfig({ filtro_boletos_anteriores: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nao_possui">NÃO POSSUI</SelectItem>
                      <SelectItem value="possui">POSSUI</SelectItem>
                      <SelectItem value="todos">TODOS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="referencia" className="text-sm">Referência</Label>
                  <Select
                    value={config.filtro_referencia}
                    onValueChange={(value) => updateConfig({ filtro_referencia: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vencimento_original">VENCIMENTO ORIGINAL</SelectItem>
                      <SelectItem value="data_pagamento">DATA PAGAMENTO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {hasChanges && (
                <div className="flex items-center justify-end pt-2">
                  <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2">
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        Salvar Alterações
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Active Filters Summary & History */}
        <div className="space-y-6">
          {/* Active Filters Summary */}
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" />
                Filtros Ativos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <span className="text-muted-foreground">Período:</span>
                    <p className="font-medium">{getPeriodoExibicao()}</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <span className="text-muted-foreground">Situações:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {config.filtro_situacoes.length > 0 ? (
                        config.filtro_situacoes.map(sit => (
                          <Badge key={sit} variant="secondary" className="text-xs">
                            {sit}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-xs">Nenhuma selecionada</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <Separator className="my-2" />
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Boletos Ant.:</span>
                    <p className="font-medium">
                      {config.filtro_boletos_anteriores === 'nao_possui' ? 'Não possui' 
                       : config.filtro_boletos_anteriores === 'possui' ? 'Possui' : 'Todos'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Referência:</span>
                    <p className="font-medium">
                      {config.filtro_referencia === 'vencimento_original' ? 'Venc. Original' : 'Data Pagto.'}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Execution History */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <History className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Histórico de Execuções</h3>
            </div>
            {config.id ? (
              <CobrancaAutomacaoLogs 
                configId={config.id} 
                corretoraId={corretoraId} 
              />
            ) : (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Salve a configuração para ver o histórico</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
