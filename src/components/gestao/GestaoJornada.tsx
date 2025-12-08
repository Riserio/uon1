import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Clock, 
  MapPin, 
  LogIn, 
  LogOut, 
  Coffee,
  AlertTriangle,
  Calendar,
  Bell,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import ConfigurarAlertasDialog from "./ConfigurarAlertasDialog";

const tiposPonto = [
  { value: "entrada", label: "Entrada", icon: LogIn, color: "text-green-600" },
  { value: "saida_almoco", label: "Saída Almoço", icon: Coffee, color: "text-amber-600" },
  { value: "volta_almoco", label: "Volta Almoço", icon: Coffee, color: "text-blue-600" },
  { value: "saida", label: "Saída", icon: LogOut, color: "text-red-600" },
];

export default function GestaoJornada() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [funcionarioId, setFuncionarioId] = useState<string>("");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [endereco, setEndereco] = useState<string>("");
  const [alertasOpen, setAlertasOpen] = useState(false);
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [ano, setAno] = useState(new Date().getFullYear());

  // Fetch funcionários
  const { data: funcionarios } = useQuery({
    queryKey: ["funcionarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funcionarios")
        .select("*")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  // Fetch registros do mês
  const { data: registros, isLoading } = useQuery({
    queryKey: ["registros_ponto", funcionarioId, mes, ano],
    queryFn: async () => {
      if (!funcionarioId) return [];
      
      const inicio = new Date(ano, mes - 1, 1).toISOString();
      const fim = new Date(ano, mes, 0, 23, 59, 59).toISOString();

      const { data, error } = await supabase
        .from("registros_ponto")
        .select("*")
        .eq("funcionario_id", funcionarioId)
        .gte("data_hora", inicio)
        .lte("data_hora", fim)
        .order("data_hora", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!funcionarioId,
  });

  // Get today's records for disabling buttons
  const todayRecords = useMemo(() => {
    if (!registros) return [];
    const today = format(new Date(), "yyyy-MM-dd");
    return registros.filter((r: any) => 
      format(new Date(r.data_hora), "yyyy-MM-dd") === today
    );
  }, [registros]);

  // Check which types have already been registered today
  const registeredTypes = useMemo(() => {
    return new Set(todayRecords.map((r: any) => r.tipo));
  }, [todayRecords]);

  // Obter localização
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setLocation({ lat, lng });

          // Tentar obter endereço aproximado (reverse geocoding simples)
          try {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
            );
            const data = await response.json();
            if (data.display_name) {
              setEndereco(data.display_name.split(",").slice(0, 3).join(","));
            }
          } catch (err) {
            console.error("Erro ao obter endereço:", err);
          }
        },
        (error) => {
          console.error("Erro ao obter localização:", error);
          toast.error("Não foi possível obter sua localização");
        }
      );
    }
  }, []);

  // Registrar ponto
  const registrarPonto = useMutation({
    mutationFn: async (tipo: string) => {
      if (!funcionarioId) throw new Error("Selecione um funcionário");

      // Check if already registered today
      if (registeredTypes.has(tipo)) {
        throw new Error(`${tiposPonto.find(t => t.value === tipo)?.label} já foi registrado(a) hoje`);
      }

      const { error } = await supabase.from("registros_ponto").insert({
        funcionario_id: funcionarioId,
        tipo,
        data_hora: new Date().toISOString(),
        latitude: location?.lat,
        longitude: location?.lng,
        endereco_aproximado: endereco,
        ip: "",
        user_agent: navigator.userAgent,
        dispositivo: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? "mobile" : "desktop",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registros_ponto"] });
      toast.success("Ponto registrado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao registrar ponto: " + error.message);
    },
  });

  // Calcular estatísticas
  const stats = {
    diasTrabalhados: new Set(registros?.filter((r: any) => r.tipo === "entrada").map((r: any) => 
      format(new Date(r.data_hora), "yyyy-MM-dd")
    )).size,
    horasEstimadas: 0,
    atrasos: 0,
  };

  // Agrupar registros por dia
  const registrosPorDia = registros?.reduce((acc: any, registro: any) => {
    const dia = format(new Date(registro.data_hora), "yyyy-MM-dd");
    if (!acc[dia]) acc[dia] = [];
    acc[dia].push(registro);
    return acc;
  }, {});

  const funcionarioSelecionado = funcionarios?.find((f) => f.id === funcionarioId);

  return (
    <div className="space-y-6">
      {/* Seleção de Funcionário */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Controle de Jornada
          </CardTitle>
          <CardDescription>
            Registre e acompanhe a jornada de trabalho dos colaboradores
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 space-y-2">
              <Label>Funcionário</Label>
              <Select value={funcionarioId} onValueChange={setFuncionarioId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um funcionário" />
                </SelectTrigger>
                <SelectContent>
                  {funcionarios?.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome} - {f.cargo || "Sem cargo"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={() => setAlertasOpen(true)} disabled={!funcionarioId}>
              <Bell className="h-4 w-4 mr-2" />
              Configurar Alertas
            </Button>
          </div>
        </CardContent>
      </Card>

      {funcionarioId && (
        <Tabs defaultValue="registro" className="space-y-4">
          <TabsList>
            <TabsTrigger value="registro">Registrar Ponto</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
            <TabsTrigger value="relatorio">Relatório</TabsTrigger>
          </TabsList>

          <TabsContent value="registro">
            <Card>
              <CardHeader>
                <CardTitle>Registrar Ponto</CardTitle>
                <CardDescription>
                  {location ? (
                    <span className="flex items-center gap-1 text-green-600">
                      <MapPin className="h-4 w-4" />
                      Localização obtida: {endereco || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="h-4 w-4" />
                      Obtendo localização...
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {tiposPonto.map((tipo) => {
                    const Icon = tipo.icon;
                    const isRegistered = registeredTypes.has(tipo.value);
                    return (
                      <Button
                        key={tipo.value}
                        variant="outline"
                        className={`h-24 flex-col gap-2 ${tipo.color} ${isRegistered ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={() => registrarPonto.mutate(tipo.value)}
                        disabled={registrarPonto.isPending || isRegistered}
                        title={isRegistered ? `${tipo.label} já registrado(a) hoje` : `Registrar ${tipo.label}`}
                      >
                        <Icon className="h-8 w-8" />
                        <span>{tipo.label}</span>
                        {isRegistered && (
                          <span className="text-xs text-muted-foreground">Registrado</span>
                        )}
                      </Button>
                    );
                  })}
                </div>

                <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium mb-2">Últimos registros de hoje</h4>
                  <div className="space-y-2">
                    {todayRecords.slice(0, 4).map((registro: any) => {
                      const tipo = tiposPonto.find((t) => t.value === registro.tipo);
                      const Icon = tipo?.icon || Clock;
                      return (
                        <div
                          key={registro.id}
                          className="flex items-center justify-between p-2 bg-background rounded"
                        >
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 ${tipo?.color}`} />
                            <span className="capitalize">{tipo?.label}</span>
                          </div>
                          <span className="text-muted-foreground">
                            {format(new Date(registro.data_hora), "dd/MM HH:mm")}
                          </span>
                        </div>
                      );
                    })}
                    {todayRecords.length === 0 && (
                      <p className="text-muted-foreground text-sm text-center py-2">
                        Nenhum registro hoje
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="historico">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Histórico de Ponto
                  </CardTitle>
                  <div className="flex gap-2">
                    <Select value={mes.toString()} onValueChange={(v) => setMes(parseInt(v))}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => (
                          <SelectItem key={i + 1} value={(i + 1).toString()}>
                            {format(new Date(2024, i), "MMMM", { locale: ptBR })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={ano.toString()} onValueChange={(v) => setAno(parseInt(v))}>
                      <SelectTrigger className="w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[2024, 2025, 2026].map((a) => (
                          <SelectItem key={a} value={a.toString()}>
                            {a}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                ) : Object.keys(registrosPorDia || {}).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum registro encontrado neste período
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(registrosPorDia || {}).sort((a, b) => b[0].localeCompare(a[0])).map(([dia, regs]: [string, any]) => (
                      <div key={dia} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">
                            {format(parseISO(dia), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                          </span>
                          <Badge variant="outline">
                            {regs.length} registro(s)
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {regs.sort((a: any, b: any) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime()).map((registro: any) => {
                            const tipo = tiposPonto.find((t) => t.value === registro.tipo);
                            const Icon = tipo?.icon || Clock;
                            return (
                              <div
                                key={registro.id}
                                className="flex items-center gap-2 p-2 bg-muted/50 rounded text-sm"
                              >
                                <Icon className={`h-4 w-4 ${tipo?.color}`} />
                                <div className="flex flex-col">
                                  <span>{format(new Date(registro.data_hora), "dd/MM HH:mm")}</span>
                                  <span className="text-muted-foreground capitalize text-xs">
                                    {tipo?.label}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="relatorio">
            <div className="grid md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Dias Trabalhados</CardDescription>
                  <CardTitle className="text-2xl">{stats.diasTrabalhados}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Jornada Configurada</CardDescription>
                  <CardTitle className="text-2xl">
                    {funcionarioSelecionado?.carga_horaria_semanal || 44}h/semana
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Horário</CardDescription>
                  <CardTitle className="text-lg">
                    {funcionarioSelecionado?.horario_entrada} - {funcionarioSelecionado?.horario_saida}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Dialog de Alertas */}
      <ConfigurarAlertasDialog
        open={alertasOpen}
        onOpenChange={setAlertasOpen}
        funcionarioId={funcionarioId}
        funcionarioNome={funcionarioSelecionado?.nome}
      />
    </div>
  );
}
