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

interface SGAImportacaoProps {
  onImportSuccess: () => void;
  corretoraId: string;
  corretoraNome: string;
}

// Mapeamento de colunas do Excel para campos do banco
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
  "ASSOCIADO ESTADO": "associado_estado"
};

// Função para converter data do Excel
const parseExcelDate = (value: any): string | null => {
  if (!value) return null;
  
  // Se for número (serial date do Excel)
  if (typeof value === "number") {
    const date = new Date((value - 25569) * 86400 * 1000);
    return date.toISOString().split("T")[0];
  }
  
  // Se for string no formato MM/DD/YY ou DD/MM/YY
  if (typeof value === "string") {
    const parts = value.split("/");
    if (parts.length === 3) {
      const [p1, p2, p3] = parts;
      // Assumir formato M/D/YY (americano)
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

// Função para converter valor monetário
const parseMoneyValue = (value: any): number => {
  if (!value) return 0;
  if (typeof value === "number") return value;
  
  // Remover "R$", espaços e converter vírgula para ponto
  const cleaned = String(value)
    .replace(/R\$\s*/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

export default function SGAImportacao({ onImportSuccess, corretoraId, corretoraNome }: SGAImportacaoProps) {
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

    // Ler preview das primeiras linhas
    try {
      const buffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
      
      // Pegar apenas 5 primeiras linhas como preview
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
      // Ler arquivo completo
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });

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
          
          Object.entries(COLUMN_MAP).forEach(([excelCol, dbCol]) => {
            const value = row[excelCol];
            
            // Campos de data
            if (dbCol.startsWith("data_")) {
              record[dbCol] = parseExcelDate(value);
            }
            // Campos de valor monetário
            else if (["valor_reparo", "custo_evento", "valor_mao_de_obra", "participacao", "previsao_valor_reparo", "valor_protegido_veiculo"].includes(dbCol)) {
              record[dbCol] = parseMoneyValue(value);
            }
            // Ano fabricação
            else if (dbCol === "ano_fabricacao") {
              record[dbCol] = value ? parseInt(String(value)) || null : null;
            }
            // Texto normal
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
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Importar Planilha do SGA
          </CardTitle>
          <CardDescription>
            Importando dados para: <span className="font-semibold text-foreground">{corretoraNome}</span>
            <br />
            Selecione um arquivo Excel (.xlsx) exportado do SGA. A nova importação irá sobrepor os dados anteriores desta associação.
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
    </div>
  );
}
