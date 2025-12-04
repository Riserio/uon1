import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
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
} from "lucide-react";

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
  const [ano, setAno] = useState(new Date().getFullYear().toString());
  const [mes, setMes] = useState((new Date().getMonth() + 1).toString().padStart(2, "0"));
  const [importing, setImporting] = useState(false);

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

  const anos = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString());

  const parseNumber = (text: string): number => {
    if (!text) return 0;
    // Remove espaços e textos, extrai apenas números
    const match = text.match(/[\d.,]+/);
    if (!match) return 0;
    // Converte formato brasileiro para número
    return parseFloat(match[0].replace(/\./g, "").replace(",", ".")) || 0;
  };

  const processPlacasFile = async (file: File): Promise<{ placas: number; cotas: number }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: "binary" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          // Converter para array de arrays
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
          const workbook = XLSX.read(data, { type: "binary" });
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
          const workbook = XLSX.read(data, { type: "binary" });
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
            <CardTitle className="flex items-center gap-2 text-base">
              <Car className="h-4 w-4 text-blue-500" />
              Placas Ativas e Total de Cotas
            </CardTitle>
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
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-green-500" />
              Associados
            </CardTitle>
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
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4 text-purple-500" />
              Cadastros Realizados
            </CardTitle>
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
    </div>
  );
}
