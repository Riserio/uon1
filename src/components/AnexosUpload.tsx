import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, X, FileText, Download, Image as ImageIcon } from 'lucide-react';

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

  const isImageFile = (type: string | null) => {
    return type?.startsWith('image/') || false;
  };

  const getFileUrl = async (path: string): Promise<string> => {
    const { data } = await supabase.storage
      .from('atendimento-anexos')
      .createSignedUrl(path, 3600);
    return data?.signedUrl || '';
  };

  return (
    <div className="space-y-4">
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
          className="w-full gap-2"
        >
          <Upload className="h-4 w-4" />
          {uploading ? 'Enviando arquivos...' : 'Adicionar Arquivos'}
        </Button>
      </div>

      {anexos.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {anexos.length} arquivo{anexos.length !== 1 ? 's' : ''} anexado{anexos.length !== 1 ? 's' : ''}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {anexos.map((anexo) => {
            const isImage = isImageFile(anexo.tipo_arquivo);
            
            return (
              <div
                key={anexo.id}
                className="relative group border rounded-lg overflow-hidden bg-muted hover:bg-muted/80 transition-colors"
              >
                {isImage ? (
                  <div className="aspect-square relative">
                    <img
                      src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/atendimento-anexos/${anexo.arquivo_url}`}
                      alt={anexo.arquivo_nome}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback se a imagem não carregar (bucket privado)
                        const img = e.target as HTMLImageElement;
                        getFileUrl(anexo.arquivo_url).then(url => {
                          if (url) img.src = url;
                        });
                      }}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          onClick={() => handleDownload(anexo)}
                          className="h-8 w-8"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          onClick={() => handleRemoveAnexo(anexo)}
                          className="h-8 w-8"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-square flex flex-col items-center justify-center p-4">
                    <FileText className="h-12 w-12 text-muted-foreground mb-2" />
                    <div className="flex gap-2 mt-auto">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownload(anexo)}
                        className="h-8 w-8"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveAnexo(anexo)}
                        className="h-8 w-8"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
                <div className="p-2 border-t bg-background">
                  <p className="text-xs font-medium truncate">{anexo.arquivo_nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(anexo.arquivo_tamanho)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}
