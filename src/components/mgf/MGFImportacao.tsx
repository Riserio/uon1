import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import MGFHistoricoImportacoes from "./MGFHistoricoImportacoes";
// Automação agora é gerenciada pelo BISyncButton no header
import { useBIAuditLog } from "@/hooks/useBIAuditLog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface MGFImportacaoProps {
  onImportSuccess: () => void;
  corretoraId: string;
  corretoraNome: string;
}

// Mapeamento completo de colunas do Excel para campos do banco
const COLUMN_MAP: { [key: string]: string } = {
  // Colunas principais
  "OPERACAO": "operacao",
  "OPERAÇÃO": "operacao",
  "SUBOPERACAO": "sub_operacao",
  "SUBOPERAÇÃO": "sub_operacao",
  "SUB OPERACAO": "sub_operacao",
  "SUB OPERAÇÃO": "sub_operacao",
  "DESCRICAO": "descricao",
  "DESCRIÇÃO": "descricao",
  "NOTA FISCAL": "nota_fiscal",
  "NOTAFISCAL": "nota_fiscal",
  "VALOR": "valor",
  "VALOR TOTAL LANCAMENTO": "valor_total_lancamento",
  "VALOR TOTAL LANÇAMENTO": "valor_total_lancamento",
  "VALORTOTALLANCAMENTO": "valor_total_lancamento",
  "VALOR PAGAMENTO": "valor_pagamento",
  "VALORPAGAMENTO": "valor_pagamento",
  "DATA NOTA FISCAL": "data_nota_fiscal",
  "DATANOTAFISCAL": "data_nota_fiscal",
  "DATA VENCIMENTO": "data_vencimento",
  "DATAVENCIMENTO": "data_vencimento",
  "SITUACAO": "situacao_pagamento",
  "SITUAÇÃO": "situacao_pagamento",
  "QUANTIDADE PARCELA": "quantidade_parcela",
  "QUANTIDADEPARCELA": "quantidade_parcela",
  "FORMA PAGAMENTO": "forma_pagamento",
  "FORMAPAGAMENTO": "forma_pagamento",
  "DATA VENCIMENTO ORIGINAL": "data_vencimento_original",
  "DATAVENCIMENTOORIGINAL": "data_vencimento_original",
  "DATA PAGAMENTO": "data_pagamento",
  "DATAPAGAMENTO": "data_pagamento",
  "CONTROLE INTERNO": "controle_interno",
  "CONTROLEINTERNO": "controle_interno",
  "VEICULO LANCAMENTO": "veiculo_lancamento",
  "VEICULOLANCAMENTO": "veiculo_lancamento",
  "VEÍCULO LANÇAMENTO": "veiculo_lancamento",
  "TIPO DE VEICULO": "tipo_veiculo",
  "TIPO DE VEÍCULO": "tipo_veiculo",
  "TIPOVEICULO": "tipo_veiculo",
  "CLASSIFICACAO VEICULO LANCAMENTO": "classificacao_veiculo",
  "CLASSIFICAÇÃO VEICULO LANÇAMENTO": "classificacao_veiculo",
  "CLASSIFICAÇÃO VEÍCULO LANÇAMENTO": "classificacao_veiculo",
  "ASSOCIADO": "associado",
  "CNPJ FORNECEDOR": "cnpj_fornecedor",
  "CNPJFORNECEDOR": "cnpj_fornecedor",
  "CPF/CNPJ CLIENTE": "cpf_cnpj_cliente",
  "CPFCNPJCLIENTE": "cpf_cnpj_cliente",
  "CPF CNPJ CLIENTE": "cpf_cnpj_cliente",
  "FORNECEDOR": "fornecedor",
  "NOME FANTASIA FORNECEDOR": "nome_fantasia_fornecedor",
  "NOMEFANTASIAFORNECEDOR": "nome_fantasia_fornecedor",
  "VOLUNTARIO": "voluntario",
  "VOLUNTÁRIO": "voluntario",
  "COOPERATIVA": "cooperativa",
  "CENTRO DE CUSTO/DEPARTAMENTO": "centro_custo",
  "CENTRO DE CUSTO DEPARTAMENTO": "centro_custo",
  "CENTROCUSTO": "centro_custo",
  "MULTA": "multa",
  "JUROS": "juros",
  "MES REFERENTE": "mes_referente",
  "MÊS REFERENTE": "mes_referente",
  "MESREFERENTE": "mes_referente",
  "REGIONAL": "regional",
  "CATEGORIA VEICULO": "categoria_veiculo",
  "CATEGORIA VEÍCULO": "categoria_veiculo",
  "CATEGORIAVEICULO": "categoria_veiculo",
  "IMPOSTOS": "impostos",
  "PROTOCOLO EVENTO": "protocolo_evento",
  "PROTOCOLOEVENTO": "protocolo_evento",
  "VEICULO EVENTO": "veiculo_evento",
  "VEÍCULO EVENTO": "veiculo_evento",
  "VEICULOEVENTO": "veiculo_evento",
  "MOTIVO EVENTO": "motivo_evento",
  "MOTIVOEVENTO": "motivo_evento",
  "TERCEIRO (EVENTO)": "terceiro_evento",
  "TERCEIRO EVENTO": "terceiro_evento",
  "TERCEIROEVENTO": "terceiro_evento",
  "DATA EVENTO": "data_evento",
  "DATAEVENTO": "data_evento",
  "REGIONAL EVENTO": "regional_evento",
  "REGIONALEVENTO": "regional_evento",
  "PLACA TERCEIRO (EVENTO)": "placa_terceiro_evento",
  "PLACA TERCEIRO EVENTO": "placa_terceiro_evento",
  "PLACATERCEIROEVENTO": "placa_terceiro_evento",
  // Campos legados
  "DATA CADASTRO": "data_cadastro",
  "TIPO EVENTO": "tipo_evento",
  "STATUS": "status",
  "CUSTO": "custo",
  "PLACA": "placa",
  "MODELO": "modelo_veiculo",
  "MODELO VEICULO": "modelo_veiculo",
  "CLASSIFICACAO": "classificacao",
  "CLASSIFICAÇÃO": "classificacao",
};

