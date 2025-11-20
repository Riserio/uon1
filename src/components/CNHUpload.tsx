import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, Loader2, CreditCard, CheckCircle } from 'lucide-react';

interface CNHData {
  nome: string | null;
  cpf: string | null;
  rg: string | null;
  data_nascimento: string | null;
  nome_pai: string | null;
  nome_mae: string | null;
  numero_registro: string | null;
  data_emissao: string | null;
  validade: string | null;
}

interface CNHUploadProps {
  onDataExtracted: (data: CNHData) => void;
}

export function CNHUpload({ onDataExtracted }: CNHUploadProps) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [extracted, setExtracted] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de arquivo
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem');
      return;
    }

    // Mostrar preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    setLoading(true);
    setExtracted(false);

    try {
      // Converter para base64
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      toast.info('Processando CNH...');

      // Chamar edge function para processar
      const { data, error } = await supabase.functions.invoke('processar-cnh-ocr', {
        body: { imageBase64: base64 }
      });

      if (error) throw error;

      console.log('Dados extraídos da CNH:', data);

      if (data.erro) {
        toast.warning(data.erro);
      } else {
        toast.success('Dados da CNH extraídos com sucesso!');
        setExtracted(true);
      }

      // Passar os dados para o componente pai
      onDataExtracted(data);
    } catch (error) {
      console.error('Erro ao processar CNH:', error);
      toast.error('Erro ao processar CNH. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Upload de CNH</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Faça upload da CNH para preencher automaticamente os dados do segurado
          </p>

          {!preview ? (
            <label className="block">
              <div className="border-2 border-dashed border-primary/30 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                <Upload className="h-12 w-12 mx-auto text-primary mb-3" />
                <p className="font-medium mb-1">Clique para selecionar a CNH</p>
                <p className="text-sm text-muted-foreground">PNG, JPG ou PDF até 10MB</p>
              </div>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileSelect}
                className="hidden"
                disabled={loading}
              />
            </label>
          ) : (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden border-2 border-primary/20">
                <img 
                  src={preview} 
                  alt="Preview CNH" 
                  className="w-full h-48 object-contain bg-muted"
                />
                {extracted && (
                  <div className="absolute top-2 right-2 bg-green-500 text-white p-2 rounded-full">
                    <CheckCircle className="h-5 w-5" />
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <label className="flex-1">
                  <Button 
                    variant="outline" 
                    className="w-full"
                    disabled={loading}
                    asChild
                  >
                    <span>
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processando...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Selecionar Outra
                        </>
                      )}
                    </span>
                  </Button>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={loading}
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
