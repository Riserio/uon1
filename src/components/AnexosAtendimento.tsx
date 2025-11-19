import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { FileText, Upload, X, Download } from 'lucide-react';

interface Anexo {
  id: string;
  arquivo_nome: string;
  arquivo_url: string;
  arquivo_tamanho: number | null;
  tipo_arquivo: string | null;
  created_at: string;
}

interface AnexosAtendimentoProps {
  atendimentoId?: string;
  onAnexosChange?: (anexos: File[]) => void;
}

export function AnexosAtendimento({ atendimentoId, onAnexosChange }: AnexosAtendimentoProps) {
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [novosAnexos, setNovosAnexos] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (atendimentoId) {
      loadAnexos();
    }
  }, [atendimentoId]);

  useEffect(() => {
    if (!atendimentoId) return;

    const channel = supabase
      .channel('atendimento-anexos-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'atendimento_anexos',
          filter: `atendimento_id=eq.${atendimentoId}`
        },
        () => {
          loadAnexos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [atendimentoId]);

  const loadAnexos = async () => {
    if (!atendimentoId) return;

    const { data, error } = await supabase
      .from('atendimento_anexos')
      .select('*')
      .eq('atendimento_id', atendimentoId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao carregar anexos:', error);
    } else {
      setAnexos(data || []);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newFiles = [...novosAnexos, ...files];
    setNovosAnexos(newFiles);
    onAnexosChange?.(newFiles);
  };

  const removeNovoAnexo = (index: number) => {
    const newFiles = novosAnexos.filter((_, i) => i !== index);
    setNovosAnexos(newFiles);
    onAnexosChange?.(newFiles);
  };

  const handleDownload = async (anexo: Anexo) => {
    const { data, error } = await supabase.storage
      .from('atendimento-anexos')
      .download(anexo.arquivo_url);

    if (error) {
      toast.error('Erro ao baixar arquivo');
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = anexo.arquivo_nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (anexo: Anexo) => {
    const { error: storageError } = await supabase.storage
      .from('atendimento-anexos')
      .remove([anexo.arquivo_url]);

    if (storageError) {
      toast.error('Erro ao excluir arquivo do storage');
      return;
    }

    const { error: dbError } = await supabase
      .from('atendimento_anexos')
      .delete()
      .eq('id', anexo.id);

    if (dbError) {
      toast.error('Erro ao excluir registro do anexo');
      return;
    }

    toast.success('Anexo excluído com sucesso');
    loadAnexos();
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Tamanho desconhecido';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="anexos">Anexar Arquivos</Label>
        <div className="flex items-center gap-2">
          <Input
            id="anexos"
            type="file"
            multiple
            onChange={handleFileSelect}
            className="flex-1"
          />
          <Upload className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-xs text-muted-foreground">
          Máximo 20MB por arquivo
        </p>
      </div>

      {/* Novos anexos (não salvos ainda) */}
      {novosAnexos.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Arquivos selecionados:</Label>
          <div className="space-y-2">
            {novosAnexos.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 bg-muted/50 rounded-md"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span className="text-sm">{file.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({formatFileSize(file.size)})
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeNovoAnexo(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Anexos já salvos */}
      {anexos.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm">Anexos salvos:</Label>
          <div className="space-y-2">
            {anexos.map((anexo) => (
              <div
                key={anexo.id}
                className="flex items-center justify-between p-2 bg-muted/50 rounded-md"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span className="text-sm">{anexo.arquivo_nome}</span>
                  <span className="text-xs text-muted-foreground">
                    ({formatFileSize(anexo.arquivo_tamanho)})
                  </span>
                </div>
                <div className="flex gap-1">
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
                    onClick={() => handleDelete(anexo)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
