import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, CheckCircle2, Loader2, AlertCircle, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import EstudoBaseHistoricoImportacoes from "./EstudoBaseHistoricoImportacoes";
import { useBIAuditLog } from "@/hooks/useBIAuditLog";

// Column mapping from Excel headers to DB fields
const COLUMN_MAP: Record<string, string> = {
  "PLACA": "placa",
  "TIPO VEICULO": "tipo_veiculo",
  "TIPO VEÍCULO": "tipo_veiculo",
  "MONTADORA": "montadora",
  "ANO FAB.": "ano_fabricacao",
  "ANO FAB": "ano_fabricacao",
  "ANO FABRICACAO": "ano_fabricacao",
  "ANO FABRICAÇÃO": "ano_fabricacao",
  "COTA": "cota",
  "COMBUSTIVEL": "combustivel",
  "COMBUSTÍVEL": "combustivel",
  "VALOR PROTEGIDO": "valor_protegido",
  "COOPERATIVA": "cooperativa",
  "N DE PASSAGEIROS": "num_passageiros",
  "Nº DE PASSAGEIROS": "num_passageiros",
  "N° DE PASSAGEIROS": "num_passageiros",
  "NUMERO DE PASSAGEIROS": "num_passageiros",
  "SITUACAO VEICULO": "situacao_veiculo",
  "SITUAÇÃO VEÍCULO": "situacao_veiculo",
  "SITUACAO": "situacao_veiculo",
  "SITUAÇÃO": "situacao_veiculo",
  "LOGRADOURO": "logradouro",
  "CIDADE VEICULO": "cidade_veiculo",
  "CIDADE VEÍCULO": "cidade_veiculo",
  "DATA CONTRATO": "data_contrato",
  "MOTIVO EVENTO": "motivo_evento",
  "PONTOS": "pontos",
  "MODELO": "modelo",
  "ANO MOD.": "ano_modelo",
  "ANO MOD": "ano_modelo",
  "ANO MODELO": "ano_modelo",
  "CATEGORIA": "categoria",
  "COR": "cor",
  "VALOR FIPE VEICULO": "valor_fipe",
  "VALOR FIPE VEÍCULO": "valor_fipe",
  "VALOR FIPE": "valor_fipe",
  "VOLUNTARIO": "voluntario",
  "VOLUNTÁRIO": "voluntario",
  "ALIENACAO": "alienacao",
  "ALIENAÇÃO": "alienacao",
  "BAIRRO": "bairro",
  "ESTADO": "estado",
  "QTDE. EVENTO": "qtde_evento",
  "QTDE EVENTO": "qtde_evento",
  "QUANTIDADE EVENTO": "qtde_evento",
  "DATA ULTIMO EVENTO": "data_ultimo_evento",
  "DATA ÚLTIMO EVENTO": "data_ultimo_evento",
  "SPA - SERVICO DE PROTECAO A ASSOCIACOES (SBL)": "spa",
  "SPA": "spa",
  "GARAGEM": "garagem",
  "ALERTA USUARIO": "alerta_usuario",
  "BOLETO FISICO": "boleto_fisico",
  "BOLETO FÍSICO": "boleto_fisico",
  "SEXO": "sexo",
  "IDADE ASSOCIADO": "idade_associado",
  "PROFISSAO": "profissao",
  "PROFISSÃO": "profissao",
  "ESTADO CIVIL ASSOCIADO": "estado_civil",
  "ESTADO CIVIL": "estado_civil",
  "VENCIMENTO": "vencimento",
  "SITUACAO SPC/SERASA": "situacao_spc",
  "SITUAÇÃO SPC/SERASA": "situacao_spc",
  "REGIONAL": "regional",
};

