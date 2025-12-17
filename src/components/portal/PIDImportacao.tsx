import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useBIAuditLog } from "@/hooks/useBIAuditLog";
import * as XLSX from "xlsx";
import {
  Upload,
  FileSpreadsheet,
  Car,
  Users,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  Loader2,
  History,
  Trash2,
  Calendar,
  Download,
} from "lucide-react";

// Template download functions for PID
const downloadPlacasTemplate = () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ["PLACA", "STATUS", "COTAS"],
    ["ABC1234", "Ativo", "1"],
    ["DEF5678", "Ativo", "2"],
    ["GHI9012", "Inativo", "1"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Placas e Cotas");
  XLSX.writeFile(wb, "modelo_placas_cotas.xlsx");
  toast.success("Modelo baixado com sucesso!");
};

const downloadAssociadosTemplate = () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ["NOME", "CPF", "STATUS"],
    ["João Silva", "123.456.789-00", "Ativo"],
    ["Maria Santos", "987.654.321-00", "Ativo"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Associados");
  XLSX.writeFile(wb, "modelo_associados.xlsx");
  toast.success("Modelo baixado com sucesso!");
};

const downloadCadastrosTemplate = () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ["DATA CADASTRO", "NOME", "CPF", "PLACA"],
    ["01/01/2024", "João Silva", "123.456.789-00", "ABC1234"],
    ["15/01/2024", "Maria Santos", "987.654.321-00", "DEF5678"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cadastros");
  XLSX.writeFile(wb, "modelo_cadastros.xlsx");
  toast.success("Modelo baixado com sucesso!");
};

interface PIDImportacaoProps {
  corretoraId?: string;
  onImportSuccess?: () => void;
}

interface ImportResult {
  placas_ativas: number | null;
  total_cotas: number | null;
  total_associados: number | null;
  cadastros_realizados: number | null;
}

interface FileStatus {
  file: File | null;
  status: "idle" | "processing" | "success" | "error";
  result: string | null;
}

interface ImportHistory {
  id: string;
  ano: number;
  mes: number;
  placas_ativas: number | null;
  total_cotas: number | null;
  total_associados: number | null;
  cadastros_realizados: number | null;
  created_at: string;
  updated_at: string;
}

