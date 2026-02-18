import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import EstudoBaseHistoricoImportacoes from "./EstudoBaseHistoricoImportacoes";
import { useBIAuditLog } from "@/hooks/useBIAuditLog";

/**
 * Normalizes a header string: trim, uppercase, remove accents, collapse spaces.
 * This ensures "Situação Veículo" == "SITUACAO VEICULO"
 */
const normalizeHeader = (header: string): string =>
  String(header ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

/**
 * Lookup table: normalized header -> DB field name.
 */
const COLUMN_MAP_NORMALIZED: Record<string, string> = {
  "PLACA": "placa",
  "RENAVAM": "renavam",
  "TIPO VEICULO": "tipo_veiculo",
  "MONTADORA": "montadora",
  "ANO FAB.": "ano_fabricacao",
  "ANO FAB": "ano_fabricacao",
  "ANO FABRICACAO": "ano_fabricacao",
  "COTA": "cota",
  "COMBUSTIVEL": "combustivel",
  "VALOR PROTEGIDO": "valor_protegido",
  "COOPERATIVA": "cooperativa",
  "N DE PASSAGEIROS": "num_passageiros",
  "NO DE PASSAGEIROS": "num_passageiros",
  "NUMERO DE PASSAGEIROS": "num_passageiros",
  "SITUACAO VEICULO": "situacao_veiculo",
  "SITUACAO DO VEICULO": "situacao_veiculo",
  "SITUACAO": "situacao_veiculo",
  "LOGRADOURO PROPRIETARIO": "logradouro",
  "LOGRADOURO": "logradouro",
  "CIDADE PROPRIETARIO": "cidade_veiculo",
  "CIDADE VEICULO": "cidade_veiculo",
  "CIDADE": "cidade_veiculo",
  "ESTADO PROPRIETARIO": "estado",
  "ESTADO VEICULO": "estado",
  "ESTADO": "estado",
  "UF": "estado",
  "BAIRRO PROPRIETARIO": "bairro",
  "BAIRRO": "bairro",
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
  "VALOR FIPE": "valor_fipe",
  "VOLUNTARIO": "voluntario",
  "ALIENACAO": "alienacao",
  "QTDE. EVENTO": "qtde_evento",
  "QTDE EVENTO": "qtde_evento",
  "QUANTIDADE EVENTO": "qtde_evento",
  "DATA ULTIMO EVENTO": "data_ultimo_evento",
  "SPA - SERVICO DE PROTECAO A ASSOCIACOES (SBL)": "spa",
  "SPA": "spa",
  "GARAGEM": "garagem",
  "ALERTA USUARIO": "alerta_usuario",
  "BOLETO FISICO": "boleto_fisico",
  "SEXO": "sexo",
  "IDADE ASSOCIADO": "idade_associado",
  "PROFISSAO": "profissao",
  "ESTADO CIVIL ASSOCIADO": "estado_civil",
  "ESTADO CIVIL": "estado_civil",
  "VENCIMENTO": "vencimento",
  "SITUACAO SPC/SERASA": "situacao_spc",
  "REGIONAL": "regional",
};

/** Build a map from normalized row key -> db field, given the actual headers in a row */
function buildHeaderMap(rowKeys: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  const processedDbCols = new Set<string>();
  for (const key of rowKeys) {
    const normalized = normalizeHeader(key);
    if (COLUMN_MAP_NORMALIZED[normalized] && !processedDbCols.has(COLUMN_MAP_NORMALIZED[normalized])) {
      result[key] = COLUMN_MAP_NORMALIZED[normalized];
      processedDbCols.add(COLUMN_MAP_NORMALIZED[normalized]);
    }
  }
  return result;
}

/** Remove unpaired unicode surrogates that break Postgres JSON parsing */
const sanitizeString = (value: unknown): string | null => {
  if (value === undefined || value === null || value === "") return null;
  const str = String(value).trim();
  if (!str) return null;
  return str.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
            .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
};

const parseExcelDate = (value: unknown): string | null => {
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
    // Try MM/DD/YY or DD/MM/YY
    const parts = value.split("/");
    if (parts.length === 3) {
      const [p1, p2, p3] = parts;
      let year = parseInt(p3);
      if (year < 100) year += 2000;
      const month = parseInt(p2), day = parseInt(p1);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100)
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      // Try US format: MM/DD/YY
      const monthUs = parseInt(p1), dayUs = parseInt(p2);
      if (monthUs >= 1 && monthUs <= 12 && dayUs >= 1 && dayUs <= 31 && year >= 1900 && year <= 2100)
        return `${year}-${String(monthUs).padStart(2, "0")}-${String(dayUs).padStart(2, "0")}`;
    }
  }
  return null;
};

/**
 * Parse money value - handles both PT-BR (1.234,56) and US (1,234.56) formats
 * and "R$ 25,529.00" style (US format with R$ prefix)
 */
