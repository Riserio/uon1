import { useState, useCallback, useEffect } from "react";
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
import { toast } from "sonner";
import { Search, Users, Car, Calendar, FileSpreadsheet, Download, Loader2, RefreshCw, AlertCircle, CheckCircle2, Zap } from "lucide-react";

interface SGAConsultaHinovaProps {
  corretoraId: string;
  corretoraNome?: string;
}

export default function SGAConsultaHinova({ corretoraId, corretoraNome }: SGAConsultaHinovaProps) {
  const [activeTab, setActiveTab] = useState("associados");
  const [loading, setLoading] = useState(false);
  const [sessionActive, setSessionActive] = useState<boolean | null>(null);
  const [sessionUpdatedAt, setSessionUpdatedAt] = useState<string | null>(null);
  const [connectingSession, setConnectingSession] = useState(false);
  const [error, setError] = useState("");

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
      if (data.action === 'session_expired' || data.action === 'login_failed') {
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

  // Auto-check session on mount
  useEffect(() => {
    handleCheckSession();
  }, []);

  const handleCheckSession = async () => {
    setConnectingSession(true);
    setError("");
    try {
      const result = await invokeProxy('login');
      if (result.success) {
        setSessionActive(true);
      }
    } catch (e: any) {
      setError(e.message);
      setSessionActive(false);
    } finally {
      setConnectingSession(false);
    }
  };

  const handleRefreshSession = async () => {
    setConnectingSession(true);
    setError("");
    try {
      const result = await invokeProxy('refresh-session');
      if (result.success) {
        setSessionActive(true);
        setSessionUpdatedAt(result.session_cookies_updated_at);
        toast.success("✅ Sessão conectada com sucesso!");
      }
    } catch (e: any) {
      setError(e.message);
      setSessionActive(false);
      toast.error(e.message);
    } finally {
      setConnectingSession(false);
    }
  };

  const handleBuscarAssociado = async () => {
    if (!buscaAssociado.trim()) { toast.error("Digite um termo de busca"); return; }
    setLoading(true);
    setError("");
    try {
      const result = await invokeProxy('consultar-associado', { busca: buscaAssociado });
      setAssociados(result.data || []);
      if (result.data?.length === 0) toast.info("Nenhum associado encontrado");
      else toast.success(`${result.data.length} associado(s) encontrado(s)`);
    } catch (e: any) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBuscarVeiculo = async () => {
    if (!buscaVeiculo.trim()) { toast.error("Digite um termo de busca"); return; }
    setLoading(true);
    setError("");
    try {
      const result = await invokeProxy('consultar-veiculo', { busca: buscaVeiculo });
      setVeiculos(result.data || []);
      if (result.data?.length === 0) toast.info("Nenhum veículo encontrado");
      else toast.success(`${result.data.length} veículo(s) encontrado(s)`);
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
      if (result.data?.length === 0) toast.info("Nenhum evento encontrado");
      else toast.success(`${result.data.length} evento(s) encontrado(s)`);
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
        for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
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
                <TableHead key={col} className="whitespace-nowrap text-xs font-semibold">{col}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, i) => (
              <TableRow key={i}>
                {columns.map(col => (
                  <TableCell key={col} className="text-xs whitespace-nowrap">{row[col] || '-'}</TableCell>
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
      return new Date(dateStr).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return null; }
  };

  return (
    <div className="space-y-6">
      {/* Status de conexão */}
      <Card className="bg-muted/40 rounded-2xl border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {connectingSession ? (
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-accent/50">
                  <Loader2 className="h-5 w-5 text-accent-foreground animate-spin" />
                </div>
              ) : sessionActive === true ? (
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
              ) : (
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-destructive/10">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">
                    {connectingSession
                      ? 'Conectando ao portal...'
                      : sessionActive === true
                      ? 'Conectado ao SGA'
                      : 'Desconectado'}
                  </p>
                  {sessionActive === true && (
                    <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Online</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {corretoraNome || 'Associação não selecionada'}
                  {sessionUpdatedAt && <span className="ml-2">· Sessão de {formatSessionDate(sessionUpdatedAt)}</span>}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckSession}
                disabled={connectingSession}
              >
                {connectingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                <span className="ml-2 hidden sm:inline">Verificar</span>
              </Button>
              <Button
                variant={sessionActive === false ? "default" : "outline"}
                size="sm"
                onClick={handleRefreshSession}
                disabled={connectingSession}
              >
                {connectingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-2">Reconectar</span>
              </Button>
            </div>
          </div>

          {error && !connectingSession && (
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
                />
                <Button onClick={handleBuscarAssociado} disabled={loading}>
                  {loading && activeTab === 'associados' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  <span className="ml-2 hidden sm:inline">Buscar</span>
                </Button>
              </div>
              {loading && activeTab === 'associados' ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <>
                  {associados.length > 0 && <p className="text-xs text-muted-foreground">{associados.length} resultado(s)</p>}
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
                />
                <Button onClick={handleBuscarVeiculo} disabled={loading}>
                  {loading && activeTab === 'veiculos' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  <span className="ml-2 hidden sm:inline">Buscar</span>
                </Button>
              </div>
              {loading && activeTab === 'veiculos' ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <>
                  {veiculos.length > 0 && <p className="text-xs text-muted-foreground">{veiculos.length} resultado(s)</p>}
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
                  <Input type="date" value={eventosDataInicio} onChange={(e) => setEventosDataInicio(e.target.value)} className="w-40" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Data Fim</Label>
                  <Input type="date" value={eventosDataFim} onChange={(e) => setEventosDataFim(e.target.value)} className="w-40" />
                </div>
                <Button onClick={handleListarEventos} disabled={loading}>
                  {loading && activeTab === 'eventos' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  <span className="ml-2">Buscar</span>
                </Button>
              </div>
              {loading && activeTab === 'eventos' ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <>
                  {eventosData.length > 0 && <p className="text-xs text-muted-foreground">{eventosData.length} resultado(s)</p>}
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
                  <Select value={relatorioLayout} onValueChange={setRelatorioLayout}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VANGARD">VANGARD</SelectItem>
                      <SelectItem value="PADRAO">PADRÃO</SelectItem>
                      <SelectItem value="COMPLETO">COMPLETO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Data Início</Label>
                  <Input type="date" value={eventosDataInicio} onChange={(e) => setEventosDataInicio(e.target.value)} className="w-40" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Data Fim</Label>
                  <Input type="date" value={eventosDataFim} onChange={(e) => setEventosDataFim(e.target.value)} className="w-40" />
                </div>
                <Button onClick={handleGerarRelatorio} disabled={relatorioLoading}>
                  {relatorioLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  <span className="ml-2">Gerar Excel</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