const meses = [
  { value: "01", label: "Janeiro" },
  { value: "02", label: "Fevereiro" },
  { value: "03", label: "Março" },
  { value: "04", label: "Abril" },
  { value: "05", label: "Maio" },
  { value: "06", label: "Junho" },
  { value: "07", label: "Julho" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

export default function PIDImportacao({ corretoraId, onImportSuccess }: PIDImportacaoProps) {
  const { user } = useAuth();
  const { registrarLog } = useBIAuditLog();
  const [ano, setAno] = useState(new Date().getFullYear().toString());
  const [mes, setMes] = useState((new Date().getMonth() + 1).toString().padStart(2, "0"));
  const [importing, setImporting] = useState(false);
  const [history, setHistory] = useState<ImportHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [placasFile, setPlacasFile] = useState<FileStatus>({
    file: null,
    status: "idle",
    result: null,
  });
  const [associadosFile, setAssociadosFile] = useState<FileStatus>({
    file: null,
    status: "idle",
    result: null,
  });
  const [cadastrosFile, setCadastrosFile] = useState<FileStatus>({
    file: null,
    status: "idle",
    result: null,
  });

  const [importResult, setImportResult] = useState<ImportResult>({
    placas_ativas: null,
    total_cotas: null,
    total_associados: null,
    cadastros_realizados: null,
  });

  // Anos: próximo ano + atuais (inclui 2026)
  const currentYear = new Date().getFullYear();
  const anos = Array.from({ length: 6 }, (_, i) => (currentYear + 1 - i).toString());

  const fetchHistory = useCallback(async () => {
    if (!corretoraId) return;
    
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from("pid_operacional")
        .select("id, ano, mes, placas_ativas, total_cotas, total_associados, cadastros_realizados, created_at, updated_at")
        .eq("corretora_id", corretoraId)
        .order("ano", { ascending: false })
        .order("mes", { ascending: false });

      if (error) throw error;
      setHistory(data || []);
    } catch (error) {
      console.error("Erro ao buscar histórico:", error);
    } finally {
      setLoadingHistory(false);
    }
  }, [corretoraId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleDeleteImport = async (id: string) => {
    setDeletingId(id);
    try {
      // Buscar dados antes de excluir para registrar no log
      const recordToDelete = history.find(h => h.id === id);
      
      const { error } = await supabase
        .from("pid_operacional")
        .delete()
        .eq("id", id);

      if (error) throw error;
      
      // Registrar log de exclusão com dados anteriores
      await registrarLog({
        modulo: "bi_indicadores",
        acao: "exclusao",
        descricao: `Registro de ${getMesLabel(recordToDelete?.mes || 0)}/${recordToDelete?.ano} excluído`,
        corretoraId,
        dadosAnteriores: recordToDelete ? {
          ano: recordToDelete.ano,
          mes: recordToDelete.mes,
          placas_ativas: recordToDelete.placas_ativas,
          total_cotas: recordToDelete.total_cotas,
          total_associados: recordToDelete.total_associados,
          cadastros_realizados: recordToDelete.cadastros_realizados,
        } : null,
      });
      
      toast.success("Registro excluído com sucesso");
      fetchHistory();
      onImportSuccess?.();
    } catch (error: any) {
      console.error("Erro ao excluir registro:", error);
      toast.error("Erro ao excluir: " + error.message);
    } finally {
      setDeletingId(null);
    }
  };

  const getMesLabel = (mesNum: number) => {
    return meses.find(m => parseInt(m.value) === mesNum)?.label || mesNum.toString();
  };

  const parseNumber = (text: string | number | Date | any): number => {
    if (text === null || text === undefined || text === "") return 0;
    
    // Se for uma instância de Date, ignorar (não deve ser parseado como número)
    if (text instanceof Date) return 0;
    
    // Se for objeto (pode ser Date do XLSX), ignorar
    if (typeof text === "object") return 0;
    
    // Se já é um número, retorna diretamente
    if (typeof text === "number") {
      // Verificar se é um número absurdamente grande (provavelmente data serial do Excel mal interpretada)
      if (text > 10000000) return 0;
      return text;
    }
    
    const str = text.toString().trim();
    
    // Remove espaços e textos, extrai apenas números
    const match = str.match(/[\d.,]+/);
    if (!match) return 0;
    
    const numStr = match[0];
    
    // Detectar formato: brasileiro (30.212,07) vs americano (30,212.07 ou 30212.07)
    const lastDot = numStr.lastIndexOf(".");
    const lastComma = numStr.lastIndexOf(",");
    
    if (lastComma > lastDot) {
      // Formato brasileiro: 30.212,07 -> ponto é milhar, vírgula é decimal
      return parseFloat(numStr.replace(/\./g, "").replace(",", ".")) || 0;
    } else if (lastDot > lastComma) {
      // Formato americano/internacional: 30,212.07 ou 30212.07 -> vírgula é milhar, ponto é decimal
      return parseFloat(numStr.replace(/,/g, "")) || 0;
    } else {
      // Apenas números sem separadores ou apenas ponto/vírgula
      // Se tem ponto e mais de 2 dígitos depois, pode ser milhar brasileiro
      const afterDot = numStr.split(".")[1];
      if (afterDot && afterDot.length > 2) {
        // Provavelmente milhar brasileiro: 30.212 -> 30212
        return parseFloat(numStr.replace(/\./g, "")) || 0;
      }
      // Assume formato decimal padrão
      return parseFloat(numStr.replace(/,/g, ".")) || 0;
    }
  };

  const processPlacasFile = async (file: File): Promise<{ placas: number; cotas: number }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          // cellDates: false evita conversão automática de números para datas
          const workbook = XLSX.read(data, { type: "binary", cellDates: false, cellNF: false, cellText: true });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          // Converter para array de arrays com raw: false para obter valores formatados
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          
          let totalVeiculos = 0;
          let totalCotas = 0;

          // Procurar por linhas que contêm "Total de veículo encontrados" ou "Total de veículos encontrados"
          // e "Total de cotas" na última seção do arquivo
          let lastVeiculos = 0;
          let lastCotas = 0;

          for (const row of jsonData) {
            const rowText = row.join(" ").toLowerCase();
            
            // Buscar total geral no final do arquivo
            if (rowText.includes("total de veículo encontrados") || rowText.includes("total de veículos encontrados")) {
              const cellText = row[0]?.toString() || row[1]?.toString() || "";
              if (cellText.toLowerCase().includes("total de veículo encontrados") || 
                  cellText.toLowerCase().includes("total de veículos encontrados")) {
                // Verificar se é o total geral (sem tipo específico)
                const value = parseNumber(row[1]?.toString() || cellText);
                if (value > lastVeiculos) {
                  lastVeiculos = value;
                }
              }
            }

            if (rowText.includes("total de cotas de veículo encontrados") || 
                rowText.includes("total de cotas encontradas")) {
              const cellText = row[0]?.toString() || row[1]?.toString() || "";
              if (cellText.toLowerCase().includes("total de cotas de veículo") ||
                  cellText.toLowerCase().includes("total de cotas encontradas")) {
                const value = parseNumber(row[1]?.toString() || cellText);
                if (value > lastCotas) {
                  lastCotas = value;
                }
              }
            }
          }

          // Se não encontrou total geral, somar os subtotais
          if (lastVeiculos === 0 || lastCotas === 0) {
            for (const row of jsonData) {
              const rowText = row.join(" ").toLowerCase();
              
              if (rowText.includes("total de veículos encontrados:")) {
                const match = rowText.match(/total de veículos encontrados:\s*([\d.,]+)/);
                if (match) {
                  totalVeiculos += parseNumber(match[1]);
                }
              }
              
              if (rowText.includes("total de cotas encontradas:")) {
                const match = rowText.match(/total de cotas encontradas:\s*([\d.,]+)/);
                if (match) {
                  totalCotas += parseNumber(match[1]);
                }
              }
            }
          } else {
            totalVeiculos = lastVeiculos;
            totalCotas = lastCotas;
          }

          resolve({ placas: totalVeiculos, cotas: totalCotas });
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsBinaryString(file);
    });
  };

  const processAssociadosFile = async (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: "binary", cellDates: false, cellNF: false, cellText: true });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          
          let totalAssociados = 0;

          // Procurar pelo total geral no final
          for (const row of jsonData) {
            const rowText = row.join(" ").toLowerCase();
            
            // O total geral vem no final: "Total de associados encontrados: XXXX"
            if (rowText.includes("total de associados encontrados")) {
              const cellText = row[0]?.toString() || "";
              const value = parseNumber(cellText);
              if (value > totalAssociados) {
                totalAssociados = value;
              }
            }
          }

          resolve(totalAssociados);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsBinaryString(file);
    });
  };

  const processCadastrosFile = async (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: "binary", cellDates: false, cellNF: false, cellText: true });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          
          let totalCadastros = 0;

          // Procurar pelo resumo no final: "Total de veículos encontrados: XXX"
          for (const row of jsonData) {
            const rowText = row.join(" ").toLowerCase();
            
            if (rowText.includes("total de veículos encontrados")) {
              const cellText = row[0]?.toString() || row[1]?.toString() || "";
              const value = parseNumber(cellText);
              if (value > 0) {
                totalCadastros = value;
              }
            }
          }

          // Se não encontrou o resumo, contar linhas de dados (excluindo cabeçalhos)
          if (totalCadastros === 0) {
            let dataStarted = false;
            for (const row of jsonData) {
              const firstCell = row[0]?.toString().toLowerCase() || "";
              
              // Detectar início dos dados após "Nome" header
              if (firstCell === "nome") {
                dataStarted = true;
                continue;
              }
              
              // Parar no resumo
              if (firstCell.includes("resumo") || firstCell.includes("total")) {
                break;
              }
              
              // Contar linhas de dados válidas
              if (dataStarted && row[0] && row[0].toString().trim()) {
                totalCadastros++;
              }
            }
          }

          resolve(totalCadastros);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsBinaryString(file);
    });
  };

  const handlePlacasUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPlacasFile({ file, status: "processing", result: null });

    try {
      const { placas, cotas } = await processPlacasFile(file);
      setPlacasFile({
        file,
        status: "success",
        result: `Placas: ${placas.toLocaleString("pt-BR")} | Cotas: ${cotas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      });
      setImportResult((prev) => ({ ...prev, placas_ativas: placas, total_cotas: cotas }));
    } catch (error) {
      console.error("Erro ao processar arquivo de placas:", error);
      setPlacasFile({ file, status: "error", result: "Erro ao processar arquivo" });
      toast.error("Erro ao processar arquivo de placas");
    }
  };

  const handleAssociadosUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAssociadosFile({ file, status: "processing", result: null });

    try {
      const total = await processAssociadosFile(file);
      setAssociadosFile({
        file,
        status: "success",
        result: `Total de Associados: ${total.toLocaleString("pt-BR")}`,
      });
      setImportResult((prev) => ({ ...prev, total_associados: total }));
    } catch (error) {
      console.error("Erro ao processar arquivo de associados:", error);
      setAssociadosFile({ file, status: "error", result: "Erro ao processar arquivo" });
      toast.error("Erro ao processar arquivo de associados");
    }
  };

  const handleCadastrosUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCadastrosFile({ file, status: "processing", result: null });

    try {
      const total = await processCadastrosFile(file);
      setCadastrosFile({
        file,
        status: "success",
        result: `Cadastros Realizados: ${total.toLocaleString("pt-BR")}`,
      });
      setImportResult((prev) => ({ ...prev, cadastros_realizados: total }));
    } catch (error) {
      console.error("Erro ao processar arquivo de cadastros:", error);
      setCadastrosFile({ file, status: "error", result: "Erro ao processar arquivo" });
      toast.error("Erro ao processar arquivo de cadastros");
    }
  };

  const handleImport = async () => {
    if (!corretoraId || !user) {
      toast.error("Selecione uma associação");
      return;
    }

    // Verificar se há pelo menos um arquivo processado
    const hasData =
      importResult.placas_ativas !== null ||
      importResult.total_cotas !== null ||
      importResult.total_associados !== null ||
      importResult.cadastros_realizados !== null;

    if (!hasData) {
      toast.error("Envie pelo menos um arquivo para importar");
      return;
    }

    setImporting(true);

    try {
      // Verificar se já existe registro para o mês/ano
      const { data: existing, error: fetchError } = await supabase
        .from("pid_operacional")
        .select("id")
        .eq("corretora_id", corretoraId)
        .eq("ano", parseInt(ano))
        .eq("mes", parseInt(mes))
        .maybeSingle();

      if (fetchError) throw fetchError;

      const baseData = {
        corretora_id: corretoraId,
        ano: parseInt(ano),
        mes: parseInt(mes),
        updated_by: user.id,
      };

      const updateFields: Record<string, number> = {};
      if (importResult.placas_ativas !== null) {
        updateFields.placas_ativas = importResult.placas_ativas;
      }
      if (importResult.total_cotas !== null) {
        updateFields.total_cotas = importResult.total_cotas;
      }
      if (importResult.total_associados !== null) {
        updateFields.total_associados = importResult.total_associados;
      }
      if (importResult.cadastros_realizados !== null) {
        updateFields.cadastros_realizados = importResult.cadastros_realizados;
      }

      if (existing) {
        // Atualizar registro existente
        const { error: updateError } = await supabase
          .from("pid_operacional")
          .update({ ...updateFields, updated_by: user.id })
          .eq("id", existing.id);

        if (updateError) throw updateError;
      } else {
        // Criar novo registro
        const { error: insertError } = await supabase.from("pid_operacional").insert({
          ...baseData,
          ...updateFields,
          created_by: user.id,
        });

        if (insertError) throw insertError;
      }

      // Registrar log de importação
      await registrarLog({
        modulo: "bi_indicadores",
        acao: "importacao",
        descricao: `Importação de dados para ${getMesLabel(parseInt(mes))}/${ano}`,
        corretoraId,
        dadosNovos: {
          ano: parseInt(ano),
          mes: parseInt(mes),
          placas_ativas: importResult.placas_ativas,
          total_cotas: importResult.total_cotas,
          total_associados: importResult.total_associados,
          cadastros_realizados: importResult.cadastros_realizados,
        },
      });

      toast.success("Dados importados com sucesso!");

      // Limpar estados
      setPlacasFile({ file: null, status: "idle", result: null });
      setAssociadosFile({ file: null, status: "idle", result: null });
      setCadastrosFile({ file: null, status: "idle", result: null });
      setImportResult({
        placas_ativas: null,
        total_cotas: null,
        total_associados: null,
        cadastros_realizados: null,
      });

      fetchHistory();
      onImportSuccess?.();
    } catch (error: any) {
      console.error("Erro ao importar dados:", error);
      toast.error("Erro ao importar dados: " + error.message);
    } finally {
      setImporting(false);
    }
  };

  const getStatusIcon = (status: FileStatus["status"]) => {
    switch (status) {
      case "processing":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  if (!corretoraId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Selecione uma associação para importar dados.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com seleção de período */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importação de Dados
          </CardTitle>
          <CardDescription>
            Importe dados de planilhas Excel para preencher automaticamente os campos do BI-Indicadores
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1.5">
              <Label>Ano</Label>
              <Select value={ano} onValueChange={setAno}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {anos.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mês</Label>
              <Select value={mes} onValueChange={setMes}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {meses.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards de Upload */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Placas Ativas e Total de Cotas */}
        <Card className="border-blue-500/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Car className="h-4 w-4 text-blue-500" />
                Placas Ativas e Total de Cotas
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={downloadPlacasTemplate} className="h-7 text-xs">
                <Download className="h-3 w-3 mr-1" />
                Modelo
              </Button>
            </div>
            <CardDescription className="text-xs">
              Arquivo de relatório de veículos fotografia
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept=".xls,.xlsx"
                onChange={handlePlacasUpload}
                className="text-xs"
                disabled={placasFile.status === "processing"}
              />
              {getStatusIcon(placasFile.status)}
            </div>
            {placasFile.result && (
              <div
                className={`text-xs p-2 rounded ${
                  placasFile.status === "success"
                    ? "bg-green-500/10 text-green-600"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {placasFile.result}
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              <strong>Campos mapeados:</strong>
              <ul className="mt-1 ml-4 list-disc">
                <li>Placas Ativas</li>
                <li>Total de Cotas</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Associados */}
        <Card className="border-green-500/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-green-500" />
                Associados
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={downloadAssociadosTemplate} className="h-7 text-xs">
                <Download className="h-3 w-3 mr-1" />
                Modelo
              </Button>
            </div>
            <CardDescription className="text-xs">
              Arquivo de relatório de associados ativos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept=".xls,.xlsx"
                onChange={handleAssociadosUpload}
                className="text-xs"
                disabled={associadosFile.status === "processing"}
              />
              {getStatusIcon(associadosFile.status)}
            </div>
            {associadosFile.result && (
              <div
                className={`text-xs p-2 rounded ${
                  associadosFile.status === "success"
                    ? "bg-green-500/10 text-green-600"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {associadosFile.result}
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              <strong>Campos mapeados:</strong>
              <ul className="mt-1 ml-4 list-disc">
                <li>Total de Associados</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Cadastros Realizados */}
        <Card className="border-purple-500/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserPlus className="h-4 w-4 text-purple-500" />
                Cadastros Realizados
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={downloadCadastrosTemplate} className="h-7 text-xs">
                <Download className="h-3 w-3 mr-1" />
                Modelo
              </Button>
            </div>
            <CardDescription className="text-xs">
              Arquivo de novos cadastros do período
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept=".xls,.xlsx"
                onChange={handleCadastrosUpload}
                className="text-xs"
                disabled={cadastrosFile.status === "processing"}
              />
              {getStatusIcon(cadastrosFile.status)}
            </div>
            {cadastrosFile.result && (
              <div
                className={`text-xs p-2 rounded ${
                  cadastrosFile.status === "success"
                    ? "bg-green-500/10 text-green-600"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {cadastrosFile.result}
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              <strong>Campos mapeados:</strong>
              <ul className="mt-1 ml-4 list-disc">
                <li>Cadastros Realizados</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resumo e Botão de Importar */}
      {(importResult.placas_ativas !== null ||
        importResult.total_associados !== null ||
        importResult.cadastros_realizados !== null) && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4" />
              Resumo da Importação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 mb-4">
              {importResult.placas_ativas !== null && (
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Placas Ativas</span>
                  <span className="text-lg font-bold">
                    {importResult.placas_ativas.toLocaleString("pt-BR")}
                  </span>
                </div>
              )}
              {importResult.total_cotas !== null && (
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Total de Cotas</span>
                  <span className="text-lg font-bold">
                    {importResult.total_cotas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              {importResult.total_associados !== null && (
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Total de Associados</span>
                  <span className="text-lg font-bold">
                    {importResult.total_associados.toLocaleString("pt-BR")}
                  </span>
                </div>
              )}
              {importResult.cadastros_realizados !== null && (
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Cadastros Realizados</span>
                  <span className="text-lg font-bold">
                    {importResult.cadastros_realizados.toLocaleString("pt-BR")}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-xs text-muted-foreground">
                Os dados serão salvos para{" "}
                <Badge variant="outline" className="ml-1">
                  {meses.find((m) => m.value === mes)?.label} de {ano}
                </Badge>
              </div>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Importar Dados
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Histórico de Importações */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Importações
          </CardTitle>
          <CardDescription>
            Visualize e gerencie os dados importados por período
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma importação realizada ainda.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Período</TableHead>
                    <TableHead className="text-right">Placas Ativas</TableHead>
                    <TableHead className="text-right">Total Cotas</TableHead>
                    <TableHead className="text-right">Associados</TableHead>
                    <TableHead className="text-right">Cadastros</TableHead>
                    <TableHead className="text-right">Atualizado em</TableHead>
                    <TableHead className="w-20 text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {getMesLabel(item.mes)}/{item.ano}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {item.placas_ativas?.toLocaleString("pt-BR") || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.total_cotas?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.total_associados?.toLocaleString("pt-BR") || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.cadastros_realizados?.toLocaleString("pt-BR") || "-"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {new Date(item.updated_at).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="text-center">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              disabled={deletingId === item.id}
                            >
                              {deletingId === item.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir importação</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir os dados importados de{" "}
                                <strong>{getMesLabel(item.mes)}/{item.ano}</strong>?
                                <br />
                                Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteImport(item.id)}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
