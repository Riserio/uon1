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
import SGAHistoricoImportacoes from "./SGAHistoricoImportacoes";
// Automação agora é gerenciada pelo BISyncButton no header
import { useBIAuditLog } from "@/hooks/useBIAuditLog";
import { useAuth } from "@/hooks/useAuth";

// Template columns for SGA
const SGA_TEMPLATE_COLUMNS = [
  "EVENTO ESTADO",
  "DATA CADASTRO ITEM",
  "DATA EVENTO",
  "MOTIVO EVENTO",
  "TIPO EVENTO",
  "SITUACAO EVENTO",
  "MODELO VEICULO",
  "PLACA",
  "VALOR REPARO",
  "CUSTO EVENTO",
  "COOPERATIVA",
  "REGIONAL"
];

const downloadSGATemplate = () => {
  const ws = XLSX.utils.aoa_to_sheet([
    SGA_TEMPLATE_COLUMNS,
    ["MG", "01/01/2024", "15/01/2024", "Colisão", "Sinistro", "Em Análise", "FIAT ARGO", "ABC1234", "5000.00", "3500.00", "Cooperativa A", "Regional Sul"]
  ]);
  
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Modelo SGA");
  XLSX.writeFile(wb, "modelo_sga_importacao.xlsx");
  toast.success("Modelo baixado com sucesso!");
};

interface SGAImportacaoProps {
  onImportSuccess: () => void;
  corretoraId: string;
  corretoraNome: string;
}

// Mapeamento de colunas do Excel para campos do banco (case-insensitive)
const COLUMN_MAP: { [key: string]: string } = {
  "EVENTO ESTADO": "evento_estado",
  "DATA CADASTRO ITEM": "data_cadastro_item",
  "DATA EVENTO": "data_evento",
  "MOTIVO EVENTO": "motivo_evento",
  "TIPO EVENTO": "tipo_evento",
  "SITUACAO EVENTO": "situacao_evento",
  "MODELO VEICULO": "modelo_veiculo",
  "MODELO VEICULO TERCEIRO": "modelo_veiculo_terceiro",
  "PLACA": "placa",
  "PLACA TERCEIRO": "placa_terceiro",
  "DATA ULTIMA ALTERACAO SITUACAO": "data_ultima_alteracao_situacao",
  "VALOR REPARO": "valor_reparo",
  "DATA CONCLUSAO": "data_conclusao",
  "CUSTO EVENTO": "custo_evento",
  "DATA ALTERACAO": "data_alteracao",
  "DATA PREVISAO ENTREGA": "data_previsao_entrega",
  "SOLICITOU CARRO RESERVA": "solicitou_carro_reserva",
  "ENVOLVIMENTO TERCEIRO": "envolvimento_terceiro",
  "PASSIVEL RESSARCIMENTO": "passivel_ressarcimento",
  "VALOR MAO DE OBRA": "valor_mao_de_obra",
  "CLASSIFICACAO": "classificacao",
  "PARTICIPACAO": "participacao",
  "ENVOLVIMENTO": "envolvimento",
  "PREVISAO VALOR REPARO": "previsao_valor_reparo",
  "USUARIO ALTERACAO": "usuario_alteracao",
  "DATA CADASTRO EVENTO": "data_cadastro_evento",
  "COOPERATIVA": "cooperativa",
  "VALOR PROTEGIDO VEICULO": "valor_protegido_veiculo",
  "SITUACAO ANALISE EVENTO": "situacao_analise_evento",
  "REGIONAL": "regional",
  "ANO FABRICACAO": "ano_fabricacao",
  "VOLUNTARIO": "voluntario",
  "REGIONAL VEICULO": "regional_veiculo",
  "ASSOCIADO ESTADO": "associado_estado",
  "EVENTO CIDADE": "evento_cidade",
  "CIDADE EVENTO": "evento_cidade",
  "CIDADE": "evento_cidade"
};

// Função para normalizar header (remove espaços extras e converte para uppercase)
const normalizeHeader = (header: string): string => {
  return header.trim().toUpperCase().replace(/\s+/g, " ");
};

// Função para encontrar valor no row considerando variações de header
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