const normalizeHeader = (header: string): string =>
  header.trim().toUpperCase().replace(/\s+/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Remove unpaired unicode surrogates that break Postgres JSON parsing */
const sanitizeString = (value: any): string | null => {
  if (value === undefined || value === null || value === "") return null;
  const str = String(value).trim();
  if (!str) return null;
  // Remove lone surrogates (high without low, or low without high)
  return str.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
            .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
};

const getValueFromRow = (row: any, targetHeader: string): any => {
  if (row[targetHeader] !== undefined) return row[targetHeader];
  const normalizedTarget = normalizeHeader(targetHeader);
  for (const key of Object.keys(row)) {
    if (normalizeHeader(key) === normalizedTarget) return row[key];
  }
  return undefined;
};

const parseExcelDate = (value: any): string | null => {
  if (!value) return null;
  if (typeof value === "number") {
    if (value < 1 || value > 100000) return null;
    try {
      const date = new Date((value - 25569) * 86400 * 1000);
      if (isNaN(date.getTime()) || date.getFullYear() < 1900 || date.getFullYear() > 2100) return null;
      return date.toISOString().split("T")[0];
    } catch { return null; }
  }
  if (typeof value === "string") {
    const parts = value.split("/");
    if (parts.length === 3) {
      const [p1, p2, p3] = parts;
      const day = parseInt(p1), month = parseInt(p2);
      let year = parseInt(p3);
      if (year < 100) year += 2000;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100)
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return null;
};

const parseMoneyValue = (value: any): number => {
  if (!value) return 0;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", ".").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

// Extract regional from cooperativa field (e.g. "REGIONAL CAMARAGIBE - PE ( D&E)" -> keep as is, but also check for dedicated REGIONAL column)
const extractRegional = (row: any): string | null => {
  // First check dedicated REGIONAL column
  for (const key of Object.keys(row)) {
    if (normalizeHeader(key) === "REGIONAL") return row[key] || null;
  }
  // Fallback: extract from cooperativa
  const coop = getValueFromRow(row, "COOPERATIVA");
  if (coop && typeof coop === "string") return coop;
  return null;
};

interface Props {
  onImportSuccess: () => void;
  corretoraId: string;
  corretoraNome: string;
}

export default function EstudoBaseImportacao({ onImportSuccess, corretoraId, corretoraNome }: Props) {
  const { registrarLog } = useBIAuditLog();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      
      // Find header row (heuristic: look for PLACA)
      let dataRows = jsonData;
      const headerRow = jsonData.findIndex((row: any) => {
        const keys = Object.values(row).map(v => String(v).toUpperCase());
        return keys.some(k => k.includes("PLACA"));
      });
      if (headerRow >= 0) {
        // Re-read with correct header
        const allRows = XLSX.utils.sheet_to_json(firstSheet, { defval: "", header: 1 }) as any[][];
        const headers = allRows[headerRow].map((h: any) => String(h).trim());
        dataRows = allRows.slice(headerRow + 1)
          .filter((row: any[]) => row.some(cell => cell !== ""))
          .map((row: any[]) => {
            const obj: any = {};
            headers.forEach((h, i) => { obj[h] = row[i] ?? ""; });
            return obj;
          });
      }
      
      setPreview(dataRows.slice(0, 5));
    } catch (error) {
      console.error("Erro ao ler preview:", error);
      toast.error("Erro ao ler arquivo");
    }
  };

  const handleImport = async () => {
    if (!file || !corretoraId) { toast.error("Selecione um arquivo e uma associação"); return; }
    setImporting(true);
    setProgress(0);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      
      // Parse with heuristic header detection
      const allRows = XLSX.utils.sheet_to_json(firstSheet, { defval: "", header: 1 }) as any[][];
      const headerRowIdx = allRows.findIndex((row: any[]) => {
        const vals = row.map(v => String(v).toUpperCase());
        return vals.some(k => k.includes("PLACA")) && vals.some(k => k.includes("MODELO") || k.includes("MONTADORA"));
      });

      let jsonData: any[];
      if (headerRowIdx >= 0) {
        const headers = allRows[headerRowIdx].map((h: any) => String(h).trim());
        jsonData = allRows.slice(headerRowIdx + 1)
          .filter((row: any[]) => row.some(cell => cell !== "" && cell !== undefined))
          .map((row: any[]) => {
            const obj: any = {};
            headers.forEach((h, i) => { obj[h] = row[i] ?? ""; });
            return obj;
          })
          .filter((row: any) => {
            // Must have at least a placa or modelo
            const placa = getValueFromRow(row, "PLACA");
            return placa && String(placa).trim().length >= 5;
          });
      } else {
        jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
      }

      if (!jsonData.length) { toast.error("Arquivo vazio ou sem dados válidos"); setImporting(false); return; }
      setProgress(10);

      // Deactivate previous imports
      await supabase.from("estudo_base_importacoes").update({ ativo: false }).eq("ativo", true).eq("corretora_id", corretoraId);
      setProgress(20);

      // Create import record
      const { data: importacao, error: impError } = await supabase
        .from("estudo_base_importacoes")
        .insert({ nome_arquivo: file.name, total_registros: jsonData.length, ativo: true, corretora_id: corretoraId })
        .select()
        .single();
      if (impError) throw impError;
      setProgress(30);

      // Process in batches
      const batchSize = 100;
      const totalBatches = Math.ceil(jsonData.length / batchSize);

      for (let i = 0; i < totalBatches; i++) {
        const batch = jsonData.slice(i * batchSize, (i + 1) * batchSize);
        const records = batch.map((row: any) => {
          const record: any = { importacao_id: importacao.id };
          const processedCols = new Set<string>();

          Object.entries(COLUMN_MAP).forEach(([excelCol, dbCol]) => {
            if (processedCols.has(dbCol)) return;
            const value = getValueFromRow(row, excelCol);
            if (value !== undefined && value !== null && value !== "") processedCols.add(dbCol);

            if (dbCol === "data_contrato" || dbCol === "data_ultimo_evento") {
              record[dbCol] = parseExcelDate(value);
            } else if (["valor_protegido", "valor_fipe", "pontos"].includes(dbCol)) {
              record[dbCol] = parseMoneyValue(value);
            } else if (["ano_fabricacao", "ano_modelo", "num_passageiros", "qtde_evento", "vencimento", "idade_associado"].includes(dbCol)) {
              record[dbCol] = value ? parseInt(String(value)) || null : null;
            } else {
              record[dbCol] = sanitizeString(value);
            }
          });

          // Regional fallback
          if (!record.regional) {
            record.regional = extractRegional(row);
          }

          return record;
        });

        const { error: batchError } = await supabase.from("estudo_base_registros").insert(records);
        if (batchError) { console.error("Erro no batch:", batchError); throw batchError; }
        setProgress(30 + Math.round((i + 1) / totalBatches * 70));
      }

      await registrarLog({
        modulo: "estudo_base",
        acao: "importacao",
        descricao: `Importação de ${jsonData.length} registros - ${file.name}`,
        corretoraId,
        dadosNovos: { arquivo: file.name, total_registros: jsonData.length, corretora: corretoraNome },
      });

      toast.success(`${jsonData.length.toLocaleString('pt-BR')} registros importados com sucesso!`);
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
              <p className="text-sm text-muted-foreground mt-1">Para importar dados, selecione uma associação.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Importar Planilha - Estudo de Base
          </CardTitle>
          <CardDescription>
            Importando para: <span className="font-semibold text-foreground">{corretoraNome}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file-eb">Arquivo Excel (.xls, .xlsx)</Label>
            <Input ref={fileInputRef} id="file-eb" type="file" accept=".xlsx,.xls" onChange={handleFileSelect} disabled={importing} />
          </div>

          {file && (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <FileSpreadsheet className="h-8 w-8 text-green-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{file.name}</p>
                <p className="text-sm text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              {preview.length > 0 && (
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-4 w-4" /><span className="text-sm">Válido</span>
                </div>
              )}
            </div>
          )}

          {importing && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-muted-foreground text-center">Importando... {progress}%</p>
            </div>
          )}

          <Button onClick={handleImport} disabled={!file || importing} className="w-full">
            {importing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importando...</> : <><Upload className="h-4 w-4 mr-2" />Importar Dados</>}
          </Button>
        </CardContent>
      </Card>

      {/* Preview */}
      {preview.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Preview (5 primeiras linhas)</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    {Object.keys(preview[0]).slice(0, 8).map((col) => (
                      <th key={col} className="text-left py-2 px-2 font-medium">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-b">
                      {Object.keys(preview[0]).slice(0, 8).map((col) => (
                        <td key={col} className="py-2 px-2 truncate max-w-[150px]">{String(row[col] || "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Histórico */}
      <EstudoBaseHistoricoImportacoes onActivate={onImportSuccess} corretoraId={corretoraId} />
    </div>
  );
}
