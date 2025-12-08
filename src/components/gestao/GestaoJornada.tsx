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
  Download,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  Mail,
  MessageCircle,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, differenceInMinutes, getDaysInMonth, getDay, isWeekend } from "date-fns";
import { ptBR } from "date-fns/locale";
import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";
import ConfigurarAlertasDialog from "./ConfigurarAlertasDialog";

const tiposPonto = [
  { value: "entrada", label: "Entrada", icon: LogIn, color: "text-green-600" },
  { value: "saida_almoco", label: "Saída Almoço", icon: Coffee, color: "text-amber-600" },
  { value: "volta_almoco", label: "Volta Almoço", icon: Coffee, color: "text-blue-600" },
  { value: "saida", label: "Saída", icon: LogOut, color: "text-red-600" },
];

// Feriados de Belo Horizonte, MG (nacionais, estaduais e municipais)
const getFeriadosBH = (year: number): string[] => {
  const feriados = [
    // Feriados Nacionais Fixos
    `${year}-01-01`, // Confraternização Universal
    `${year}-04-21`, // Tiradentes
    `${year}-05-01`, // Dia do Trabalho
    `${year}-09-07`, // Independência
    `${year}-10-12`, // Nossa Senhora Aparecida
    `${year}-11-02`, // Finados
    `${year}-11-15`, // Proclamação da República
    `${year}-12-25`, // Natal
    // Feriados Estaduais de Minas Gerais
    `${year}-04-21`, // Data Magna de Minas Gerais (mesmo dia de Tiradentes)
    // Feriados Municipais de Belo Horizonte
    `${year}-08-15`, // Assunção de Nossa Senhora
    `${year}-12-08`, // Imaculada Conceição (Padroeira de BH)
  ];
  
  // Feriados móveis (Páscoa-based) - cálculo aproximado
  const calcularPascoa = (ano: number) => {
    const a = ano % 19;
    const b = Math.floor(ano / 100);
    const c = ano % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(ano, mes - 1, dia);
  };

  const pascoa = calcularPascoa(year);
  const carnaval = new Date(pascoa);
  carnaval.setDate(pascoa.getDate() - 47);
  const carnaval2 = new Date(pascoa);
  carnaval2.setDate(pascoa.getDate() - 46);
  const sextaSanta = new Date(pascoa);
  sextaSanta.setDate(pascoa.getDate() - 2);
  const corpusChristi = new Date(pascoa);
  corpusChristi.setDate(pascoa.getDate() + 60);

  const formatDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  
  feriados.push(
    formatDate(carnaval),      // Segunda de Carnaval
    formatDate(carnaval2),     // Terça de Carnaval
    formatDate(sextaSanta),    // Sexta-feira Santa
    formatDate(corpusChristi), // Corpus Christi
  );

  return feriados;
};

// Calculate business days in a month (excluding weekends and BH holidays)
const getBusinessDaysInMonth = (year: number, month: number): number => {
  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const feriadosBH = getFeriadosBH(year);
  let businessDays = 0;
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    if (!isWeekend(date) && !feriadosBH.includes(dateStr)) {
      businessDays++;
    }
  }
  return businessDays;
};

// Format hours as "Xh Ym"
const formatHoursMinutes = (totalHours: number): string => {
  const hours = Math.floor(totalHours);
  const minutes = Math.round((totalHours - hours) * 60);
  return `${hours}h${minutes.toString().padStart(2, '0')}m`;
};

