import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Search, Users, Car, Calendar, FileSpreadsheet, Download, Loader2, RefreshCw, AlertCircle, Wifi, WifiOff, CheckCircle2, Clock, Zap } from "lucide-react";

interface SGAConsultaHinovaProps {
  corretoraId: string;
  corretoraNome?: string;
}

const POLL_INTERVAL = 10_000; // 10s
const POLL_MAX_DURATION = 180_000; // 3min

export default function SGAConsultaHinova({ corretoraId, corretoraNome }: SGAConsultaHinovaProps) {
  const [activeTab, setActiveTab] = useState("associados");
  const [loading, setLoading] = useState(false);
  const [sessionActive, setSessionActive] = useState<boolean | null>(null);
  const [sessionUpdatedAt, setSessionUpdatedAt] = useState<string | null>(null);
  const [refreshingSession, setRefreshingSession] = useState(false);
  const [pollingSession, setPollingSession] = useState(false);
  const [pollElapsed, setPollElapsed] = useState(0);
  const [error, setError] = useState("");
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  // Associados
  const [buscaAssociado, setBuscaAssociado] = useState("");
  const [associados, setAssociados] = useState<Record<string, string>[]>([]);

  // Veículos
  const [buscaVeiculo, setBuscaVeiculo] = useState("");
  const [veiculos, setVeiculos] = useState<Record<string, string>[]>([]);

  // Eventos
  const [eventosData, setEventosData] = useState<Record<string, string>[]>([]);
  const [eventosDataInicio, setEventosDataInicio] = useState("");
  const [eventosDataFim, setEventosDataFim] = useState("");

  // Relatórios
  const [relatorioLayout, setRelatorioLayout] = useState("VANGARD");
  const [relatorioLoading, setRelatorioLoading] = useState(false);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const invokeProxy = useCallback(async (action: string, params?: Record<string, string>) => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const url = `https://${projectId}.supabase.co/functions/v1/hinova-proxy`;

    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({
        corretora_id: corretoraId,
        action,
        params,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      if (data.action === 'session_expired' || data.action === 'no_session') {
        setSessionActive(false);
      }
      throw new Error(data.error || 'Erro na operação');
    }

    setSessionActive(true);
    if (data.session_cookies_updated_at) {
      setSessionUpdatedAt(data.session_cookies_updated_at);
    }

    return data;
  }, [corretoraId]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPollingSession(false);
    setPollElapsed(0);
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    setPollingSession(true);
    pollStartRef.current = Date.now();
    setPollElapsed(0);

    pollTimerRef.current = setInterval(async () => {
      const elapsed = Date.now() - pollStartRef.current;
      setPollElapsed(elapsed);

      if (elapsed >= POLL_MAX_DURATION) {
        stopPolling();
        toast.error("Tempo limite atingido. Tente novamente.");
        return;
      }

      try {
        const result = await invokeProxy('login');
        if (result.success) {
          stopPolling();
          setSessionActive(true);
          toast.success("✅ Sessão ativa! Pronto para consultar.");
        }
      } catch {
        // Still waiting...
      }
    }, POLL_INTERVAL);
  }, [invokeProxy, stopPolling]);

  const handleCheckSession = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await invokeProxy('login');
      if (result.success) {
        toast.success("Sessão ativa no SGA!");
        setSessionActive(true);
      }
    } catch (e: any) {
      setError(e.message);
      setSessionActive(false);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshSession = async () => {
    setRefreshingSession(true);
    setError("");
    try {
      const result = await invokeProxy('refresh-session');
      if (result.success) {
        toast.info("🤖 Robô disparado! Verificando automaticamente quando a sessão estiver pronta...");
        startPolling();
      }
    } catch (e: any) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setRefreshingSession(false);
    }
  };

  const handleBuscarAssociado = async () => {
    if (!buscaAssociado.trim()) {
      toast.error("Digite um termo de busca");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await invokeProxy('consultar-associado', { busca: buscaAssociado });
      setAssociados(result.data || []);
      if (result.data?.length === 0) {
        toast.info("Nenhum associado encontrado");
      } else {
        toast.success(`${result.data.length} associado(s) encontrado(s)`);
      }
    } catch (e: any) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBuscarVeiculo = async () => {
    if (!buscaVeiculo.trim()) {
      toast.error("Digite um termo de busca");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await invokeProxy('consultar-veiculo', { busca: buscaVeiculo });
      setVeiculos(result.data || []);
      if (result.data?.length === 0) {
        toast.info("Nenhum veículo encontrado");
      } else {
        toast.success(`${result.data.length} veículo(s) encontrado(s)`);
      }
    } catch (e: any) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleListarEventos = async () => {
    setLoading(true);
    setError("");
    try {
      const params: Record<string, string> = {};
      if (eventosDataInicio) params.data_inicio = eventosDataInicio;
      if (eventosDataFim) params.data_fim = eventosDataFim;
      const result = await invokeProxy('listar-eventos', params);
      setEventosData(result.data || []);
      if (result.data?.length === 0) {
        toast.info("Nenhum evento encontrado");
      } else {
        toast.success(`${result.data.length} evento(s) encontrado(s)`);
      }
    } catch (e: any) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGerarRelatorio = async () => {
    setRelatorioLoading(true);
    setError("");
    try {
      const params: Record<string, string> = { layout: relatorioLayout };
      if (eventosDataInicio) params.data_inicio = eventosDataInicio;
      if (eventosDataFim) params.data_fim = eventosDataFim;

      const result = await invokeProxy('gerar-relatorio', params);

      if (result.file) {
        const byteCharacters = atob(result.file);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: result.contentType || 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.fileName || 'relatorio.xls';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("Relatório baixado com sucesso!");
      } else if (result.data) {
        setEventosData(result.data);
        toast.info(result.note || "Dados do relatório carregados na tabela");
      }
    } catch (e: any) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setRelatorioLoading(false);
    }
  };

  const renderTable = (data: Record<string, string>[]) => {
    if (data.length === 0) return null;
    const columns = Object.keys(data[0]);
    return (
      <div className="rounded-xl border border-border/50 overflow-auto max-h-[500px]">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(col => (
                <TableHead key={col} className="whitespace-nowrap text-xs font-semibold">
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, i) => (
              <TableRow key={i}>
                {columns.map(col => (
                  <TableCell key={col} className="text-xs whitespace-nowrap">
                    {row[col] || '-'}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  const formatSessionDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return null;
    }
  };

  const pollProgress = Math.min((pollElapsed / POLL_MAX_DURATION) * 100, 100);
  const pollSecondsRemaining = Math.max(0, Math.ceil((POLL_MAX_DURATION - pollElapsed) / 1000));

  return (
    <div className="space-y-6">
      {/* Status de conexão */}
      <Card className="bg-muted/40 rounded-2xl border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {sessionActive === true ? (
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
              ) : pollingSession ? (
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-accent/50">
                  <Loader2 className="h-5 w-5 text-accent-foreground animate-spin" />
                </div>
              ) : sessionActive === false ? (
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-destructive/10">
                  <WifiOff className="h-5 w-5 text-destructive" />
                </div>
              ) : (
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
                  <Wifi className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">
                    {pollingSession
                      ? 'Aguardando robô...'
                      : sessionActive === true
                      ? 'Conectado ao SGA'
                      : sessionActive === false
                      ? 'Sessão inativa'
                      : 'Verificar conexão'}
                  </p>
                  {sessionActive === true && (
                    <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                      Online
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {corretoraNome || 'Associação não selecionada'}
                  {sessionUpdatedAt && (
                    <span className="ml-2">· Sessão de {formatSessionDate(sessionUpdatedAt)}</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckSession}
                disabled={loading || pollingSession}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                <span className="ml-2 hidden sm:inline">Verificar</span>
              </Button>
              <Button
                variant={sessionActive === false && !pollingSession ? "default" : "outline"}
                size="sm"
                onClick={pollingSession ? stopPolling : handleRefreshSession}
                disabled={refreshingSession}
              >
                {refreshingSession ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : pollingSession ? (
                  <Clock className="h-4 w-4" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-2">
                  {pollingSession ? 'Cancelar' : 'Atualizar Sessão'}
                </span>
              </Button>
            </div>
          </div>

          {/* Polling progress */}
          {pollingSession && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Robô fazendo login no portal... verificando a cada 10s
                </span>
                <span>{Math.floor(pollSecondsRemaining / 60)}:{String(pollSecondsRemaining % 60).padStart(2, '0')} restantes</span>
              </div>
              <Progress value={pollProgress} className="h-1.5" />
              <p className="text-[11px] text-muted-foreground/70">
                O robô está acessando o portal Hinova, fazendo login e salvando a sessão. Isso leva em média 1-2 minutos.
              </p>
            </div>
          )}

          {error && !pollingSession && (
            <div className="mt-3 flex items-center gap-2 text-destructive text-xs bg-destructive/5 rounded-lg p-2.5">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Abas de consulta */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start gap-1 p-1.5 bg-muted/50 rounded-xl">
          <TabsTrigger value="associados" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-md">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Associados</span>
          </TabsTrigger>
          <TabsTrigger value="veiculos" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-md">
            <Car className="h-4 w-4" />
            <span className="hidden sm:inline">Veículos</span>
          </TabsTrigger>
          <TabsTrigger value="eventos" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-md">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Eventos</span>
          </TabsTrigger>
          <TabsTrigger value="relatorios" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-md">
            <FileSpreadsheet className="h-4 w-4" />
            <span className="hidden sm:inline">Relatórios</span>
          </TabsTrigger>
        </TabsList>

        {/* Associados */}
        <TabsContent value="associados" className="space-y-4">
          <Card className="bg-muted/40 rounded-2xl border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Consultar Associado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Nome, CPF ou código do associado..."
                  value={buscaAssociado}
                  onChange={(e) => setBuscaAssociado(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleBuscarAssociado()}
                  className="flex-1"
                  disabled={sessionActive !== true}
                />
                <Button onClick={handleBuscarAssociado} disabled={loading || sessionActive !== true}>
                  {loading && activeTab === 'associados' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  <span className="ml-2 hidden sm:inline">Buscar</span>
                </Button>
              </div>
              {sessionActive !== true && (
                <p className="text-xs text-muted-foreground italic">Conecte-se ao SGA primeiro para realizar consultas.</p>
              )}
              {loading && activeTab === 'associados' ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <>
                  {associados.length > 0 && (
                    <p className="text-xs text-muted-foreground">{associados.length} resultado(s)</p>
                  )}
                  {renderTable(associados)}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Veículos */}
        <TabsContent value="veiculos" className="space-y-4">
          <Card className="bg-muted/40 rounded-2xl border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Car className="h-4 w-4 text-primary" />
                Consultar Veículo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Placa, modelo ou chassi..."
                  value={buscaVeiculo}
                  onChange={(e) => setBuscaVeiculo(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleBuscarVeiculo()}
                  className="flex-1"
                  disabled={sessionActive !== true}
                />
                <Button onClick={handleBuscarVeiculo} disabled={loading || sessionActive !== true}>
                  {loading && activeTab === 'veiculos' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  <span className="ml-2 hidden sm:inline">Buscar</span>
                </Button>
              </div>
              {sessionActive !== true && (
                <p className="text-xs text-muted-foreground italic">Conecte-se ao SGA primeiro para realizar consultas.</p>
              )}
              {loading && activeTab === 'veiculos' ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <>
                  {veiculos.length > 0 && (
                    <p className="text-xs text-muted-foreground">{veiculos.length} resultado(s)</p>
                  )}
                  {renderTable(veiculos)}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Eventos */}
        <TabsContent value="eventos" className="space-y-4">
          <Card className="bg-muted/40 rounded-2xl border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Listar Eventos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Data Início</Label>
                  <Input
                    type="date"
                    value={eventosDataInicio}
                    onChange={(e) => setEventosDataInicio(e.target.value)}
                    className="w-40"
                    disabled={sessionActive !== true}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Data Fim</Label>
                  <Input
                    type="date"
                    value={eventosDataFim}
                    onChange={(e) => setEventosDataFim(e.target.value)}
                    className="w-40"
                    disabled={sessionActive !== true}
                  />
                </div>
                <Button onClick={handleListarEventos} disabled={loading || sessionActive !== true}>
                  {loading && activeTab === 'eventos' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  <span className="ml-2">Buscar</span>
                </Button>
              </div>
              {sessionActive !== true && (
                <p className="text-xs text-muted-foreground italic">Conecte-se ao SGA primeiro para realizar consultas.</p>
              )}
              {loading && activeTab === 'eventos' ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <>
                  {eventosData.length > 0 && (
                    <p className="text-xs text-muted-foreground">{eventosData.length} resultado(s)</p>
                  )}
                  {renderTable(eventosData)}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Relatórios */}
        <TabsContent value="relatorios" className="space-y-4">
          <Card className="bg-muted/40 rounded-2xl border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                Gerar Relatório em Excel
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Layout</Label>
                  <Select value={relatorioLayout} onValueChange={setRelatorioLayout} disabled={sessionActive !== true}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VANGARD">VANGARD</SelectItem>
                      <SelectItem value="PADRAO">PADRÃO</SelectItem>
                      <SelectItem value="COMPLETO">COMPLETO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Data Início</Label>
                  <Input
                    type="date"
                    value={eventosDataInicio}
                    onChange={(e) => setEventosDataInicio(e.target.value)}
                    className="w-40"
                    disabled={sessionActive !== true}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Data Fim</Label>
                  <Input
                    type="date"
                    value={eventosDataFim}
                    onChange={(e) => setEventosDataFim(e.target.value)}
                    className="w-40"
                    disabled={sessionActive !== true}
                  />
                </div>
                <Button onClick={handleGerarRelatorio} disabled={relatorioLoading || sessionActive !== true} className="gap-2">
                  {relatorioLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Gerar Excel
                </Button>
              </div>
              {sessionActive !== true ? (
                <p className="text-xs text-muted-foreground italic">Conecte-se ao SGA primeiro para gerar relatórios.</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  O relatório será gerado diretamente do portal Hinova e baixado como arquivo Excel.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