const parseMoneyValue = (value: unknown): number => {
  if (!value) return 0;
  if (typeof value === "number") return value;
  let cleaned = String(value).replace(/R\$\s*/g, "").trim();
  if (!cleaned) return 0;

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");

  if (lastDot === -1 && lastComma === -1) {
    return parseFloat(cleaned) || 0;
  }

  if (lastDot > lastComma) {
    // US format: 25,529.00 -> remove commas
    cleaned = cleaned.replace(/,/g, "");
  } else {
    // PT-BR format: 25.529,00 -> remove dots, replace comma with dot
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
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
  const [progressLabel, setProgressLabel] = useState("");
  const [preview, setPreview] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Parse sheet rows using heuristic header detection.
   * Returns array of objects with original header keys.
   */
  const parseSheet = (firstSheet: XLSX.WorkSheet): any[] => {
    const allRows = XLSX.utils.sheet_to_json(firstSheet, { defval: "", header: 1 }) as unknown[][];
    const headerRowIdx = allRows.findIndex((row) => {
      const vals = (row as unknown[]).map((v) => normalizeHeader(String(v)));
      return vals.some((k) => k === "PLACA") && vals.some((k) => k === "MODELO" || k === "MONTADORA");
    });

    if (headerRowIdx < 0) {
      return XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
    }

    const headers = (allRows[headerRowIdx] as unknown[]).map((h) => String(h ?? "").trim());
    return allRows
      .slice(headerRowIdx + 1)
      .filter((row) => (row as unknown[]).some((cell) => cell !== "" && cell !== undefined && cell !== null))
      .map((row) => {
        const obj: Record<string, unknown> = {};
        headers.forEach((h, i) => { obj[h] = (row as unknown[])[i] ?? ""; });
        return obj;
      })
      .filter((row) => {
        const placa = row["Placa"] ?? row["PLACA"] ?? Object.values(row)[0];
        return placa && String(placa).trim().length >= 5;
      });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setPreview([]);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const dataRows = parseSheet(firstSheet);
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
    setProgressLabel("Lendo arquivo...");

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = parseSheet(firstSheet);

      if (!jsonData.length) { toast.error("Arquivo vazio ou sem dados válidos"); setImporting(false); return; }
      setProgress(10);
      setProgressLabel("Preparando importação...");

      // Deactivate previous imports
      await supabase.from("estudo_base_importacoes").update({ ativo: false }).eq("ativo", true).eq("corretora_id", corretoraId);
      setProgress(15);

      // Create import record
      const { data: importacao, error: impError } = await supabase
        .from("estudo_base_importacoes")
        .insert({ nome_arquivo: file.name, total_registros: jsonData.length, ativo: true, corretora_id: corretoraId })
        .select()
        .single();
      if (impError) throw impError;
      setProgress(20);

      // Build header map once from first row
      const headerMap = buildHeaderMap(Object.keys(jsonData[0] || {}));

      // Process in larger batches for performance
      const BATCH_SIZE = 500;
      const totalBatches = Math.ceil(jsonData.length / BATCH_SIZE);

      for (let i = 0; i < totalBatches; i++) {
        const batch = jsonData.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
        const records = batch.map((row: Record<string, unknown>) => {
          const record: Record<string, unknown> = { importacao_id: importacao.id };

          for (const [excelKey, dbCol] of Object.entries(headerMap)) {
            const value = row[excelKey];
            if (value === undefined || value === null || value === "") continue;

            if (dbCol === "data_contrato" || dbCol === "data_ultimo_evento") {
              record[dbCol] = parseExcelDate(value);
            } else if (["valor_protegido", "valor_fipe", "pontos"].includes(dbCol)) {
              const parsed = parseMoneyValue(value);
              record[dbCol] = parsed > 0 ? parsed : null;
            } else if (["ano_fabricacao", "ano_modelo", "num_passageiros", "qtde_evento", "vencimento", "idade_associado"].includes(dbCol)) {
              const parsed = parseInt(String(value));
              record[dbCol] = isNaN(parsed) ? null : parsed;
            } else if (dbCol === "cidade_veiculo" || dbCol === "estado") {
              // Normalize accents and special chars in city/state names
              const raw = sanitizeString(value);
              if (raw) {
                record[dbCol] = raw
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .toUpperCase()
                  .replace(/[^A-Z0-9\s\-\.]/g, "")
                  .replace(/\s+/g, " ")
                  .trim();
              } else {
                record[dbCol] = null;
              }
            } else {
              record[dbCol] = sanitizeString(value);
            }
          }

          // Regional fallback: if no dedicated column, use cooperativa
          if (!record.regional && record.cooperativa) {
            record.regional = record.cooperativa;
          }

          return record;
        });

        const { error: batchError } = await supabase.from("estudo_base_registros").insert(records as any);
        if (batchError) { console.error("Erro no batch:", batchError); throw batchError; }

        const pct = 20 + Math.round((i + 1) / totalBatches * 78);
        setProgress(pct);
        setProgressLabel(`Inserindo registros... ${Math.min((i + 1) * BATCH_SIZE, jsonData.length).toLocaleString("pt-BR")} / ${jsonData.length.toLocaleString("pt-BR")}`);
      }

      await registrarLog({
        modulo: "estudo_base",
        acao: "importacao",
        descricao: `Importação de ${jsonData.length} registros - ${file.name}`,
        corretoraId,
        dadosNovos: { arquivo: file.name, total_registros: jsonData.length, corretora: corretoraNome },
      });

      setProgress(100);
      toast.success(`${jsonData.length.toLocaleString('pt-BR')} registros importados com sucesso!`);
      setFile(null);
      setPreview([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onImportSuccess();
    } catch (error: unknown) {
      console.error("Erro na importação:", error);
      toast.error("Erro ao importar: " + ((error as Error).message || "Erro desconhecido"));
    } finally {
      setImporting(false);
      setProgress(0);
      setProgressLabel("");
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
              <p className="text-sm text-muted-foreground text-center">{progressLabel || `Importando... ${progress}%`}</p>
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