// Template columns for MGF
const MGF_TEMPLATE_COLUMNS = [
  "Operação",
  "SubOperação",
  "Descrição",
  "Nota Fiscal",
  "Valor",
  "Valor Total Lançamento",
  "Valor Pagamento",
  "Data Nota Fiscal",
  "Data Vencimento",
  "Situacao",
  "Quantidade Parcela",
  "Forma Pagamento",
  "Data Vencimento Original",
  "Data Pagamento",
  "Controle Interno",
  "Veiculo Lancamento",
  "Tipo de Veículo",
  "Classificação Veiculo Lancamento",
  "Associado",
  "CNPJ Fornecedor",
  "Cpf/Cnpj Cliente",
  "Fornecedor",
  "Nome Fantasia Fornecedor",
  "Voluntario",
  "Cooperativa",
  "Centro de Custo/Departamento",
  "Multa",
  "Juros",
  "Mês Referente",
  "Regional",
  "Categoria Veículo",
  "Impostos",
  "Protocolo Evento",
  "Veiculo Evento",
  "Motivo Evento",
  "Terceiro (Evento)",
  "Data Evento",
  "Regional Evento",
  "Placa Terceiro (Evento)"
];

const downloadMGFTemplate = () => {
  const ws = XLSX.utils.aoa_to_sheet([
    MGF_TEMPLATE_COLUMNS,
    [
      "Despesa", "Manutenção", "Reparo veículo ABC", "NF-001", "1500.00", "1500.00", "1500.00",
      "01/01/2024", "15/01/2024", "Pago", "1", "PIX", "15/01/2024", "14/01/2024",
      "CTRL-001", "ABC1234", "Passeio", "Frota", "João Silva", "12.345.678/0001-90",
      "123.456.789-00", "Oficina Central", "Oficina Central Ltda", "Não", "Cooperativa A",
      "Manutenção", "0", "0", "Janeiro", "Sul", "Passeio", "0", "EVT-001",
      "ABC1234", "Colisão", "Não", "01/01/2024", "Sul", ""
    ]
  ]);
  
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Modelo MGF");
  XLSX.writeFile(wb, "modelo_mgf_importacao.xlsx");
  toast.success("Modelo baixado com sucesso!");
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
    // Try DD/MM/YYYY format first (Brazilian)
    let parts = value.split("/");
    if (parts.length === 3) {
      let day = parseInt(parts[0]);
      let month = parseInt(parts[1]);
      let year = parseInt(parts[2]);
      
      // If first part > 12, assume DD/MM/YYYY
      if (day > 12) {
        if (year < 100) year += 2000;
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        }
      } else {
        // Could be MM/DD/YYYY or DD/MM/YYYY, assume MM/DD/YYYY
        const m = parseInt(parts[0]);
        const d = parseInt(parts[1]);
        if (year < 100) year += 2000;
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        }
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
      
      // Lista de campos de data
      const dateFields = [
        "data_nota_fiscal", "data_vencimento", "data_vencimento_original", 
        "data_pagamento", "data_evento", "data_cadastro"
      ];
      
      // Lista de campos monetários
      const moneyFields = [
        "valor", "valor_total_lancamento", "valor_pagamento", 
        "multa", "juros", "impostos", "custo"
      ];

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
              
              if (dateFields.includes(dbCol)) {
                record[dbCol] = parseExcelDate(value);
              } else if (moneyFields.includes(dbCol)) {
                record[dbCol] = parseMoneyValue(value);
              } else if (dbCol === "quantidade_parcela") {
                record[dbCol] = value ? parseInt(String(value)) || null : null;
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
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-orange-500" />
              Importar Planilha MGF
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={downloadMGFTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Baixar Modelo
              </Button>
            </div>
          </div>
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
