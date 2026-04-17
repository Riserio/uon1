import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Plus,
  Pencil,
  Paperclip,
  Lock,
  Timer,
  TrendingUp,
  TrendingDown,
  BarChart3,
  CalendarDays,
  User,
  ChevronRight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format, parseISO, differenceInMinutes, getDaysInMonth, isWeekend } from "date-fns";
import { ptBR } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import ConfigurarAlertasDialog from "./ConfigurarAlertasDialog";
import AjusteManualPontoDialog from "./AjusteManualPontoDialog";
import AnexosPontoDialog from "./AnexosPontoDialog";
import FechamentoMensalDialog from "./FechamentoMensalDialog";
import { openWhatsApp } from "@/utils/whatsapp";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

const tiposPonto = [
  {
    value: "entrada",
    label: "Entrada",
    icon: LogIn,
    color: "text-emerald-600",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    gradient: "from-emerald-500/20 to-emerald-500/5",
  },
  {
    value: "saida_almoco",
    label: "Saída Almoço",
    icon: Coffee,
    color: "text-amber-600",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    gradient: "from-amber-500/20 to-amber-500/5",
  },
  {
    value: "volta_almoco",
    label: "Volta Almoço",
    icon: Coffee,
    color: "text-blue-600",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    gradient: "from-blue-500/20 to-blue-500/5",
  },
  {
    value: "saida",
    label: "Saída",
    icon: LogOut,
    color: "text-red-600",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    gradient: "from-red-500/20 to-red-500/5",
  },
];

const getFeriadosBH = (year: number): string[] => {
  const feriados = [
    `${year}-01-01`,
    `${year}-04-21`,
    `${year}-05-01`,
    `${year}-09-07`,
    `${year}-10-12`,
    `${year}-11-02`,
    `${year}-11-15`,
    `${year}-12-25`,
    `${year}-04-21`,
    `${year}-08-15`,
    `${year}-12-08`,
  ];
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
  const formatDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  feriados.push(formatDate(carnaval), formatDate(carnaval2), formatDate(sextaSanta), formatDate(corpusChristi));
  return feriados;
};

const getBusinessDaysInMonth = (year: number, month: number): number => {
  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const feriadosBH = getFeriadosBH(year);
  let businessDays = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!isWeekend(date) && !feriadosBH.includes(dateStr)) businessDays++;
  }
  return businessDays;
};

const formatHoursMinutes = (totalHours: number): string => {
  const totalMinutes = Math.round(totalHours * 60);
  const hours = Math.floor(Math.abs(totalMinutes) / 60);
  const minutes = Math.abs(totalMinutes) % 60;
  return `${hours}h${minutes.toString().padStart(2, "0")}m`;
};

