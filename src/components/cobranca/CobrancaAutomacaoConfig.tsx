import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Save, Loader2, Eye, EyeOff, RefreshCw, CheckCircle, XCircle, Clock, Play, History, Square, Filter, Calendar, FileText, Info } from "lucide-react";
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

// Situações de boleto disponíveis no Hinova
const SITUACOES_BOLETO = [
  { value: "ABERTO", label: "Aberto" },
  { value: "BAIXADO", label: "Baixado" },
  { value: "CANCELADO", label: "Cancelado" },
  { value: "VENCIDO", label: "Vencido" },
  { value: "PROTESTADO", label: "Protestado" },
  { value: "RENEGOCIADO", label: "Renegociado" },
  { value: "EM_CARTORIO", label: "Em Cartório" },
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

// Valores padrão vazios - cada associação deve configurar seus próprios dados
const DEFAULT_CONFIG: Omit<AutomacaoConfig, 'corretora_id'> = {
  hinova_url: '',
  hinova_user: '',
  hinova_pass: '',
  hinova_codigo_cliente: '',
  layout_relatorio: '',
  ativo: false,
  // Filtros padrão
  filtro_periodo_tipo: 'mes_atual',
  filtro_data_inicio: null,
  filtro_data_fim: null,
  filtro_situacoes: ['ABERTO', 'BAIXADO'],
  filtro_boletos_anteriores: 'nao_possui',
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
          : (data.filtro_situacoes || ['ABERTO', 'BAIXADO']);
        
        setConfig({
          ...data,
          filtro_situacoes: situacoes,
          filtro_periodo_tipo: data.filtro_periodo_tipo || 'mes_atual',
          filtro_boletos_anteriores: data.filtro_boletos_anteriores || 'nao_possui',
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
      const { data, error } = await supabase.functions.invoke('executar-cobranca-hinova', {
        body: { corretora_id: corretoraId }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Execução iniciada! Acompanhe o status no histórico.");
        setActiveTab("historico");
        loadConfig();
      } else {
        toast.error(data?.message || "Erro ao executar automação");
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
              </CardTitle>
              <CardDescription className="mt-1">
                {corretoraNome}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="ativo-switch" className="text-sm">Ativa</Label>
              <Switch
                id="ativo-switch"
                checked={config.ativo}
                onCheckedChange={(checked) => setConfig(prev => ({ ...prev, ativo: checked }))}
              />
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
                variant="secondary" 
                size="sm"
                onClick={handleExecute} 
                disabled={saving || !config.id}
              >
                <Play className="h-4 w-4 mr-2" />
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

      {/* Tabs: Configuração, Filtros e Histórico */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="config" className="gap-2">
            <Settings className="h-4 w-4" />
            Acesso
          </TabsTrigger>
          <TabsTrigger value="filtros" className="gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-2">
            <History className="h-4 w-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-4">
          <Card>
            <CardContent className="pt-6 space-y-6">
              {/* Configurações de acesso */}
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
        </TabsContent>

        <TabsContent value="filtros" className="mt-4 space-y-4">
          {/* Card de Resumo dos Filtros Ativos */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                Filtros Ativos
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Período:</span>
                  <span className="font-medium">{getPeriodoExibicao()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Situações:</span>
                  <span className="font-medium">
                    {config.filtro_situacoes.length > 0 
                      ? config.filtro_situacoes.join(', ') 
                      : 'Nenhuma selecionada'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Boletos Anteriores:</span>
                  <span className="font-medium">
                    {config.filtro_boletos_anteriores === 'nao_possui' ? 'Não possui' 
                     : config.filtro_boletos_anteriores === 'possui' ? 'Possui' : 'Todos'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Referência:</span>
                  <span className="font-medium">
                    {config.filtro_referencia === 'vencimento_original' ? 'Vencimento Original' : 'Data Pagamento'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Configurações de Filtros */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configurar Filtros do Relatório</CardTitle>
              <CardDescription>
                Defina os filtros que serão aplicados ao extrair o relatório do Hinova
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Período de Vencimento */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Período de Vencimento Original
                </Label>
                <RadioGroup
                  value={config.filtro_periodo_tipo}
                  onValueChange={(value) => setConfig(prev => ({ ...prev, filtro_periodo_tipo: value }))}
                  className="space-y-2"
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
                  <div className="flex flex-wrap gap-4 mt-3 pl-6">
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">Data Início</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-[180px] justify-start text-left font-normal",
                              !config.filtro_data_inicio && "text-muted-foreground"
                            )}
                          >
                            <Calendar className="mr-2 h-4 w-4" />
                            {config.filtro_data_inicio 
                              ? format(new Date(config.filtro_data_inicio), "dd/MM/yyyy")
                              : "Selecionar"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={config.filtro_data_inicio ? new Date(config.filtro_data_inicio) : undefined}
                            onSelect={(date) => setConfig(prev => ({ 
                              ...prev, 
                              filtro_data_inicio: date ? format(date, 'yyyy-MM-dd') : null 
                            }))}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">Data Fim</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-[180px] justify-start text-left font-normal",
                              !config.filtro_data_fim && "text-muted-foreground"
                            )}
                          >
                            <Calendar className="mr-2 h-4 w-4" />
                            {config.filtro_data_fim 
                              ? format(new Date(config.filtro_data_fim), "dd/MM/yyyy")
                              : "Selecionar"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={config.filtro_data_fim ? new Date(config.filtro_data_fim) : undefined}
                            onSelect={(date) => setConfig(prev => ({ 
                              ...prev, 
                              filtro_data_fim: date ? format(date, 'yyyy-MM-dd') : null 
                            }))}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                )}
              </div>

              {/* Situação do Boleto */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Situação do Boleto
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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
                <p className="text-xs text-muted-foreground">
                  Selecione as situações de boleto que deseja incluir no relatório
                </p>
              </div>

              {/* Boletos Anteriores */}
              <div className="space-y-3">
                <Label htmlFor="boletos-anteriores">Boletos Anteriores</Label>
                <Select
                  value={config.filtro_boletos_anteriores}
                  onValueChange={(value) => setConfig(prev => ({ ...prev, filtro_boletos_anteriores: value }))}
                >
                  <SelectTrigger className="w-full sm:w-[280px]">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao_possui">NÃO POSSUI</SelectItem>
                    <SelectItem value="possui">POSSUI</SelectItem>
                    <SelectItem value="todos">TODOS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Referência */}
              <div className="space-y-3">
                <Label htmlFor="referencia">Referência</Label>
                <Select
                  value={config.filtro_referencia}
                  onValueChange={(value) => setConfig(prev => ({ ...prev, filtro_referencia: value }))}
                >
                  <SelectTrigger className="w-full sm:w-[280px]">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vencimento_original">VENCIMENTO ORIGINAL</SelectItem>
                    <SelectItem value="data_pagamento">DATA PAGAMENTO</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Info sobre automação */}
              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <h4 className="font-medium text-blue-700 mb-2 flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Sobre os Filtros
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Os filtros serão aplicados no portal Hinova antes de gerar o relatório</li>
                  <li>• Filtros mais específicos resultam em arquivos menores e processamento mais rápido</li>
                  <li>• A automação marcará apenas os checkboxes selecionados</li>
                  <li>• Filtros regionais e por cooperativa são marcados automaticamente pelo portal</li>
                </ul>
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
