import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import MGFHistoricoImportacoes from "./MGFHistoricoImportacoes";
import { useBIAuditLog } from "@/hooks/useBIAuditLog";

interface MGFImportacaoProps {
  onImportSuccess: () => void;
  corretoraId: string;
  corretoraNome: string;
}

// Mapeamento de colunas do Excel para campos do banco
const COLUMN_MAP: { [key: string]: string } = {
  "DATA EVENTO": "data_evento",
  "DATA_EVENTO": "data_evento",
  "DATA CADASTRO": "data_cadastro",
  "DATA_CADASTRO": "data_cadastro",
  "TIPO EVENTO": "tipo_evento",
  "TIPO_EVENTO": "tipo_evento",
  "TIPO": "tipo_evento",
  "SITUACAO": "situacao",
  "SITUAÇÃO": "situacao",
  "STATUS": "status",
  "VALOR": "valor",
  "CUSTO": "custo",
  "CUSTO EVENTO": "custo",
  "PLACA": "placa",
  "MODELO": "modelo_veiculo",
  "MODELO VEICULO": "modelo_veiculo",
  "MODELO_VEICULO": "modelo_veiculo",
  "COOPERATIVA": "cooperativa",
  "REGIONAL": "regional",
  "CLASSIFICACAO": "classificacao",
  "CLASSIFICAÇÃO": "classificacao",
};

const normalizeHeader = (header: string): string => {
  return header.trim().toUpperCase().replace(/\s+/g, " ");
};

const parseExcelDate = (value: any): string | null => {
  if (!value) return null;
  
  if (typeof value === "number") {
    const date = new Date((value - 25569) * 86400 * 1000);
    return date.toISOString().split("T")[0];
  }
  
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

export default function MGFImportacao({ onImportSuccess, corretoraId, corretoraNome }: MGFImportacaoProps) {
  const { registrarLog } = useBIAuditLog();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setPreview([]);
    setHeaders([]);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
      
      const detectedHeaders = Object.keys(jsonData[0] || {});
      console.log("Headers detectados:", detectedHeaders);
      
      setHeaders(detectedHeaders);
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
      
      const detectedHeaders = Object.keys(jsonData[0] || {});

      if (!jsonData.length) {
        toast.error("Arquivo vazio ou sem dados válidos");
        setImporting(false);
        return;
      }

      setProgress(10);

      // Desativar importações anteriores
      await supabase
        .from("mgf_importacoes")
        .update({ ativo: false })
        .eq("ativo", true)
        .eq("corretora_id", corretoraId);

      setProgress(20);

      // Criar nova importação
      const { data: importacao, error: impError } = await supabase
        .from("mgf_importacoes")
        .insert({
          nome_arquivo: file.name,
          total_registros: jsonData.length,
          colunas_detectadas: detectedHeaders,
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
          const record: any = { 
            importacao_id: importacao.id,
            dados_extras: {}
          };
          
          const processedDbCols = new Set<string>();
          
          // Mapear colunas conhecidas
          Object.entries(row).forEach(([excelCol, value]) => {
            const normalizedCol = normalizeHeader(excelCol);
            const dbCol = COLUMN_MAP[normalizedCol];
            
            if (dbCol && !processedDbCols.has(dbCol)) {
              processedDbCols.add(dbCol);
              
              if (dbCol.startsWith("data_")) {
                record[dbCol] = parseExcelDate(value);
              } else if (["valor", "custo"].includes(dbCol)) {
                record[dbCol] = parseMoneyValue(value);
              } else {
                record[dbCol] = value || null;
              }
            } else if (!dbCol) {
              // Guardar colunas não mapeadas em dados_extras
              record.dados_extras[excelCol] = value;
            }
          });
          
          return record;
        });

        const { error: batchError } = await supabase
          .from("mgf_dados")
          .insert(records);

        if (batchError) {
          console.error("Erro no batch:", batchError);
          throw batchError;
        }

        setProgress(30 + Math.round((i + 1) / totalBatches * 70));
      }

      // Registrar log
      await registrarLog({
        modulo: "mgf_insights",
        acao: "importacao",
        descricao: `Importação de ${jsonData.length} registros - ${file.name}`,
        corretoraId,
        dadosNovos: {
          arquivo: file.name,
          total_registros: jsonData.length,
          corretora: corretoraNome,
          colunas: detectedHeaders,
        },
      });

      toast.success(`${jsonData.length} registros importados com sucesso para ${corretoraNome}!`);
      setFile(null);
      setPreview([]);
      setHeaders([]);
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
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-orange-500" />
            Importar Planilha MGF
          </CardTitle>
          <CardDescription>
            Importando dados para: <span className="font-semibold text-foreground">{corretoraNome}</span>
            <br />
            Selecione um arquivo Excel (.xlsx) com os dados MGF. A nova importação irá sobrepor os dados anteriores desta associação.
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
              <FileSpreadsheet className="h-8 w-8 text-green-600" />
              <div className="flex-1">
                <p className="font-medium">{file.name}</p>
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

          {headers.length > 0 && (
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <p className="text-sm font-medium text-blue-600 mb-2">
                {headers.length} colunas detectadas:
              </p>
              <div className="flex flex-wrap gap-1">
                {headers.slice(0, 15).map((h, i) => (
                  <span key={i} className="text-xs bg-blue-500/20 text-blue-700 px-2 py-0.5 rounded">
                    {h}
                  </span>
                ))}
                {headers.length > 15 && (
                  <span className="text-xs text-muted-foreground">+{headers.length - 15} mais</span>
                )}
              </div>
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
            className="w-full bg-orange-500 hover:bg-orange-600"
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
            <CardTitle className="text-base">Preview dos Dados (5 primeiras linhas)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    {Object.keys(preview[0]).slice(0, 8).map((col) => (
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
                      {Object.values(row).slice(0, 8).map((val: any, j) => (
                        <td key={j} className="p-2 truncate max-w-[150px]">
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

      {/* Info */}
      <Card className="border-yellow-500/20 bg-yellow-500/5">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-yellow-600">Importante</p>
              <p className="text-muted-foreground mt-1">
                Ao importar uma nova planilha, ela se tornará a fonte de dados ativa para <strong>{corretoraNome}</strong>. 
                As importações anteriores ficam salvas no histórico e podem ser reativadas a qualquer momento.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Histórico de Importações */}
      <MGFHistoricoImportacoes 
        onActivate={onImportSuccess} 
        corretoraId={corretoraId}
      />
    </div>
  );
}
