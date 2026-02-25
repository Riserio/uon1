import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import CobrancaHistoricoImportacoes from "./CobrancaHistoricoImportacoes";
// Automação agora é gerenciada pelo BISyncButton no header
import { useBIAuditLog } from "@/hooks/useBIAuditLog";
import { useAuth } from "@/hooks/useAuth";

type CobrancaModulo = "cobranca_insights";

// Template columns for Cobrança
const COBRANCA_TEMPLATE_COLUMNS = [
  "Data Pagamento",
  "Data Vencimento Original",
  "Dia Vencimento Veiculo",
  "Regional Boleto",
  "Cooperativa",
  "Voluntário",
  "Nome",
  "Placas",
  "Valor",
  "Data Vencimento",
  "Qtde Dias em Atraso Vencimento Original",
  "Situacao"
];

const downloadCobrancaTemplate = () => {
  const ws = XLSX.utils.aoa_to_sheet([
    COBRANCA_TEMPLATE_COLUMNS,
    ["01/15/2026", "01/20/2026", "20", "REGIONAL SUL", "COOPERATIVA A", "JOAO SILVA", "MARIA SANTOS", "ABC1234", "R$ 150,00", "01/20/2026", "0", "ABERTO"]
  ]);
  
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Modelo Cobrança");
  XLSX.writeFile(wb, "modelo_cobranca_importacao.xlsx");
  toast.success("Modelo baixado com sucesso!");
};

interface CobrancaImportacaoProps {
  onImportSuccess: () => void;
  corretoraId: string;
  corretoraNome?: string;
}

// Mapeamento de colunas do Excel para campos do banco
const COLUMN_MAP: { [key: string]: string } = {
  "DATA PAGAMENTO": "data_pagamento",
  "DATA VENCIMENTO ORIGINAL": "data_vencimento_original",
  "DIA VENCIMENTO VEICULO": "dia_vencimento_veiculo",
  "REGIONAL BOLETO": "regional_boleto",
  "COOPERATIVA": "cooperativa",
  "VOLUNTÁRIO": "voluntario",
  "VOLUNTARIO": "voluntario",
  "NOME": "nome",
  "PLACAS": "placas",
  "VALOR": "valor",
  "DATA VENCIMENTO": "data_vencimento",
  "QTDE DIAS EM ATRASO VENCIMENTO ORIGINAL": "qtde_dias_atraso_vencimento_original",
  "SITUACAO": "situacao",
  "SITUAÇÃO": "situacao"
};

// Função para normalizar header
const normalizeHeader = (header: string): string => {
  return header.trim().toUpperCase().replace(/\s+/g, " ");
};

// Função para encontrar valor no row
const getValueFromRow = (row: any, targetHeader: string): any => {
  if (row[targetHeader] !== undefined) return row[targetHeader];
  
  const normalizedTarget = normalizeHeader(targetHeader);
  for (const key of Object.keys(row)) {
    if (normalizeHeader(key) === normalizedTarget) {
      return row[key];
    }
  }
  
  return undefined;
};