export default function GestaoJornada() {
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const [funcionarioId, setFuncionarioId] = useState<string>("");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [endereco, setEndereco] = useState<string>("");
  const [alertasOpen, setAlertasOpen] = useState(false);
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [ano, setAno] = useState(new Date().getFullYear());

  // Check user permissions
  const canManageAll = userRole === "admin" || userRole === "superintendente" || userRole === "administrativo";
  const canExport = userRole === "admin" || userRole === "superintendente" || userRole === "administrativo";
  const isLimitedUser = userRole === "lider" || userRole === "comercial";

  // Fetch funcionários
  const { data: funcionarios } = useQuery({
    queryKey: ["funcionarios", user?.id, isLimitedUser],
    queryFn: async () => {
      let query = supabase
        .from("funcionarios")
        .select("*")
        .eq("ativo", true)
        .order("nome");
      
      // For lider/comercial, only show their own record
      if (isLimitedUser && user?.id) {
        query = query.eq("profile_id", user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Auto-select for limited users
  useEffect(() => {
    if (isLimitedUser && funcionarios?.length === 1 && !funcionarioId) {
      setFuncionarioId(funcionarios[0].id);
    }
  }, [isLimitedUser, funcionarios, funcionarioId]);

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

  // Fetch all records for export
  const { data: allRegistros } = useQuery({
    queryKey: ["all_registros_ponto", mes, ano],
    queryFn: async () => {
      const inicio = new Date(ano, mes - 1, 1).toISOString();
      const fim = new Date(ano, mes, 0, 23, 59, 59).toISOString();

      const { data, error } = await supabase
        .from("registros_ponto")
        .select("*, funcionarios(nome, cargo)")
        .gte("data_hora", inicio)
        .lte("data_hora", fim)
        .order("data_hora", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: canExport,
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

  const funcionarioSelecionado = funcionarios?.find((f) => f.id === funcionarioId);

  // Calculate detailed stats
  const detailedStats = useMemo(() => {
    if (!registros || !funcionarioSelecionado) return null;

    const businessDays = getBusinessDaysInMonth(ano, mes);
    const registrosPorDia: Record<string, any[]> = {};
    
    registros.forEach((r: any) => {
      const dia = format(new Date(r.data_hora), "yyyy-MM-dd");
      if (!registrosPorDia[dia]) registrosPorDia[dia] = [];
      registrosPorDia[dia].push(r);
    });

    const workedDays: Array<{
      date: string;
      dayName: string;
      hoursWorked: number;
      isLate: boolean;
      lateMinutes: number;
      entrada?: string;
      saida?: string;
    }> = [];

    let totalMinutesWorked = 0;
    let lateCount = 0;

    const expectedEntrada = funcionarioSelecionado.horario_entrada || "08:00";
    const [expectedHour, expectedMinute] = expectedEntrada.split(":").map(Number);

    Object.entries(registrosPorDia).forEach(([dia, regs]) => {
      const entrada = regs.find((r: any) => r.tipo === "entrada");
      const saida = regs.find((r: any) => r.tipo === "saida");
      const saidaAlmoco = regs.find((r: any) => r.tipo === "saida_almoco");
      const voltaAlmoco = regs.find((r: any) => r.tipo === "volta_almoco");

      let hoursWorked = 0;
      let isLate = false;
      let lateMinutes = 0;

      if (entrada) {
        const entradaDate = new Date(entrada.data_hora);
        const expectedDate = new Date(entradaDate);
        expectedDate.setHours(expectedHour, expectedMinute, 0, 0);
        
        const diffMinutes = differenceInMinutes(entradaDate, expectedDate);
        if (diffMinutes > 10) {
          isLate = true;
          lateMinutes = diffMinutes;
          lateCount++;
        }
      }

      if (entrada && saida) {
        const entradaTime = new Date(entrada.data_hora).getTime();
        const saidaTime = new Date(saida.data_hora).getTime();
        let almocoMinutes = 0;

        if (saidaAlmoco && voltaAlmoco) {
          const saidaAlmocoTime = new Date(saidaAlmoco.data_hora).getTime();
          const voltaAlmocoTime = new Date(voltaAlmoco.data_hora).getTime();
          almocoMinutes = (voltaAlmocoTime - saidaAlmocoTime) / (1000 * 60);
        }

        const totalMinutes = (saidaTime - entradaTime) / (1000 * 60) - almocoMinutes;
        hoursWorked = Math.max(0, totalMinutes / 60);
        totalMinutesWorked += totalMinutes;
      }

      workedDays.push({
        date: dia,
        dayName: format(parseISO(dia), "EEEE", { locale: ptBR }),
        hoursWorked,
        isLate,
        lateMinutes,
        entrada: entrada ? format(new Date(entrada.data_hora), "HH:mm") : undefined,
        saida: saida ? format(new Date(saida.data_hora), "HH:mm") : undefined,
      });
    });

    return {
      businessDays,
      workedDaysCount: workedDays.length,
      workedDays: workedDays.sort((a, b) => b.date.localeCompare(a.date)),
      totalHoursWorked: totalMinutesWorked / 60,
      lateCount,
    };
  }, [registros, funcionarioSelecionado, ano, mes]);

  // Agrupar registros por dia
  const registrosPorDia = registros?.reduce((acc: any, registro: any) => {
    const dia = format(new Date(registro.data_hora), "yyyy-MM-dd");
    if (!acc[dia]) acc[dia] = [];
    acc[dia].push(registro);
    return acc;
  }, {});

  // Export to PDF
  const exportToPDF = (individual: boolean) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Relatório de Ponto", 20, 20);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Período: ${format(new Date(ano, mes - 1), "MMMM 'de' yyyy", { locale: ptBR })}`, 20, 28);
    
    if (individual && funcionarioSelecionado) {
      doc.text(`Funcionário: ${funcionarioSelecionado.nome}`, 20, 34);
    }

    const dataToExport = individual ? registros : allRegistros;
    
    if (!dataToExport || dataToExport.length === 0) {
      doc.text("Nenhum registro encontrado", 20, 50);
    } else {
      const tableData = dataToExport.map((r: any) => [
        individual ? "" : (r.funcionarios?.nome || "N/A"),
        format(new Date(r.data_hora), "dd/MM/yyyy"),
        format(new Date(r.data_hora), "EEEE", { locale: ptBR }),
        format(new Date(r.data_hora), "HH:mm"),
        tiposPonto.find(t => t.value === r.tipo)?.label || r.tipo,
      ]);

      (doc as any).autoTable({
        startY: individual ? 40 : 40,
        head: [individual ? ["Data", "Dia", "Hora", "Tipo"] : ["Funcionário", "Data", "Dia", "Hora", "Tipo"]],
        body: individual ? tableData.map(row => row.slice(1)) : tableData,
        theme: "striped",
        headStyles: { fillColor: [102, 51, 153] },
      });
    }

    doc.save(`relatorio_ponto_${individual ? funcionarioSelecionado?.nome?.replace(/\s+/g, '_') : 'todos'}_${mes}_${ano}.pdf`);
    toast.success("PDF exportado com sucesso!");
  };

  // Export to Excel
  const exportToExcel = (individual: boolean) => {
    const dataToExport = individual ? registros : allRegistros;
    
    if (!dataToExport || dataToExport.length === 0) {
      toast.error("Nenhum registro para exportar");
      return;
    }

    const excelData = dataToExport.map((r: any) => ({
      Funcionário: individual ? funcionarioSelecionado?.nome : (r.funcionarios?.nome || "N/A"),
      Data: format(new Date(r.data_hora), "dd/MM/yyyy"),
      Dia: format(new Date(r.data_hora), "EEEE", { locale: ptBR }),
      Hora: format(new Date(r.data_hora), "HH:mm:ss"),
      Tipo: tiposPonto.find(t => t.value === r.tipo)?.label || r.tipo,
      Endereço: r.endereco_aproximado || "",
      Dispositivo: r.dispositivo || "",
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Registros de Ponto");
    XLSX.writeFile(wb, `relatorio_ponto_${individual ? funcionarioSelecionado?.nome?.replace(/\s+/g, '_') : 'todos'}_${mes}_${ano}.xlsx`);
    toast.success("Excel exportado com sucesso!");
  };

  // Enviar recibo de ponto por WhatsApp
  const enviarReciboWhatsApp = () => {
    if (!funcionarioSelecionado || todayRecords.length === 0) {
      toast.error("Nenhum registro de ponto hoje para enviar");
      return;
    }

    const registrosTexto = todayRecords
      .sort((a: any, b: any) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime())
      .map((r: any) => {
        const tipo = tiposPonto.find(t => t.value === r.tipo);
        return `• ${tipo?.label}: ${format(new Date(r.data_hora), "HH:mm")}`;
      })
      .join("\n");

    const mensagem = `*RECIBO DE PONTO*\n\nColaborador: ${funcionarioSelecionado.nome}\nData: ${format(new Date(), "dd/MM/yyyy")}\n\n${registrosTexto}\n\n_Registro gerado automaticamente pelo sistema._`;

    const phone = funcionarioSelecionado.telefone?.replace(/\D/g, "") || "";
    const whatsappUrl = phone 
      ? `https://web.whatsapp.com/send?phone=55${phone}&text=${encodeURIComponent(mensagem)}`
      : `https://web.whatsapp.com/send?text=${encodeURIComponent(mensagem)}`;
    
    window.open(whatsappUrl, "_blank");
    toast.success("Abrindo WhatsApp...");
  };

  // Enviar recibo de ponto por Email
  const enviarReciboEmail = () => {
    if (!funcionarioSelecionado || todayRecords.length === 0) {
      toast.error("Nenhum registro de ponto hoje para enviar");
      return;
    }

    const registrosTexto = todayRecords
      .sort((a: any, b: any) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime())
      .map((r: any) => {
        const tipo = tiposPonto.find(t => t.value === r.tipo);
        return `• ${tipo?.label}: ${format(new Date(r.data_hora), "HH:mm")}`;
      })
      .join("\n");

    const subject = `Recibo de Ponto - ${format(new Date(), "dd/MM/yyyy")} - ${funcionarioSelecionado.nome}`;
    const body = `RECIBO DE PONTO\n\nColaborador: ${funcionarioSelecionado.nome}\nData: ${format(new Date(), "dd/MM/yyyy")}\n\n${registrosTexto}\n\nRegistro gerado automaticamente pelo sistema.`;

    const mailtoUrl = `mailto:${funcionarioSelecionado.email || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl, "_blank");
    toast.success("Abrindo email...");
  };

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
            {isLimitedUser 
              ? "Registre e acompanhe sua jornada de trabalho"
              : "Registre e acompanhe a jornada de trabalho dos colaboradores"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 space-y-2">
              <Label>Funcionário</Label>
              <Select 
                value={funcionarioId} 
                onValueChange={setFuncionarioId}
                disabled={isLimitedUser && funcionarios?.length === 1}
              >
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
            {canManageAll && (
              <Button variant="outline" onClick={() => setAlertasOpen(true)} disabled={!funcionarioId}>
                <Bell className="h-4 w-4 mr-2" />
                Configurar Alertas
              </Button>
            )}
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
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">Últimos registros de hoje</h4>
                    {todayRecords.length > 0 && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={enviarReciboWhatsApp}
                          className="text-green-600 hover:text-green-700"
                        >
                          <MessageCircle className="h-4 w-4 mr-1" />
                          WhatsApp
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={enviarReciboEmail}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Mail className="h-4 w-4 mr-1" />
                          E-mail
                        </Button>
                      </div>
                    )}
                  </div>
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
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Histórico de Ponto
                  </CardTitle>
                  <div className="flex gap-2 flex-wrap">
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
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Dias Trabalhados</CardDescription>
                    <CardTitle className="text-2xl">{detailedStats?.workedDaysCount || 0}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Dias Úteis no Mês</CardDescription>
                    <CardTitle className="text-2xl">{detailedStats?.businessDays || 0}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Horas Trabalhadas</CardDescription>
                    <CardTitle className="text-2xl">{detailedStats ? formatHoursMinutes(detailedStats.totalHoursWorked) : "0h00m"}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Jornada Configurada</CardDescription>
                    <CardTitle className="text-2xl">
                      {funcionarioSelecionado?.carga_horaria_semanal || 44}h/sem
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className={detailedStats?.lateCount ? "border-red-200 bg-red-50/50 dark:bg-red-950/20" : ""}>
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Atrasos (+10min)
                    </CardDescription>
                    <CardTitle className={`text-2xl ${detailedStats?.lateCount ? "text-red-600" : ""}`}>
                      {detailedStats?.lateCount || 0}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              {/* Export Buttons */}
              {canExport && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Download className="h-5 w-5" />
                      Exportar Relatório
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => exportToPDF(true)}>
                        <FileText className="h-4 w-4 mr-2" />
                        PDF Individual
                      </Button>
                      <Button variant="outline" onClick={() => exportToExcel(true)}>
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Excel Individual
                      </Button>
                      <Button variant="outline" onClick={() => exportToPDF(false)}>
                        <FileText className="h-4 w-4 mr-2" />
                        PDF Todos
                      </Button>
                      <Button variant="outline" onClick={() => exportToExcel(false)}>
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Excel Todos
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Detailed Days List */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Dias Trabalhados</CardTitle>
                  <CardDescription>
                    Horário esperado: {funcionarioSelecionado?.horario_entrada || "08:00"} - {funcionarioSelecionado?.horario_saida || "18:00"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {detailedStats?.workedDays && detailedStats.workedDays.length > 0 ? (
                    <div className="space-y-2">
                      {detailedStats.workedDays.map((day) => (
                        <div 
                          key={day.date} 
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            day.isLate ? "border-red-200 bg-red-50/50 dark:bg-red-950/20" : "bg-muted/30"
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex flex-col">
                              <span className="font-medium capitalize">{day.dayName}</span>
                              <span className="text-sm text-muted-foreground">
                                {format(parseISO(day.date), "dd/MM/yyyy")}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <div className="text-right">
                              <span className="text-muted-foreground">Entrada: </span>
                              <span className="font-medium">{day.entrada || "-"}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-muted-foreground">Saída: </span>
                              <span className="font-medium">{day.saida || "-"}</span>
                            </div>
                            <div className="text-right min-w-[80px]">
                              <span className="font-medium">{formatHoursMinutes(day.hoursWorked)}</span>
                            </div>
                            {day.isLate && (
                              <Badge variant="destructive" className="text-xs">
                                +{day.lateMinutes}min
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-4">
                      Nenhum dia trabalhado registrado neste período
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Dialog de Alertas */}
      {canManageAll && (
        <ConfigurarAlertasDialog
          open={alertasOpen}
          onOpenChange={setAlertasOpen}
          funcionarioId={funcionarioId}
          funcionarioNome={funcionarioSelecionado?.nome}
        />
      )}
    </div>
  );
}