const formatSaldoMinutos = (totalMinutes: number): string => {
  const sign = totalMinutes < 0 ? "-" : totalMinutes > 0 ? "+" : "";
  const abs = Math.abs(totalMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
};

export default function GestaoJornada() {
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const [funcionarioId, setFuncionarioId] = useState<string>("");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [endereco, setEndereco] = useState<string>("");
  const [alertasOpen, setAlertasOpen] = useState(false);
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [anexosOpen, setAnexosOpen] = useState(false);
  const [fechamentoOpen, setFechamentoOpen] = useState(false);
  const [registroParaAjuste, setRegistroParaAjuste] = useState<any>(null);
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [activeView, setActiveView] = useState<"registrar ponto" | "historico" | "relatorio">("registrar ponto");

  const canManageAll = userRole === "admin" || userRole === "superintendente" || userRole === "administrativo";
  const canExport = userRole === "admin" || userRole === "superintendente" || userRole === "administrativo";
  const isLimitedUser = userRole === "lider" || userRole === "comercial";

  const { data: funcionarios } = useQuery({
    queryKey: ["funcionarios", user?.id, isLimitedUser],
    queryFn: async () => {
      let query = supabase.from("funcionarios").select("*").eq("ativo", true).order("nome");
      if (isLimitedUser && user?.id) query = query.eq("profile_id", user.id);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (isLimitedUser && funcionarios?.length === 1 && !funcionarioId) {
      setFuncionarioId(funcionarios[0].id);
    }
  }, [isLimitedUser, funcionarios, funcionarioId]);

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

  const todayRecords = useMemo(() => {
    if (!registros) return [];
    const today = format(new Date(), "yyyy-MM-dd");
    return registros.filter((r: any) => format(new Date(r.data_hora), "yyyy-MM-dd") === today);
  }, [registros]);

  const registeredTypes = useMemo(() => new Set(todayRecords.map((r: any) => r.tipo)), [todayRecords]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setLocation({ lat, lng });
          try {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
            );
            const data = await response.json();
            if (data.display_name) setEndereco(data.display_name.split(",").slice(0, 3).join(","));
          } catch (err) {
            console.error("Erro ao obter endereço:", err);
          }
        },
        (error) => {
          console.error("Erro ao obter localização:", error);
          toast.error("Não foi possível obter sua localização");
        },
      );
    }
  }, []);

  const registrarPonto = useMutation({
    mutationFn: async (tipo: string) => {
      if (!funcionarioId) throw new Error("Selecione um funcionário");
      if (registeredTypes.has(tipo))
        throw new Error(`${tiposPonto.find((t) => t.value === tipo)?.label} já foi registrado(a) hoje`);
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

  const detailedStats = useMemo(() => {
    if (!registros || !funcionarioSelecionado) return null;
    const businessDays = getBusinessDaysInMonth(ano, mes);
    const registrosPorDia: Record<string, any[]> = {};
    registros.forEach((r: any) => {
      const dia = format(new Date(r.data_hora), "yyyy-MM-dd");
      if (!registrosPorDia[dia]) registrosPorDia[dia] = [];
      registrosPorDia[dia].push(r);
    });
    const tolerancia = funcionarioSelecionado.tolerancia_atraso_minutos ?? 10;
    const workedDays: Array<{
      date: string;
      dayName: string;
      hoursWorked: number;
      expectedMinutes: number;
      isLate: boolean;
      lateMinutes: number;
      lateMinutesDiscounted: number;
      hasOvertime: boolean;
      overtimeMinutes: number;
      saldoMinutos: number;
      entrada?: string;
      saidaAlmoco?: string;
      voltaAlmoco?: string;
      saida?: string;
      almocoMinutes: number;
      almocoRegistrado: boolean;
    }> = [];
    let totalMinutesWorked = 0;
    let lateCount = 0;
    let overtimeCount = 0;
    let totalOvertimeMinutes = 0;
    let totalLateDiscountedMinutes = 0;
    let totalSaldoMinutos = 0;
    const expectedEntrada = funcionarioSelecionado.horario_entrada || "08:00";
    const expectedSaida = funcionarioSelecionado.horario_saida || "18:00";
    const almocoInicio = funcionarioSelecionado.horario_almoco_inicio || "12:00";
    const almocoFim = funcionarioSelecionado.horario_almoco_fim || "13:00";
    const [expectedHour, expectedMinute] = expectedEntrada.split(":").map(Number);
    const [expectedSaidaHour, expectedSaidaMinute] = expectedSaida.split(":").map(Number);
    const [almocoInicioHour, almocoInicioMinute] = almocoInicio.split(":").map(Number);
    const [almocoFimHour, almocoFimMinute] = almocoFim.split(":").map(Number);
    const defaultAlmocoMinutes = almocoFimHour * 60 + almocoFimMinute - (almocoInicioHour * 60 + almocoInicioMinute);
    const expectedDayMinutes =
      (expectedSaidaHour * 60 + expectedSaidaMinute) - (expectedHour * 60 + expectedMinute) - defaultAlmocoMinutes;

    Object.entries(registrosPorDia).forEach(([dia, regs]) => {
      const entrada = regs.find((r: any) => r.tipo === "entrada");
      const saida = regs.find((r: any) => r.tipo === "saida");
      const saidaAlmoco = regs.find((r: any) => r.tipo === "saida_almoco");
      const voltaAlmoco = regs.find((r: any) => r.tipo === "volta_almoco");
      let hoursWorked = 0,
        isLate = false,
        lateMinutes = 0,
        lateMinutesDiscounted = 0,
        hasOvertime = false,
        overtimeMinutes = 0;
      let almocoMinutes = defaultAlmocoMinutes,
        almocoRegistrado = false;

      if (entrada) {
        const entradaDate = new Date(entrada.data_hora);
        const expectedDate = new Date(entradaDate);
        expectedDate.setHours(expectedHour, expectedMinute, 0, 0);
        const diffMinutes = differenceInMinutes(entradaDate, expectedDate);
        if (diffMinutes > tolerancia) {
          isLate = true;
          lateMinutes = diffMinutes;
          // Desconta apenas o que excede a tolerância (CLT: até 10min é "perdoado")
          lateMinutesDiscounted = diffMinutes - tolerancia;
          totalLateDiscountedMinutes += lateMinutesDiscounted;
          lateCount++;
        }
      }
      if (saida) {
        const saidaDate = new Date(saida.data_hora);
        const expectedSaidaDate = new Date(saidaDate);
        expectedSaidaDate.setHours(expectedSaidaHour, expectedSaidaMinute, 0, 0);
        const diffMinutesSaida = differenceInMinutes(saidaDate, expectedSaidaDate);
        if (diffMinutesSaida > tolerancia) {
          hasOvertime = true;
          overtimeMinutes = diffMinutesSaida - tolerancia;
          overtimeCount++;
          totalOvertimeMinutes += overtimeMinutes;
        }
      }
      if (entrada && saida) {
        const entradaTime = new Date(entrada.data_hora).getTime();
        const saidaTime = new Date(saida.data_hora).getTime();
        if (saidaAlmoco && voltaAlmoco) {
          almocoMinutes =
            (new Date(voltaAlmoco.data_hora).getTime() - new Date(saidaAlmoco.data_hora).getTime()) / (1000 * 60);
          almocoRegistrado = true;
        }
        const totalMinutes = (saidaTime - entradaTime) / (1000 * 60) - almocoMinutes;
        hoursWorked = Math.max(0, totalMinutes / 60);
        totalMinutesWorked += totalMinutes;
      }
      // Saldo do dia = horas trabalhadas - horas esperadas (em minutos)
      const workedMinutesDay = hoursWorked * 60;
      const saldoMinutos = entrada && saida ? Math.round(workedMinutesDay - expectedDayMinutes) : 0;
      totalSaldoMinutos += saldoMinutos;

      workedDays.push({
        date: dia,
        dayName: format(parseISO(dia), "EEEE", { locale: ptBR }),
        hoursWorked,
        expectedMinutes: expectedDayMinutes,
        isLate,
        lateMinutes,
        lateMinutesDiscounted,
        hasOvertime,
        overtimeMinutes,
        saldoMinutos,
        entrada: entrada ? format(new Date(entrada.data_hora), "HH:mm") : undefined,
        saidaAlmoco: saidaAlmoco ? format(new Date(saidaAlmoco.data_hora), "HH:mm") : undefined,
        voltaAlmoco: voltaAlmoco ? format(new Date(voltaAlmoco.data_hora), "HH:mm") : undefined,
        saida: saida ? format(new Date(saida.data_hora), "HH:mm") : undefined,
        almocoMinutes,
        almocoRegistrado,
      });
    });
    return {
      businessDays,
      workedDaysCount: workedDays.length,
      workedDays: workedDays.sort((a, b) => b.date.localeCompare(a.date)),
      totalHoursWorked: totalMinutesWorked / 60,
      lateCount,
      overtimeCount,
      totalOvertimeMinutes,
      totalLateDiscountedMinutes,
      totalSaldoMinutos,
      tolerancia,
    };
  }, [registros, funcionarioSelecionado, ano, mes]);

  const registrosPorDia = registros?.reduce((acc: any, registro: any) => {
    const dia = format(new Date(registro.data_hora), "yyyy-MM-dd");
    if (!acc[dia]) acc[dia] = [];
    acc[dia].push(registro);
    return acc;
  }, {});

  // Export functions — Espelho de ponto estilo Sólides (individual)
  const exportToPDF = (individual: boolean) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const periodLabel = format(new Date(ano, mes - 1), "MMMM 'de' yyyy", { locale: ptBR });

    // Cabeçalho
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Espelho de Ponto", 14, 18);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Período: ${periodLabel}`, 14, 25);

    if (individual && funcionarioSelecionado) {
      doc.text(`Funcionário: ${funcionarioSelecionado.nome}`, 14, 31);
      doc.text(
        `Cargo: ${funcionarioSelecionado.cargo || "-"} • Jornada: ${funcionarioSelecionado.carga_horaria_semanal || 44}h/sem • Tolerância: ${detailedStats?.tolerancia ?? 10}min`,
        14,
        37,
      );
    }

    if (individual && detailedStats && detailedStats.workedDays.length > 0) {
      // Tabela diária com saldo
      const days = [...detailedStats.workedDays].sort((a, b) => a.date.localeCompare(b.date));
      const body = days.map((d) => [
        format(parseISO(d.date), "dd/MM"),
        format(parseISO(d.date), "EEE", { locale: ptBR }),
        d.entrada || "--:--",
        d.saidaAlmoco || "--:--",
        d.voltaAlmoco || "--:--",
        d.saida || "--:--",
        formatHoursMinutes(d.hoursWorked),
        formatSaldoMinutos(d.saldoMinutos),
      ]);

      autoTable(doc, {
        startY: 44,
        head: [["Data", "Dia", "Entrada", "S.Almoço", "V.Almoço", "Saída", "Trabalhado", "Saldo"]],
        body,
        theme: "striped",
        styles: { fontSize: 8, halign: "center" },
        headStyles: { fillColor: [102, 51, 153], textColor: 255, fontStyle: "bold" },
        columnStyles: {
          7: { fontStyle: "bold" },
        },
        didParseCell: (data: any) => {
          if (data.section === "body" && data.column.index === 7) {
            const txt = data.cell.raw as string;
            if (txt?.startsWith("-")) data.cell.styles.textColor = [220, 38, 38];
            else if (txt?.startsWith("+")) data.cell.styles.textColor = [22, 163, 74];
          }
        },
      });

      // Resumo do mês
      const finalY = (doc as any).lastAutoTable.finalY + 8;
      const saldo = detailedStats.totalSaldoMinutos;
      const extras = detailedStats.totalOvertimeMinutes;
      const atrasos = detailedStats.totalLateDiscountedMinutes;

      autoTable(doc, {
        startY: finalY,
        head: [["Resumo do Mês", "Valor"]],
        body: [
          ["Dias trabalhados", `${detailedStats.workedDaysCount} de ${detailedStats.businessDays}`],
          ["Horas trabalhadas", formatHoursMinutes(detailedStats.totalHoursWorked)],
          ["Horas extras", `+${formatSaldoMinutos(extras).replace("+", "")}`],
          ["Atrasos descontados", `-${formatSaldoMinutos(atrasos).replace(/[+-]/, "")}`],
          [
            { content: "Saldo do mês", styles: { fontStyle: "bold" } },
            {
              content: formatSaldoMinutos(saldo),
              styles: {
                fontStyle: "bold",
                textColor: saldo < 0 ? [220, 38, 38] : saldo > 0 ? [22, 163, 74] : [60, 60, 60],
              },
            },
          ],
        ],
        theme: "grid",
        styles: { fontSize: 9 },
        headStyles: { fillColor: [241, 245, 249], textColor: [30, 30, 30], fontStyle: "bold" },
        columnStyles: { 0: { cellWidth: 80 }, 1: { halign: "right" } },
      });

      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(
        `Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
        14,
        doc.internal.pageSize.getHeight() - 10,
      );
    } else {
      // Modo "todos os funcionários" ou sem dados consolidados — fallback registros brutos
      const dataToExport = individual ? registros : allRegistros;
      if (!dataToExport || dataToExport.length === 0) {
        doc.text("Nenhum registro encontrado", 14, 50);
      } else {
        const tableData = dataToExport.map((r: any) => [
          individual ? "" : r.funcionarios?.nome || "N/A",
          format(new Date(r.data_hora), "dd/MM/yyyy"),
          format(new Date(r.data_hora), "EEEE", { locale: ptBR }),
          format(new Date(r.data_hora), "HH:mm"),
          tiposPonto.find((t) => t.value === r.tipo)?.label || r.tipo,
        ]);
        autoTable(doc, {
          startY: 44,
          head: [individual ? ["Data", "Dia", "Hora", "Tipo"] : ["Funcionário", "Data", "Dia", "Hora", "Tipo"]],
          body: individual ? tableData.map((row) => row.slice(1)) : tableData,
          theme: "striped",
          styles: { fontSize: 8 },
          headStyles: { fillColor: [102, 51, 153] },
        });
      }
    }

    doc.save(
      `espelho_ponto_${individual ? funcionarioSelecionado?.nome?.replace(/\s+/g, "_") : "todos"}_${mes}_${ano}.pdf`,
    );
    toast.success("PDF exportado com sucesso!");
  };

  const exportToExcel = (individual: boolean) => {
    if (individual && detailedStats && detailedStats.workedDays.length > 0) {
      // Espelho de ponto detalhado por dia
      const days = [...detailedStats.workedDays].sort((a, b) => a.date.localeCompare(b.date));
      const excelData = days.map((d) => ({
        Data: format(parseISO(d.date), "dd/MM/yyyy"),
        Dia: format(parseISO(d.date), "EEEE", { locale: ptBR }),
        Entrada: d.entrada || "",
        "Saída Almoço": d.saidaAlmoco || "",
        "Volta Almoço": d.voltaAlmoco || "",
        Saída: d.saida || "",
        "Horas Trabalhadas": formatHoursMinutes(d.hoursWorked),
        "Atraso (min)": d.lateMinutesDiscounted || 0,
        "Hora Extra (min)": d.overtimeMinutes || 0,
        "Saldo do dia": formatSaldoMinutos(d.saldoMinutos),
      }));
      // Linha de totais
      excelData.push({
        Data: "TOTAIS",
        Dia: "",
        Entrada: "",
        "Saída Almoço": "",
        "Volta Almoço": "",
        Saída: "",
        "Horas Trabalhadas": formatHoursMinutes(detailedStats.totalHoursWorked),
        "Atraso (min)": detailedStats.totalLateDiscountedMinutes,
        "Hora Extra (min)": detailedStats.totalOvertimeMinutes,
        "Saldo do dia": formatSaldoMinutos(detailedStats.totalSaldoMinutos),
      } as any);

      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Espelho de Ponto");
      XLSX.writeFile(
        wb,
        `espelho_ponto_${funcionarioSelecionado?.nome?.replace(/\s+/g, "_")}_${mes}_${ano}.xlsx`,
      );
      toast.success("Excel exportado com sucesso!");
      return;
    }

    const dataToExport = individual ? registros : allRegistros;
    if (!dataToExport || dataToExport.length === 0) {
      toast.error("Nenhum registro para exportar");
      return;
    }
    const excelData = dataToExport.map((r: any) => ({
      Funcionário: individual ? funcionarioSelecionado?.nome : r.funcionarios?.nome || "N/A",
      Data: format(new Date(r.data_hora), "dd/MM/yyyy"),
      Dia: format(new Date(r.data_hora), "EEEE", { locale: ptBR }),
      Hora: format(new Date(r.data_hora), "HH:mm:ss"),
      Tipo: tiposPonto.find((t) => t.value === r.tipo)?.label || r.tipo,
      Endereço: r.endereco_aproximado || "",
      Dispositivo: r.dispositivo || "",
    }));
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Registros de Ponto");
    XLSX.writeFile(
      wb,
      `relatorio_ponto_${individual ? funcionarioSelecionado?.nome?.replace(/\s+/g, "_") : "todos"}_${mes}_${ano}.xlsx`,
    );
    toast.success("Excel exportado com sucesso!");
  };

  const gerarProtocolo = () => {
    const now = new Date();
    return `REC${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, "0")}${now.getDate().toString().padStart(2, "0")}${now.getHours().toString().padStart(2, "0")}${now.getMinutes().toString().padStart(2, "0")}${Math.floor(
      Math.random() * 1000,
    )
      .toString()
      .padStart(3, "0")}`;
  };

  const baixarReciboPDF = () => {
    if (!funcionarioSelecionado || todayRecords.length === 0) {
      toast.error("Nenhum registro de ponto hoje para baixar");
      return;
    }
    const protocolo = gerarProtocolo();
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let yPosition = margin;
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text("RECIBO DE PONTO", pageWidth / 2, yPosition, { align: "center" });
    yPosition += 10;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Protocolo: ${protocolo}`, pageWidth / 2, yPosition, { align: "center" });
    yPosition += 15;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 10;
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    doc.setFont("helvetica", "bold");
    doc.text("Colaborador:", margin, yPosition);
    doc.setFont("helvetica", "normal");
    doc.text(funcionarioSelecionado.nome, margin + 35, yPosition);
    yPosition += 7;
    doc.setFont("helvetica", "bold");
    doc.text("Cargo:", margin, yPosition);
    doc.setFont("helvetica", "normal");
    doc.text(funcionarioSelecionado.cargo || "Não informado", margin + 20, yPosition);
    yPosition += 7;
    doc.setFont("helvetica", "bold");
    doc.text("Data:", margin, yPosition);
    doc.setFont("helvetica", "normal");
    doc.text(format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR }), margin + 15, yPosition);
    yPosition += 15;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 10;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text("Registros do Dia", margin, yPosition);
    yPosition += 10;
    todayRecords
      .sort((a: any, b: any) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime())
      .forEach((registro: any) => {
        const tipo = tiposPonto.find((t) => t.value === registro.tipo);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(`${tipo?.label || registro.tipo}:`, margin + 5, yPosition);
        doc.setFont("helvetica", "normal");
        doc.text(format(new Date(registro.data_hora), "HH:mm:ss"), margin + 45, yPosition);
        if (registro.endereco) {
          yPosition += 5;
          doc.setFontSize(8);
          doc.setTextColor(100, 100, 100);
          doc.text(`📍 ${registro.endereco.substring(0, 60)}`, margin + 5, yPosition);
          doc.setTextColor(60, 60, 60);
        }
        yPosition += 8;
      });
    yPosition += 10;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 8;
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Documento gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}`,
      margin,
      yPosition,
    );
    yPosition += 4;
    doc.text("Este é um recibo eletrônico gerado automaticamente pelo sistema.", margin, yPosition);
    doc.save(
      `recibo_ponto_${funcionarioSelecionado.nome.replace(/\s+/g, "_")}_${format(new Date(), "yyyy-MM-dd")}.pdf`,
    );
    toast.success(`Recibo baixado! Protocolo: ${protocolo}`);
  };

  const enviarReciboWhatsApp = () => {
    if (!funcionarioSelecionado || todayRecords.length === 0) {
      toast.error("Nenhum registro de ponto hoje para enviar");
      return;
    }
    const protocolo = gerarProtocolo();
    const registrosTexto = todayRecords
      .sort((a: any, b: any) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime())
      .map(
        (r: any) => `• ${tiposPonto.find((t) => t.value === r.tipo)?.label}: ${format(new Date(r.data_hora), "HH:mm")}`,
      )
      .join("\n");
    openWhatsApp({
      phone: funcionarioSelecionado.telefone,
      message: `*RECIBO DE PONTO*\n📋 Protocolo: ${protocolo}\n\nColaborador: ${funcionarioSelecionado.nome}\nData: ${format(new Date(), "dd/MM/yyyy")}\n\n${registrosTexto}\n\n_Registro gerado automaticamente pelo sistema._`,
    });
    toast.success(`Abrindo WhatsApp... Protocolo: ${protocolo}`);
  };

  const enviarReciboEmail = () => {
    if (!funcionarioSelecionado || todayRecords.length === 0) {
      toast.error("Nenhum registro de ponto hoje para enviar");
      return;
    }
    const protocolo = gerarProtocolo();
    const registrosTexto = todayRecords
      .sort((a: any, b: any) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime())
      .map(
        (r: any) => `• ${tiposPonto.find((t) => t.value === r.tipo)?.label}: ${format(new Date(r.data_hora), "HH:mm")}`,
      )
      .join("\n");
    window.open(
      `mailto:${funcionarioSelecionado.email || ""}?subject=${encodeURIComponent(`Recibo de Ponto - ${format(new Date(), "dd/MM/yyyy")} - ${funcionarioSelecionado.nome} - Protocolo: ${protocolo}`)}&body=${encodeURIComponent(`RECIBO DE PONTO\n\n📋 Protocolo: ${protocolo}\n\nColaborador: ${funcionarioSelecionado.nome}\nData: ${format(new Date(), "dd/MM/yyyy")}\n\n${registrosTexto}\n\nRegistro gerado automaticamente pelo sistema.`)}`,
      "_blank",
    );
    toast.success(`Abrindo email... Protocolo: ${protocolo}`);
  };

  // Calculate expected hours for the month
  const expectedMonthlyHours = useMemo(() => {
    if (!funcionarioSelecionado) return 0;
    const weeklyHours = funcionarioSelecionado.carga_horaria_semanal || 44;
    const dailyHours = weeklyHours / 5;
    const businessDays = getBusinessDaysInMonth(ano, mes);
    return dailyHours * businessDays;
  }, [funcionarioSelecionado, ano, mes]);

  const hoursProgress = useMemo(() => {
    if (!detailedStats || expectedMonthlyHours === 0) return 0;
    return Math.min(100, (detailedStats.totalHoursWorked / expectedMonthlyHours) * 100);
  }, [detailedStats, expectedMonthlyHours]);

  // Navigation tabs
  const views = [
    { id: "registrar ponto" as const, label: "Registrar Ponto", icon: BarChart3 },
    { id: "historico" as const, label: "Histórico", icon: Calendar },
    { id: "relatorio" as const, label: "Relatório", icon: FileText },
  ];

  return (
    <div className="space-y-6">
      {/* Header with Employee Selector */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end justify-between">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Timer className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Controle de Jornada</h2>
            <p className="text-xs text-muted-foreground">
              {isLimitedUser ? "Registre e acompanhe sua jornada" : "Gerencie a jornada dos colaboradores"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={funcionarioId}
            onValueChange={setFuncionarioId}
            disabled={isLimitedUser && funcionarios?.length === 1}
          >
            <SelectTrigger className="w-[220px]">
              <User className="h-4 w-4 mr-2 text-muted-foreground" />
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
          {canManageAll && funcionarioId && (
            <div className="flex gap-1.5">
              <Button variant="outline" size="icon" onClick={() => setAnexosOpen(true)} title="Anexos">
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setRegistroParaAjuste(null);
                  setAjusteOpen(true);
                }}
                title="Ajuste Manual"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setFechamentoOpen(true)} title="Fechamento">
                <Lock className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setAlertasOpen(true)} title="Alertas">
                <Bell className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {funcionarioId && (
        <>
          {/* View navigation pills */}
          <div className="flex gap-1 p-1 rounded-xl bg-muted/50 w-fit">
            {views.map((view) => {
              const Icon = view.icon;
              return (
                <button
                  key={view.id}
                  onClick={() => setActiveView(view.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    activeView === view.id
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {view.label}
                </button>
              );
            })}
          </div>

          {/* REGISTRAR PONTO VIEW */}
          {activeView === "registrar ponto" && (
            <div className="space-y-6">
              {/* Clock-in buttons */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {tiposPonto.map((tipo) => {
                  const Icon = tipo.icon;
                  const isRegistered = registeredTypes.has(tipo.value);
                  return (
                    <button
                      key={tipo.value}
                      onClick={() => registrarPonto.mutate(tipo.value)}
                      disabled={registrarPonto.isPending || isRegistered}
                      className={cn(
                        "relative overflow-hidden rounded-2xl border p-5 text-left transition-all duration-200",
                        isRegistered
                          ? "opacity-60 cursor-not-allowed border-border/50 bg-muted/30"
                          : `${tipo.border} hover:shadow-md hover:scale-[1.02] active:scale-[0.98] bg-gradient-to-br ${tipo.gradient}`,
                      )}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", tipo.bg)}>
                          <Icon className={cn("h-5 w-5", tipo.color)} />
                        </div>
                        {isRegistered && (
                          <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                            Registrado
                          </Badge>
                        )}
                      </div>
                      <p className="font-semibold text-sm">{tipo.label}</p>
                      {isRegistered && todayRecords.find((r: any) => r.tipo === tipo.value) && (
                        <p className="text-xs text-muted-foreground mt-1">
                          às{" "}
                          {format(new Date(todayRecords.find((r: any) => r.tipo === tipo.value)!.data_hora), "HH:mm")}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Location + receipt row */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs">
                  {location ? (
                    <span className="flex items-center gap-1.5 text-emerald-600 bg-emerald-500/10 px-3 py-1.5 rounded-full">
                      <MapPin className="h-3.5 w-3.5" />
                      {endereco || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-amber-600 bg-amber-500/10 px-3 py-1.5 rounded-full">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Obtendo localização...
                    </span>
                  )}
                </div>
                {todayRecords.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <FileText className="h-4 w-4" />
                        Recibo
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={enviarReciboWhatsApp}>
                        <MessageCircle className="h-4 w-4 mr-2 text-emerald-600" />
                        WhatsApp
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={enviarReciboEmail}>
                        <Mail className="h-4 w-4 mr-2 text-blue-600" />
                        E-mail
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={baixarReciboPDF}>
                        <Download className="h-4 w-4 mr-2 text-purple-600" />
                        PDF
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* KPI cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card className="rounded-2xl border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <CalendarDays className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground font-medium">Dias Trabalhados</p>
                        <p className="text-xl font-bold leading-tight">
                          {detailedStats?.workedDaysCount || 0}
                          <span className="text-sm font-normal text-muted-foreground">
                            /{detailedStats?.businessDays || 0}
                          </span>
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                        <Clock className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground font-medium">Horas Trabalhadas</p>
                        <p className="text-xl font-bold leading-tight">
                          {detailedStats ? formatHoursMinutes(detailedStats.totalHoursWorked) : "0h00m"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card
                  className={cn(
                    "rounded-2xl",
                    detailedStats?.lateCount ? "border-red-200 dark:border-red-800" : "border-border/50",
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
                          detailedStats?.lateCount ? "bg-red-500/10" : "bg-muted",
                        )}
                      >
                        <TrendingDown
                          className={cn("h-4 w-4", detailedStats?.lateCount ? "text-red-600" : "text-muted-foreground")}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground font-medium">Atrasos (+10min)</p>
                        <p
                          className={cn(
                            "text-xl font-bold leading-tight",
                            detailedStats?.lateCount ? "text-red-600" : "",
                          )}
                        >
                          {detailedStats?.lateCount || 0}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card
                  className={cn(
                    "rounded-2xl",
                    detailedStats?.overtimeCount ? "border-emerald-200 dark:border-emerald-800" : "border-border/50",
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
                          detailedStats?.overtimeCount ? "bg-emerald-500/10" : "bg-muted",
                        )}
                      >
                        <TrendingUp
                          className={cn(
                            "h-4 w-4",
                            detailedStats?.overtimeCount ? "text-emerald-600" : "text-muted-foreground",
                          )}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground font-medium">Horas Extras</p>
                        <p
                          className={cn(
                            "text-xl font-bold leading-tight",
                            detailedStats?.overtimeCount ? "text-emerald-600" : "",
                          )}
                        >
                          {detailedStats?.totalOvertimeMinutes
                            ? formatHoursMinutes(detailedStats.totalOvertimeMinutes / 60)
                            : "0h00m"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Hours progress bar */}
              <Card className="rounded-2xl border-border/50">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold">Progresso Mensal</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(ano, mes - 1), "MMMM yyyy", { locale: ptBR })} • Jornada:{" "}
                        {funcionarioSelecionado?.carga_horaria_semanal || 44}h/sem
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">
                        {detailedStats ? formatHoursMinutes(detailedStats.totalHoursWorked) : "0h00m"}
                      </p>
                      <p className="text-xs text-muted-foreground">de {formatHoursMinutes(expectedMonthlyHours)}</p>
                    </div>
                  </div>
                  <Progress value={hoursProgress} className="h-2.5" />
                  <p className="text-xs text-muted-foreground mt-2">
                    {hoursProgress.toFixed(0)}% concluído
                    {expectedMonthlyHours - (detailedStats?.totalHoursWorked || 0) > 0 &&
                      ` • ${formatHoursMinutes(expectedMonthlyHours - (detailedStats?.totalHoursWorked || 0))} restantes`}
                  </p>
                </CardContent>
              </Card>

              {/* Today's timeline */}
              <Card className="rounded-2xl border-border/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold">Registros de Hoje</CardTitle>
                      <CardDescription className="text-xs">
                        {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {todayRecords.length} registro(s)
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {todayRecords.length === 0 ? (
                    <div className="text-center py-6">
                      <Clock className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Nenhum registro hoje</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {todayRecords
                        .sort((a: any, b: any) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime())
                        .map((registro: any, idx: number) => {
                          const tipo = tiposPonto.find((t) => t.value === registro.tipo);
                          const Icon = tipo?.icon || Clock;
                          return (
                            <div
                              key={registro.id}
                              className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/40 transition-colors"
                            >
                              <div className="flex flex-col items-center">
                                <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", tipo?.bg)}>
                                  <Icon className={cn("h-4 w-4", tipo?.color)} />
                                </div>
                                {idx < todayRecords.length - 1 && <div className="w-px h-4 bg-border mt-1" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{tipo?.label}</p>
                                {registro.endereco_aproximado && (
                                  <p className="text-[11px] text-muted-foreground truncate">
                                    📍 {registro.endereco_aproximado}
                                  </p>
                                )}
                              </div>
                              <span className="text-sm font-mono font-medium text-muted-foreground">
                                {format(new Date(registro.data_hora), "HH:mm")}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Period selector + last days */}
              <Card className="rounded-2xl border-border/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <CardTitle className="text-sm font-semibold">Últimos Dias Trabalhados</CardTitle>
                    <div className="flex gap-2">
                      <Select value={mes.toString()} onValueChange={(v) => setMes(parseInt(v))}>
                        <SelectTrigger className="w-[130px] h-8 text-xs">
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
                        <SelectTrigger className="w-[80px] h-8 text-xs">
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
                <CardContent className="pt-0">
                  {detailedStats?.workedDays && detailedStats.workedDays.length > 0 ? (
                    <div className="space-y-1.5">
                      {detailedStats.workedDays.slice(0, 7).map((day) => (
                        <div
                          key={day.date}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-xl transition-colors",
                            day.isLate
                              ? "bg-red-500/5 border border-red-200/50 dark:border-red-800/50"
                              : day.hasOvertime
                                ? "bg-emerald-500/5 border border-emerald-200/50 dark:border-emerald-800/50"
                                : "bg-muted/30 hover:bg-muted/50",
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex flex-col items-center shrink-0 w-10">
                              <span className="text-lg font-bold leading-none">{format(parseISO(day.date), "dd")}</span>
                              <span className="text-[10px] text-muted-foreground uppercase">
                                {format(parseISO(day.date), "EEE", { locale: ptBR })}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs flex-wrap">
                              <span className="font-mono">
                                <span className="text-muted-foreground">E:</span> {day.entrada || "-"}
                              </span>
                              <span className="font-mono">
                                <span className="text-muted-foreground">S:</span> {day.saida || "-"}
                              </span>
                              <span className="font-mono">
                                <span className="text-muted-foreground">Alm:</span>{" "}
                                {formatHoursMinutes(day.almocoMinutes / 60)}
                                {!day.almocoRegistrado && (
                                  <span className="text-muted-foreground/50 text-[10px] ml-0.5">•</span>
                                )}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-semibold">{formatHoursMinutes(day.hoursWorked)}</span>
                            {day.isLate && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                -{day.lateMinutesDiscounted}min
                              </Badge>
                            )}
                            {day.hasOvertime && (
                              <Badge className="text-[10px] px-1.5 py-0 bg-emerald-600">
                                +{day.overtimeMinutes}min
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                      {detailedStats.workedDays.length > 7 && (
                        <button
                          onClick={() => setActiveView("historico")}
                          className="w-full text-center text-xs text-primary font-medium py-2 hover:underline flex items-center justify-center gap-1"
                        >
                          Ver todos os {detailedStats.workedDays.length} dias <ChevronRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground text-sm py-6">
                      Nenhum dia trabalhado neste período
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* HISTORICO VIEW */}
          {activeView === "historico" && (
            <Card className="rounded-2xl border-border/50">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      Histórico de Ponto
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      Horário esperado: {funcionarioSelecionado?.horario_entrada || "08:00"} -{" "}
                      {funcionarioSelecionado?.horario_saida || "18:00"}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Select value={mes.toString()} onValueChange={(v) => setMes(parseInt(v))}>
                      <SelectTrigger className="w-[130px] h-8 text-xs">
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
                      <SelectTrigger className="w-[80px] h-8 text-xs">
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
                  <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
                ) : Object.keys(registrosPorDia || {}).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">Nenhum registro encontrado</div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(registrosPorDia || {})
                      .sort((a, b) => b[0].localeCompare(a[0]))
                      .map(([dia, regs]: [string, any]) => (
                        <div
                          key={dia}
                          className="rounded-xl border border-border/50 p-4 hover:bg-muted/20 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="flex flex-col items-center w-10">
                                <span className="text-lg font-bold leading-none">{format(parseISO(dia), "dd")}</span>
                                <span className="text-[10px] text-muted-foreground uppercase">
                                  {format(parseISO(dia), "EEE", { locale: ptBR })}
                                </span>
                              </div>
                              <span className="text-sm text-muted-foreground capitalize">
                                {format(parseISO(dia), "MMMM", { locale: ptBR })}
                              </span>
                            </div>
                            <Badge variant="secondary" className="text-[10px]">
                              {regs.length} registro(s)
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {regs
                              .sort(
                                (a: any, b: any) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime(),
                              )
                              .map((registro: any) => {
                                const tipo = tiposPonto.find((t) => t.value === registro.tipo);
                                const Icon = tipo?.icon || Clock;
                                return (
                                  <div
                                    key={registro.id}
                                    className={cn(
                                      "flex items-center justify-between p-2.5 rounded-lg text-sm",
                                      registro.ajustado ? "border border-amber-500/50 bg-amber-500/5" : "bg-muted/40",
                                    )}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <Icon className={cn("h-4 w-4 shrink-0", tipo?.color)} />
                                      <div className="flex flex-col min-w-0">
                                        <span className="font-medium text-xs">
                                          {format(new Date(registro.data_hora), "HH:mm")}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground truncate">
                                          {tipo?.label}
                                          {registro.ajustado && <span className="ml-1 text-amber-600">(ajustado)</span>}
                                        </span>
                                      </div>
                                    </div>
                                    {canManageAll && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 shrink-0"
                                        onClick={() => {
                                          setRegistroParaAjuste(registro);
                                          setAjusteOpen(true);
                                        }}
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                    )}
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
          )}

          {/* RELATORIO VIEW */}
          {activeView === "relatorio" && (
            <div className="space-y-4">
              {/* Banner de Saldo Mensal — destaque */}
              {detailedStats && (
                <Card
                  className={cn(
                    "rounded-2xl border-2",
                    detailedStats.totalSaldoMinutos < 0
                      ? "border-red-200 dark:border-red-800/60 bg-gradient-to-r from-red-500/5 to-transparent"
                      : detailedStats.totalSaldoMinutos > 0
                        ? "border-emerald-200 dark:border-emerald-800/60 bg-gradient-to-r from-emerald-500/5 to-transparent"
                        : "border-border/50",
                  )}
                >
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            "h-14 w-14 rounded-2xl flex items-center justify-center",
                            detailedStats.totalSaldoMinutos < 0
                              ? "bg-red-500/10"
                              : detailedStats.totalSaldoMinutos > 0
                                ? "bg-emerald-500/10"
                                : "bg-muted",
                          )}
                        >
                          {detailedStats.totalSaldoMinutos < 0 ? (
                            <TrendingDown className="h-7 w-7 text-red-600" />
                          ) : (
                            <TrendingUp className="h-7 w-7 text-emerald-600" />
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                            Saldo do Mês
                          </p>
                          <p
                            className={cn(
                              "text-3xl font-bold leading-tight",
                              detailedStats.totalSaldoMinutos < 0
                                ? "text-red-600"
                                : detailedStats.totalSaldoMinutos > 0
                                  ? "text-emerald-600"
                                  : "",
                            )}
                          >
                            {formatSaldoMinutos(detailedStats.totalSaldoMinutos)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            +{formatSaldoMinutos(detailedStats.totalOvertimeMinutes).replace("+", "")} extras • −
                            {formatSaldoMinutos(detailedStats.totalLateDiscountedMinutes).replace(/[+-]/, "")} atrasos
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-muted-foreground">Tolerância CLT aplicada</p>
                        <p className="text-sm font-semibold">{detailedStats.tolerancia} min/dia</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  {
                    label: "Dias Trabalhados",
                    value: detailedStats?.workedDaysCount || 0,
                    icon: CalendarDays,
                    color: "text-primary",
                    bg: "bg-primary/10",
                  },
                  {
                    label: "Dias Úteis",
                    value: detailedStats?.businessDays || 0,
                    icon: Calendar,
                    color: "text-blue-600",
                    bg: "bg-blue-500/10",
                  },
                  {
                    label: "Horas Trabalhadas",
                    value: detailedStats ? formatHoursMinutes(detailedStats.totalHoursWorked) : "0h00m",
                    icon: Clock,
                    color: "text-emerald-600",
                    bg: "bg-emerald-500/10",
                  },
                  {
                    label: "Jornada",
                    value: `${funcionarioSelecionado?.carga_horaria_semanal || 44}h/sem`,
                    icon: Timer,
                    color: "text-purple-600",
                    bg: "bg-purple-500/10",
                  },
                  {
                    label: `Atrasos (>${detailedStats?.tolerancia ?? 10}min)`,
                    value: detailedStats?.lateCount || 0,
                    icon: AlertCircle,
                    color: detailedStats?.lateCount ? "text-red-600" : "text-muted-foreground",
                    bg: detailedStats?.lateCount ? "bg-red-500/10" : "bg-muted",
                  },
                  {
                    label: "Horas Extras",
                    value: detailedStats?.totalOvertimeMinutes
                      ? formatHoursMinutes(detailedStats.totalOvertimeMinutes / 60)
                      : "0h00m",
                    icon: TrendingUp,
                    color: detailedStats?.overtimeCount ? "text-emerald-600" : "text-muted-foreground",
                    bg: detailedStats?.overtimeCount ? "bg-emerald-500/10" : "bg-muted",
                  },
                ].map((stat, i) => {
                  const Icon = stat.icon;
                  return (
                    <Card key={i} className="rounded-2xl border-border/50">
                      <CardContent className="p-4">
                        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center mb-2", stat.bg)}>
                          <Icon className={cn("h-4 w-4", stat.color)} />
                        </div>
                        <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                        <p className="text-lg font-bold">{stat.value}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Export Buttons */}
              {canExport && (
                <Card className="rounded-2xl border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-2">
                        <Download className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Exportar Relatório</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => exportToPDF(true)}
                          className="gap-1.5 text-xs"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          PDF Individual
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => exportToExcel(true)}
                          className="gap-1.5 text-xs"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                          Excel Individual
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => exportToPDF(false)}
                          className="gap-1.5 text-xs"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          PDF Todos
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => exportToExcel(false)}
                          className="gap-1.5 text-xs"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                          Excel Todos
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* All days */}
              <Card className="rounded-2xl border-border/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">Dias Trabalhados</CardTitle>
                    <div className="flex gap-2">
                      <Select value={mes.toString()} onValueChange={(v) => setMes(parseInt(v))}>
                        <SelectTrigger className="w-[130px] h-8 text-xs">
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
                        <SelectTrigger className="w-[80px] h-8 text-xs">
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
                <CardContent className="pt-0">
                  {detailedStats?.workedDays && detailedStats.workedDays.length > 0 ? (
                    <div className="space-y-1.5">
                      {detailedStats.workedDays.map((day) => (
                        <div
                          key={day.date}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-xl transition-colors",
                            day.isLate
                              ? "bg-red-500/5 border border-red-200/50 dark:border-red-800/50"
                              : day.hasOvertime
                                ? "bg-emerald-500/5 border border-emerald-200/50 dark:border-emerald-800/50"
                                : "bg-muted/30",
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex flex-col items-center shrink-0 w-10">
                              <span className="text-lg font-bold leading-none">{format(parseISO(day.date), "dd")}</span>
                              <span className="text-[10px] text-muted-foreground uppercase">
                                {format(parseISO(day.date), "EEE", { locale: ptBR })}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs flex-wrap">
                              <span className="font-mono">
                                <span className="text-muted-foreground">E:</span> {day.entrada || "-"}
                              </span>
                              <span className="font-mono">
                                <span className="text-muted-foreground">S:</span> {day.saida || "-"}
                              </span>
                              <span className="font-mono">
                                <span className="text-muted-foreground">Alm:</span>{" "}
                                {formatHoursMinutes(day.almocoMinutes / 60)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-semibold">{formatHoursMinutes(day.hoursWorked)}</span>
                            {day.isLate && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                -{day.lateMinutesDiscounted}min
                              </Badge>
                            )}
                            {day.hasOvertime && (
                              <Badge className="text-[10px] px-1.5 py-0 bg-emerald-600">
                                +{day.overtimeMinutes}min
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground text-sm py-6">
                      Nenhum dia trabalhado neste período
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      {/* Empty state when no employee selected */}
      {!funcionarioId && (
        <Card className="rounded-2xl border-border/50 border-dashed">
          <CardContent className="py-12 text-center">
            <User className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Selecione um funcionário</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Escolha um colaborador para visualizar e gerenciar a jornada
            </p>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      {canManageAll && (
        <ConfigurarAlertasDialog
          open={alertasOpen}
          onOpenChange={setAlertasOpen}
          funcionarioId={funcionarioId}
          funcionarioNome={funcionarioSelecionado?.nome}
        />
      )}
      {canManageAll && funcionarioId && (
        <AjusteManualPontoDialog
          open={ajusteOpen}
          onOpenChange={setAjusteOpen}
          funcionarioId={funcionarioId}
          funcionarioNome={funcionarioSelecionado?.nome || ""}
          registroExistente={registroParaAjuste}
        />
      )}
      {canManageAll && funcionarioId && (
        <AnexosPontoDialog
          open={anexosOpen}
          onOpenChange={setAnexosOpen}
          funcionarioId={funcionarioId}
          funcionarioNome={funcionarioSelecionado?.nome || ""}
        />
      )}
      {funcionarioId && (
        <FechamentoMensalDialog
          open={fechamentoOpen}
          onOpenChange={setFechamentoOpen}
          funcionarioId={funcionarioId}
          funcionarioNome={funcionarioSelecionado?.nome || ""}
          funcionarioProfileId={funcionarioSelecionado?.profile_id}
        />
      )}
    </div>
  );
}