// Função para converter data do Excel
const parseExcelDate = (value: any): string | null => {
  if (!value) return null;
  
  // Se for número (serial date do Excel) - parse without timezone shift
  if (typeof value === "number") {
    // Excel serial: days since 1900-01-01 (with the 1900 leap year bug)
    const utcDays = value - 25569; // days since Unix epoch
    const totalMs = utcDays * 86400 * 1000;
    const d = new Date(totalMs);
    // Use UTC components to avoid timezone shift
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  
  // Se for string no formato M/D/YY
  if (typeof value === "string") {
    const parts = value.split("/");
    if (parts.length === 3) {
      const [p1, p2, p3] = parts;
      const month = parseInt(p1);
      const day = parseInt(p2);
      let year = parseInt(p3);
      if (year < 100) year += 2000;
      
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
  }
  
  return null;
};

// Função para converter valor monetário - trata formato brasileiro e valores com casas decimais extras
const parseMoneyValue = (value: any): number => {
  if (!value) return 0;
  
  // Se for número, verificar se parece estar em centavos
  if (typeof value === "number") {
    // Se o número é muito grande e termina em 00, pode estar em centavos
    if (value >= 10000 && value % 100 === 0) {
      return value / 100;
    }
    return value;
  }
  
  const strValue = String(value).trim();
  
  // Remove R$, espaços extras
  let cleanValue = strValue.replace(/R\$\s*/g, "").trim();
  
  // Se não tem vírgula nem ponto, pode ser um número inteiro
  if (!/[.,]/.test(cleanValue)) {
    const parsed = parseFloat(cleanValue);
    if (isNaN(parsed)) return 0;
    // Se parece ser um valor em centavos (muito grande para boleto típico)
    if (parsed > 10000 && parsed % 100 === 0) {
      return parsed / 100;
    }
    return parsed;
  }
  
  // Detectar formato brasileiro: 1.234,56 ou 96,39
  // vs formato internacional: 1,234.56 ou 96.39
  const lastComma = cleanValue.lastIndexOf(",");
  const lastDot = cleanValue.lastIndexOf(".");
  
  if (lastComma > lastDot) {
    // Formato brasileiro: vírgula é separador decimal
    cleanValue = cleanValue.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // Formato internacional ou misto
    cleanValue = cleanValue.replace(/,/g, "");
  }
  
  const parsed = parseFloat(cleanValue);
  if (isNaN(parsed)) return 0;
  
  // Heurística: se o valor é muito alto e termina em .00, pode estar em centavos
  const strParsed = parsed.toFixed(2);
  if (parsed >= 10000 && strParsed.endsWith(".00")) {
    return parsed / 100;
  }
  
  return parsed;
};

// Limpar links do Excel [texto](link)
const cleanExcelLink = (value: any): string => {
  if (!value) return "";
  const str = String(value);
  // Padrão [texto](link) -> apenas texto
  const match = str.match(/\[([^\]]+)\]/);
  if (match) return match[1];
  return str.trim();
};

export default function CobrancaImportacao({ onImportSuccess, corretoraId, corretoraNome }: CobrancaImportacaoProps) {
  const { registrarLog } = useBIAuditLog();
  const { userRole } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<any[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeImportTab, setActiveImportTab] = useState("upload");
  
  const isAdmin = userRole === "admin" || userRole === "superintendente";

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setPreview([]);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
      
      console.log("Preview headers:", Object.keys(jsonData[0] || {}));
      console.log("Preview data:", jsonData.slice(0, 2));
      
      setPreview(jsonData.slice(0, 5));
    } catch (error) {
      console.error("Erro ao ler preview:", error);
      toast.error("Erro ao ler arquivo");
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error("Selecione um arquivo");
      return;
    }

    if (!corretoraId) {
      toast.error("Selecione uma associação primeiro");
      return;
    }

    setImporting(true);
    setProgress(0);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
      
      console.log("Import headers:", Object.keys(jsonData[0] || {}));

      if (!jsonData.length) {
        toast.error("Arquivo vazio ou sem dados válidos");
        setImporting(false);
        return;
      }

      setProgress(10);

      // Desativar importações anteriores da mesma associação
      await supabase
        .from("cobranca_importacoes")
        .update({ ativo: false })
        .eq("ativo", true)
        .eq("corretora_id", corretoraId);

      setProgress(20);

      // Criar nova importação
      const { data: importacao, error: impError } = await supabase
        .from("cobranca_importacoes")
        .insert({
          nome_arquivo: file.name,
          total_registros: jsonData.length,
          ativo: true,
          corretora_id: corretoraId
        })
        .select()
        .single();

      if (impError) throw impError;

      setProgress(30);

      // Processar e inserir dados em batches
      const batchSize = 100;
      const totalBatches = Math.ceil(jsonData.length / batchSize);

      // Data de referência para cálculo de atraso
      const hojeDate = new Date();
      const hojeStr = `${hojeDate.getFullYear()}-${String(hojeDate.getMonth()+1).padStart(2,'0')}-${String(hojeDate.getDate()).padStart(2,'0')}`;

      for (let i = 0; i < totalBatches; i++) {
        const batch = jsonData.slice(i * batchSize, (i + 1) * batchSize);

        const records = batch.map((row: any) => {
          const record: any = { importacao_id: importacao.id };
          const processedDbCols = new Set<string>();

          Object.entries(COLUMN_MAP).forEach(([excelCol, dbCol]) => {
            if (processedDbCols.has(dbCol)) return;

            const value = getValueFromRow(row, excelCol);

            if (value !== undefined && value !== null && value !== "") {
              processedDbCols.add(dbCol);
            }

            // Campos de data
            if (dbCol.startsWith("data_")) {
              record[dbCol] = parseExcelDate(value);
            }
            // Campo de valor monetário
            else if (dbCol === "valor") {
              record[dbCol] = parseMoneyValue(value);
            }
            // Campos numéricos
            else if (dbCol === "dia_vencimento_veiculo" || dbCol === "qtde_dias_atraso_vencimento_original") {
              record[dbCol] = value ? parseInt(String(value)) || null : null;
            }
            // Placas e situação (limpar links)
            else if (dbCol === "placas" || dbCol === "situacao") {
              record[dbCol] = cleanExcelLink(value);
            }
            // Texto normal
            else {
              record[dbCol] = value || null;
            }
          });

          // ============================================
          // FALLBACK: derivar campos críticos se vazios
          // ============================================

          // Dia Vencimento Veículo = dia do mês de data_vencimento
          if (record.dia_vencimento_veiculo == null && record.data_vencimento) {
            const dv = String(record.data_vencimento); // YYYY-MM-DD
            const dia = parseInt(dv.split("-")[2], 10);
            if (!isNaN(dia) && dia >= 1 && dia <= 31) {
              record.dia_vencimento_veiculo = dia;
            }
          }

          // Se tem data de pagamento, o boleto foi pago - dias de atraso = 0
          if (record.data_pagamento) {
            record.qtde_dias_atraso_vencimento_original = 0;
          } else if (record.qtde_dias_atraso_vencimento_original == null && record.data_vencimento_original) {
            // Dias de atraso = hoje - data_vencimento_original (>=0)
            const dvo = String(record.data_vencimento_original);
            const dtVencOrig = new Date(dvo + "T00:00:00");
            const dtHoje = new Date(hojeStr + "T00:00:00");
            if (!isNaN(dtVencOrig.getTime())) {
              const diffMs = dtHoje.getTime() - dtVencOrig.getTime();
              const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
              record.qtde_dias_atraso_vencimento_original = diffDias >= 0 ? diffDias : 0;
            }
          }

          return record;
        });

        const { error: batchError } = await supabase
          .from("cobranca_boletos")
          .insert(records);

        if (batchError) {
          console.error("Erro no batch:", batchError);
          throw batchError;
        }

        setProgress(30 + Math.round((i + 1) / totalBatches * 70));
      }

      // Registrar log de importação
      await registrarLog({
        modulo: "cobranca_insights",
        acao: "importacao",
        descricao: `Importação de ${jsonData.length} registros - ${file.name}`,
        corretoraId,
        dadosNovos: {
          arquivo: file.name,
          total_registros: jsonData.length,
          corretora: corretoraNome,
        },
      });

      toast.success(`${jsonData.length} registros importados com sucesso para ${corretoraNome}!`);
      setFile(null);
      setPreview([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onImportSuccess();
    } catch (error: any) {
      console.error("Erro na importação:", error);
      toast.error("Erro ao importar: " + (error.message || "Erro desconhecido"));
    } finally {
      setImporting(false);
      setProgress(0);
    }
  };

  if (!corretoraId) {
    return (
      <Card className="border-yellow-500/20 bg-yellow-500/5">
        <CardContent className="p-6">
          <div className="flex gap-3 items-center">
            <AlertCircle className="h-6 w-6 text-yellow-500" />
            <div>
              <p className="font-medium text-yellow-600">Selecione uma Associação</p>
              <p className="text-sm text-muted-foreground mt-1">
                Para importar dados, primeiro selecione uma associação no filtro acima.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Importar Planilha
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={downloadCobrancaTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Baixar Modelo
              </Button>
            </div>
          </div>
          <CardDescription>
            Importando para: <span className="font-semibold text-foreground">{corretoraNome}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">Arquivo Excel</Label>
            <Input
              ref={fileInputRef}
              id="file"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              disabled={importing}
            />
          </div>

          {file && (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <FileSpreadsheet className="h-8 w-8 text-green-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              {preview.length > 0 && (
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm">Válido</span>
                </div>
              )}
            </div>
          )}

          {importing && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-muted-foreground text-center">
                Importando... {progress}%
              </p>
            </div>
          )}

          <Button
            onClick={handleImport}
            disabled={!file || importing}
            className="w-full"
          >
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
        </CardContent>
      </Card>


      {/* Preview */}
      {preview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview (5 primeiras linhas)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    {Object.keys(preview[0]).slice(0, 6).map((col) => (
                      <th key={col} className="p-2 text-left font-medium text-muted-foreground">
                        {col}
                      </th>
                    ))}
                    <th className="p-2 text-left font-medium text-muted-foreground">...</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-b">
                      {Object.values(row).slice(0, 6).map((val: any, j) => (
                        <td key={j} className="p-2 truncate max-w-[120px]">
                          {String(val)}
                        </td>
                      ))}
                      <td className="p-2 text-muted-foreground">...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info - Colunas esperadas */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="p-4">
          <div className="space-y-2 text-sm">
            <p className="font-medium text-blue-700">Colunas esperadas:</p>
            <div className="flex flex-wrap gap-2">
              {COBRANCA_TEMPLATE_COLUMNS.map((col) => (
                <span key={col} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">
                  {col}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Histórico de Importações */}
      <CobrancaHistoricoImportacoes 
        corretoraId={corretoraId} 
        onImportacaoAtivada={onImportSuccess}
      />
    </div>
  );
}
