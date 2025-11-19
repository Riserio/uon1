import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, X, FileText, Download } from 'lucide-react';

interface Anexo {
  id: string;
  arquivo_nome: string;
  arquivo_url: string;
  arquivo_tamanho: number | null;
  tipo_arquivo: string | null;
}

interface AnexosUploadProps {
  atendimentoId?: string;
  anexos: Anexo[];
  onAnexosChange: (anexos: Anexo[]) => void;
}

export function AnexosUpload({ atendimentoId, anexos, onAnexosChange }: AnexosUploadProps) {
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Usuário não autenticado');
        return;
      }

      const newAnexos: Anexo[] = [];

      for (const file of Array.from(files)) {
        // Validação de tamanho (20MB)
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`Arquivo ${file.name} excede o tamanho máximo de 20MB`);
          continue;
        }

        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        // Upload do arquivo
        const { error: uploadError } = await supabase.storage
          .from('atendimento-anexos')
          .upload(filePath, file);

        if (uploadError) {
          toast.error(`Erro ao fazer upload de ${file.name}`);
          console.error(uploadError);
          continue;
        }

        // Se tiver atendimentoId, salvar no banco
        if (atendimentoId) {
          const { data, error: dbError } = await supabase
            .from('atendimento_anexos')
            .insert({
              atendimento_id: atendimentoId,
              arquivo_nome: file.name,
              arquivo_url: filePath,
              arquivo_tamanho: file.size,
              tipo_arquivo: file.type,
              created_by: user.id,
            })
            .select()
            .single();

          if (dbError) {
            toast.error(`Erro ao registrar ${file.name}`);
            console.error(dbError);
            continue;
          }

          if (data) {
            newAnexos.push(data);
          }
        } else {
          // Modo temporário para novo atendimento
          newAnexos.push({
            id: Math.random().toString(),
            arquivo_nome: file.name,
            arquivo_url: filePath,
            arquivo_tamanho: file.size,
            tipo_arquivo: file.type,
          });
        }
      }

      onAnexosChange([...anexos, ...newAnexos]);
      toast.success(`${newAnexos.length} arquivo(s) adicionado(s)`);
    } catch (error) {
      console.error('Erro no upload:', error);
      toast.error('Erro ao fazer upload dos arquivos');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleRemoveAnexo = async (anexo: Anexo) => {
    try {
      // Deletar do storage
      const { error: storageError } = await supabase.storage
        .from('atendimento-anexos')
        .remove([anexo.arquivo_url]);

      if (storageError) {
        console.error('Erro ao deletar arquivo do storage:', storageError);
      }

      // Se tiver ID válido (UUID), deletar do banco
      if (atendimentoId && anexo.id.length > 20) {
        const { error: dbError } = await supabase
          .from('atendimento_anexos')
          .delete()
          .eq('id', anexo.id);

        if (dbError) {
          console.error('Erro ao deletar registro:', dbError);
        }
      }

      onAnexosChange(anexos.filter(a => a.id !== anexo.id));
      toast.success('Anexo removido');
    } catch (error) {
      console.error('Erro ao remover anexo:', error);
      toast.error('Erro ao remover anexo');
    }
  };

  const handleDownload = async (anexo: Anexo) => {
    try {
      const { data, error } = await supabase.storage
        .from('atendimento-anexos')
        .download(anexo.arquivo_url);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = anexo.arquivo_nome;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao baixar arquivo:', error);
      toast.error('Erro ao baixar arquivo');
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-3">
      <Label>Anexos</Label>
      
      <div className="flex items-center gap-2">
        <Input
          type="file"
          multiple
          onChange={handleFileUpload}
          disabled={uploading}
          className="hidden"
          id="file-upload"
          accept="*/*"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => document.getElementById('file-upload')?.click()}
          disabled={uploading}
          className="w-full"
        >
          <Upload className="h-4 w-4 mr-2" />
          {uploading ? 'Enviando...' : 'Adicionar Arquivos'}
        </Button>
      </div>

      {anexos.length > 0 && (
        <div className="space-y-2">
          {anexos.map((anexo) => (
            <div
              key={anexo.id}
              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <FileText className="h-4 w-4 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{anexo.arquivo_nome}</p>
                  {anexo.arquivo_tamanho && (
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(anexo.arquivo_tamanho)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownload(anexo)}
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveAnexo(anexo)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
