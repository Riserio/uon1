import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const TEMPLATE_COLUMNS = [
  "NOME", "CPF", "PLACA", "MARCA", "MODELO", "ANO",
  "SITUACAO", "REGIONAL", "COOPERATIVA", "CIDADE", "ESTADO",
  "DATA CADASTRO", "DATA ADESAO", "VALOR PROTEGIDO"
];

const downloadTemplate = () => {
  const ws = XLSX.utils.aoa_to_sheet([
    TEMPLATE_COLUMNS,
    ["João Silva", "123.456.789-00", "ABC1234", "FIAT", "ARGO", "2022", "ATIVO", "Regional Sul", "Cooperativa A", "Belo Horizonte", "MG", "01/01/2024", "15/02/2024", "45000.00"]
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Modelo Cadastro");
  XLSX.writeFile(wb, "modelo_cadastro_importacao.xlsx");
  toast.success("Modelo baixado!");
};

interface Props {
  onImportSuccess: () => void;
  corretoraId: string;
  corretoraNome: string;
}

export default function CadastroImportacao({ onImportSuccess, corretoraId, corretoraNome }: Props) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ total: number; success: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const normalizeHeader = (h: string) => {
    const normalized = (h || "").toString().trim().toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ");
    
    const mapping: Record<string, string> = {
      "NOME": "nome", "NOME ASSOCIADO": "nome", "ASSOCIADO": "nome",
      "CPF": "cpf", "CPF CNPJ": "cpf",
      "PLACA": "placa", "PLACAS": "placa", "PLACA VEICULO": "placa",
      "MARCA": "marca_veiculo", "MARCA VEICULO": "marca_veiculo", "MONTADORA": "marca_veiculo",
      "MODELO": "modelo_veiculo", "MODELO VEICULO": "modelo_veiculo",
      "ANO": "ano_veiculo", "ANO MODELO": "ano_veiculo", "ANO VEICULO": "ano_veiculo",
      "SITUACAO": "situacao", "STATUS": "situacao", "SITUACAO ASSOCIADO": "situacao",
      "REGIONAL": "regional", "REGIONAL BOLETO": "regional",
      "COOPERATIVA": "cooperativa",
      "CIDADE": "cidade", "MUNICIPIO": "cidade",
      "ESTADO": "estado", "UF": "estado",
      "DATA CADASTRO": "data_cadastro", "DATA DE CADASTRO": "data_cadastro",
      "DATA ADESAO": "data_adesao", "DATA DE ADESAO": "data_adesao",
      "VALOR PROTEGIDO": "valor_protegido", "VALOR FIPE": "valor_protegido", "VALOR FIPE VEICULO": "valor_protegido",
    };
    return mapping[normalized] || null;
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setProgress(10);
    setResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      if (raw.length < 2) throw new Error("Planilha vazia");

      const headers = raw[0].map((h: any) => normalizeHeader(String(h)));
      const rows = raw.slice(1).filter((r: any[]) => r.some(c => c !== ""));

      setProgress(30);

      // Create import record
      const { data: importacao, error: impErr } = await supabase.from("cadastro_importacoes").insert({
        corretora_id: corretoraId,
        nome_arquivo: file.name,
        total_registros: rows.length,
        ativo: true,
      }).select().single();

      if (impErr) throw impErr;

      // Deactivate previous
      await supabase.from("cadastro_importacoes").update({ ativo: false })
        .eq("corretora_id", corretoraId).neq("id", importacao.id);

      setProgress(50);

      // Process rows in batches
      const BATCH = 2000;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH).map((row: any[]) => {
          const record: any = { importacao_id: importacao.id };
          const extras: any = {};
          
          headers.forEach((mapped: string | null, idx: number) => {
            const val = row[idx] !== undefined ? String(row[idx]).trim() : "";
            if (!val) return;
            if (mapped) {
              if (mapped === "valor_protegido") {
                record[mapped] = parseFloat(val.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
              } else {
                record[mapped] = val;
              }
            } else {
              extras[String(raw[0][idx])] = val;
            }
          });

          if (Object.keys(extras).length > 0) record.dados_extras = extras;
          return record;
        });

        const { error } = await supabase.from("cadastro_registros").insert(batch);
        if (error) console.error("Batch error:", error);
        setProgress(50 + Math.round((i / rows.length) * 45));
      }

      setProgress(100);
      setResult({ total: rows.length, success: true });
      toast.success(`${rows.length.toLocaleString()} registros importados!`);
      onImportSuccess();
    } catch (err: any) {
      toast.error(err.message || "Erro na importação");
      setResult({ total: 0, success: false });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Cadastro
          </CardTitle>
          <CardDescription>
            Importe a planilha de cadastro de associados para {corretoraNome}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />Baixar Modelo
            </Button>
          </div>

          <div className="border-2 border-dashed rounded-xl p-8 text-center">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} className="hidden" id="cadastro-upload" />
            <label htmlFor="cadastro-upload" className="cursor-pointer">
              {uploading ? (
                <div className="space-y-3">
                  <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
                  <p className="text-sm">Processando...</p>
                  <Progress value={progress} className="max-w-xs mx-auto" />
                </div>
              ) : result ? (
                <div className="space-y-2">
                  {result.success ? (
                    <>
                      <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-600" />
                      <p className="text-sm font-medium">{result.total.toLocaleString()} registros importados</p>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-10 w-10 mx-auto text-red-600" />
                      <p className="text-sm text-red-600">Erro na importação</p>
                    </>
                  )}
                  <p className="text-xs text-muted-foreground">Clique para importar outro arquivo</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground" />
                  <p className="text-sm font-medium">Arraste ou clique para selecionar</p>
                  <p className="text-xs text-muted-foreground">Formatos: .xlsx, .xls, .csv</p>
                </div>
              )}
            </label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