// Função para converter data do Excel - retorna null para banco
const parseExcelDate = (value: any): string | null => {
  if (!value) return null;
  
  if (typeof value === "number") {
    if (value < 1 || value > 100000) {
      console.warn("Serial date fora do range:", value);
      return null;
    }
    try {
      const date = new Date((value - 25569) * 86400 * 1000);
      if (isNaN(date.getTime()) || date.getFullYear() < 1900 || date.getFullYear() > 2100) {
        return null;
      }
      return date.toISOString().split("T")[0];
    } catch {
      return null;
    }
  }
  
  if (typeof value === "string") {
    const parts = value.split("/");
    if (parts.length === 3) {
      const [p1, p2, p3] = parts;
      const day = parseInt(p1);
      const month = parseInt(p2);
      let year = parseInt(p3);
      if (year < 100) year += 2000;
      
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
  }
  
  return null;
};

// Função para formatar data do Excel para exibição no preview
const formatExcelDateForPreview = (value: any): string => {
  if (!value) return "";
  
  if (typeof value === "number") {
    if (value < 1 || value > 100000) {
      return String(value);
    }
    try {
      const date = new Date((value - 25569) * 86400 * 1000);
      if (isNaN(date.getTime()) || date.getFullYear() < 1900 || date.getFullYear() > 2100) {
        return String(value);
      }
      return date.toLocaleDateString("pt-BR");
    } catch {
      return String(value);
    }
  }
  
  return String(value);
};

// Colunas que são datas (para formatar no preview)
const DATE_COLUMNS = [
  "DATA CADASTRO ITEM",
  "DATA EVENTO",
  "DATA ULTIMA ALTERACAO SITUACAO",
  "DATA CONCLUSAO",
  "DATA ALTERACAO",
  "DATA PREVISAO ENTREGA",
  "DATA CADASTRO EVENTO"
];

// Função para converter valor monetário
const parseMoneyValue = (value: any): number => {
  if (!value) return 0;
  if (typeof value === "number") return value;
  
  const cleaned = String(value)
    .replace(/R\$\s*/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

export default function SGAImportacao({ onImportSuccess, corretoraId, corretoraNome }: SGAImportacaoProps) {
  const { registrarLog } = useBIAuditLog();
  const { userRole } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<any[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      // Desativar importações anteriores DA MESMA ASSOCIAÇÃO
      await supabase
        .from("sga_importacoes")
        .update({ ativo: false })
        .eq("ativo", true)
        .eq("corretora_id", corretoraId);

      setProgress(20);

      // Criar nova importação com corretora_id
      const { data: importacao, error: impError } = await supabase
        .from("sga_importacoes")
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
            
            if (dbCol.startsWith("data_")) {
              record[dbCol] = parseExcelDate(value);
            }
            else if (["valor_reparo", "custo_evento", "valor_mao_de_obra", "participacao", "previsao_valor_reparo", "valor_protegido_veiculo"].includes(dbCol)) {
              record[dbCol] = parseMoneyValue(value);
            }
            else if (dbCol === "ano_fabricacao") {
              record[dbCol] = value ? parseInt(String(value)) || null : null;
            }
            else {
              record[dbCol] = value || null;
            }
          });
          
          return record;
        });

        const { error: batchError } = await supabase
          .from("sga_eventos")
          .insert(records);

        if (batchError) {
          console.error("Erro no batch:", batchError);
          throw batchError;
        }

        setProgress(30 + Math.round((i + 1) / totalBatches * 70));
      }

      // Registrar log de importação
      await registrarLog({
        modulo: "sga_insights",
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
              <Button variant="outline" size="sm" onClick={downloadSGATemplate}>
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
                  {preview.map((row, i) => {
                    const keys = Object.keys(row);
                    return (
                      <tr key={i} className="border-b">
                        {keys.slice(0, 6).map((key, j) => {
                          const val = row[key];
                          const isDateColumn = DATE_COLUMNS.some(dc => 
                            normalizeHeader(key) === normalizeHeader(dc)
                          );
                          const displayVal = isDateColumn ? formatExcelDateForPreview(val) : String(val);
                          return (
                            <td key={j} className="p-2 truncate max-w-[120px]">
                              {displayVal}
                            </td>
                          );
                        })}
                        <td className="p-2 text-muted-foreground">...</td>
                      </tr>
                    );
                  })}
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
              {SGA_TEMPLATE_COLUMNS.map((col) => (
                <span key={col} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">
                  {col}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Histórico de Importações */}
      <SGAHistoricoImportacoes 
        corretoraId={corretoraId} 
        onActivate={onImportSuccess}
      />
    </div>
  );
}
