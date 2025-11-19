import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';

interface CorretoraImport {
  nome: string;
  cpf_cnpj?: string;
  susep?: string;
  email?: string;
  telefone?: string;
  cidade?: string;
  estado?: string;
}

interface ImportResult {
  total: number;
  success: number;
  errors: string[];
}

export function UploadCorretorasDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);

  const validateCorretora = (row: any, index: number): { valid: boolean; error?: string; data?: CorretoraImport } => {
    // Nome é obrigatório
    if (!row.nome || String(row.nome).trim() === '') {
      return { valid: false, error: `Linha ${index + 2}: Nome é obrigatório` };
    }

    const corretora: CorretoraImport = {
      nome: String(row.nome).trim(),
      cpf_cnpj: row.cpf_cnpj ? String(row.cpf_cnpj).trim() : undefined,
      susep: row.susep ? String(row.susep).trim() : undefined,
      email: row.email ? String(row.email).trim() : undefined,
      telefone: row.telefone ? String(row.telefone).trim() : undefined,
      cidade: row.cidade ? String(row.cidade).trim() : undefined,
      estado: row.estado ? String(row.estado).trim() : undefined,
    };

    return { valid: true, data: corretora };
  };

  const processFile = async (file: File) => {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    if (!fileExtension || !['csv', 'xlsx', 'xls'].includes(fileExtension)) {
      toast({
        title: 'Formato inválido',
        description: 'Por favor, envie um arquivo CSV ou Excel (.xlsx, .xls).',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    setProgress(0);
    setResult(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        toast({
          title: 'Arquivo vazio',
          description: 'O arquivo não contém dados para importar.',
          variant: 'destructive',
        });
        setUploading(false);
        return;
      }

      const errors: string[] = [];
      const validCorretoras: CorretoraImport[] = [];

      // Validar todos os dados
      jsonData.forEach((row: any, index) => {
        const validation = validateCorretora(row, index);
        if (validation.valid && validation.data) {
          validCorretoras.push(validation.data);
        } else if (validation.error) {
          errors.push(validation.error);
        }
      });

      if (validCorretoras.length === 0) {
        setResult({
          total: jsonData.length,
          success: 0,
          errors: errors.length > 0 ? errors : ['Nenhum dado válido encontrado'],
        });
        setUploading(false);
        return;
      }

      // Inserir em lote
      const batchSize = 50;
      let successCount = 0;

      for (let i = 0; i < validCorretoras.length; i += batchSize) {
        const batch = validCorretoras.slice(i, i + batchSize);
        
        // Adicionar campos opcionais apenas se existirem
        const cleanedBatch = batch.map(item => {
          const cleaned: any = { nome: item.nome };
          if (item.cpf_cnpj) cleaned.cnpj = item.cpf_cnpj;
          if (item.susep) cleaned.susep = item.susep;
          if (item.email) cleaned.email = item.email;
          if (item.telefone) cleaned.telefone = item.telefone;
          if (item.cidade) cleaned.cidade = item.cidade;
          if (item.estado) cleaned.estado = item.estado;
          return cleaned;
        });
        
        const { error } = await supabase
          .from('corretoras')
          .insert(cleanedBatch);

        if (error) {
          errors.push(`Erro ao inserir lote ${Math.floor(i / batchSize) + 1}: ${error.message}`);
        } else {
          successCount += batch.length;
        }

        setProgress(Math.round(((i + batch.length) / validCorretoras.length) * 100));
      }

      setResult({
        total: jsonData.length,
        success: successCount,
        errors,
      });

      if (successCount > 0) {
        toast({
          title: 'Import concluído',
          description: `${successCount} corretoras foram importadas com sucesso.`,
        });
        onSuccess();
      }
    } catch (error) {
      console.error('Erro ao processar arquivo:', error);
      toast({
        title: 'Erro ao processar arquivo',
        description: 'Verifique se o arquivo está no formato correto.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['csv', 'xlsx', 'xls'].includes(ext || '')) {
        toast({
          title: 'Formato inválido',
          description: 'Por favor, selecione um arquivo CSV ou Excel (.xlsx, .xls)',
          variant: 'destructive',
        });
        return;
      }
      processFile(file);
    }
  };

  const downloadTemplate = () => {
    const template = [
      {
        nome: 'Exemplo Corretora Ltda',
        cpf_cnpj: '00.000.000/0000-00',
        susep: '000000',
        email: 'contato@corretora.com.br',
        telefone: '(11) 99999-9999',
        cidade: 'São Paulo',
        estado: 'SP',
      },
      {
        nome: 'João da Silva Corretor',
        cpf_cnpj: '000.000.000-00',
        susep: '111111',
        email: 'joao@exemplo.com',
        telefone: '(21) 98888-8888',
        cidade: 'Rio de Janeiro',
        estado: 'RJ',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Corretoras');
    XLSX.writeFile(wb, 'template_corretoras.xlsx');

    toast({
      title: 'Template baixado',
      description: 'Use este arquivo como modelo para importação.',
    });
  };

  const handleClose = () => {
    setOpen(false);
    setResult(null);
    setProgress(0);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-2" />
          Importar Corretoras
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar Corretoras</DialogTitle>
          <DialogDescription>
            Faça upload de um arquivo CSV ou Excel com os dados das corretoras.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Download */}
          <Alert>
            <FileSpreadsheet className="h-4 w-4" />
            <AlertDescription>
              <div className="flex items-center justify-between">
                <span className="text-sm">Baixe o template para facilitar a importação</span>
                <Button variant="link" size="sm" onClick={downloadTemplate}>
                  Baixar Template
                </Button>
              </div>
            </AlertDescription>
          </Alert>

          {/* Formato esperado */}
          <div className="space-y-2">
            <Label>Colunas esperadas no arquivo:</Label>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>• <strong>nome</strong> (obrigatório) - Nome da corretora ou corretor</div>
              <div>• <strong>cpf_cnpj</strong> (opcional) - CPF ou CNPJ (aceita formatação com pontos, traços e barras)</div>
              <div>• <strong>susep</strong> (opcional) - Código SUSEP</div>
              <div>• <strong>email</strong> (opcional) - E-mail de contato</div>
              <div>• <strong>telefone</strong> (opcional) - Telefone de contato</div>
              <div>• <strong>cidade</strong> (opcional) - Cidade</div>
              <div>• <strong>estado</strong> (opcional) - Estado (sigla UF)</div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              <strong>Nota:</strong> O arquivo aceita acentos e caracteres especiais. 
              O campo CPF/CNPJ pode incluir formatação completa.
            </p>
          </div>

          {/* Upload */}
          <div className="space-y-2">
            <Label>Arquivo</Label>
            <div className="flex gap-2">
              <Input
                id="file-upload"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById('file-upload')?.click()}
                disabled={uploading}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? 'Processando...' : 'Selecionar Arquivo'}
              </Button>
            </div>
          </div>

          {/* Progress */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Importando...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {/* Results */}
          {result && (
            <Alert variant={result.errors.length > 0 ? 'destructive' : 'default'}>
              {result.errors.length === 0 ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                <div className="space-y-2">
                  <div className="font-semibold">
                    Resultado da Importação
                  </div>
                  <div className="text-sm">
                    <div>Total de linhas: {result.total}</div>
                    <div className="text-green-600 dark:text-green-400">
                      Importadas com sucesso: {result.success}
                    </div>
                    {result.errors.length > 0 && (
                      <div className="text-destructive">
                        Erros: {result.errors.length}
                      </div>
                    )}
                  </div>
                  {result.errors.length > 0 && (
                    <div className="mt-2 max-h-40 overflow-y-auto">
                      <div className="text-xs space-y-1">
                        {result.errors.slice(0, 10).map((error, index) => (
                          <div key={index}>• {error}</div>
                        ))}
                        {result.errors.length > 10 && (
                          <div>... e mais {result.errors.length - 10} erros</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
