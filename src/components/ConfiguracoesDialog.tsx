import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Palette } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useAppConfig } from '@/hooks/useAppConfig';
import { supabase } from '@/integrations/supabase/client';

interface ConfigColors {
  primary: string;
  statusNovo: string;
  statusAndamento: string;
  statusAguardo: string;
  statusConcluido: string;
  priorityAlta: string;
  priorityMedia: string;
  priorityBaixa: string;
  sidebarBackground?: string;
  sidebarForeground?: string;
  sidebarAccent?: string;
}

interface ImageUploadState {
  logo: string;
  login: string;
}

interface ConfiguracoesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const defaultColors: ConfigColors = {
  primary: '#3b82f6',
  statusNovo: '#3b82f6',
  statusAndamento: '#f59e0b',
  statusAguardo: '#a855f7',
  statusConcluido: '#22c55e',
  priorityAlta: '#ef4444',
  priorityMedia: '#f59e0b',
  priorityBaixa: '#22c55e',
  sidebarBackground: '#fafafa',
  sidebarForeground: '#1e293b',
  sidebarAccent: '#f1f5f9',
};

export function ConfiguracoesDialog({ open, onOpenChange }: ConfiguracoesDialogProps) {
  const { config, saveConfig, applyColors } = useAppConfig();
  const [tempColors, setTempColors] = useState<ConfigColors>(config.colors);
  const [imageUrls, setImageUrls] = useState<ImageUploadState>({
    logo: config.logo_url || '',
    login: ''
  });

  useEffect(() => {
    if (open) {
      setTempColors(config.colors);
      loadImages();
    }
  }, [open, config]);

  const loadImages = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('app_config')
        .select('logo_url, login_image_url')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) {
        console.error('Error loading images:', error);
        return;
      }
      
      setImageUrls({
        logo: data?.logo_url || '',
        login: data?.login_image_url || ''
      });
    } catch (error) {
      console.error('Error in loadImages:', error);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'login') => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "Arquivo muito grande. Máximo 5MB", variant: "destructive" });
        return;
      }

      if (!file.type.startsWith('image/')) {
        toast({ title: "Por favor, selecione uma imagem", variant: "destructive" });
        return;
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${type}-${Date.now()}.${fileExt}`;
      const filePath = `${type === 'logo' ? 'logos' : 'login-images'}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('app-assets')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        if (uploadError.message?.includes('not found')) {
          toast({ 
            title: "Bucket de storage não configurado", 
            description: "Entre em contato com o administrador para configurar o storage",
            variant: "destructive" 
          });
          return;
        }
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('app-assets')
        .getPublicUrl(filePath);

      setImageUrls(prev => ({ ...prev, [type]: publicUrl }));
      
      const configKey = type === 'logo' ? 'logo_url' : 'login_image_url';
      await saveConfig({ [configKey]: publicUrl });
      toast({ title: `${type === 'logo' ? 'Logo' : 'Imagem de login'} salvo com sucesso!` });
    } catch (error: any) {
      console.error('Erro ao fazer upload:', error);
      toast({ 
        title: "Erro ao fazer upload", 
        description: error?.message || "Tente novamente",
        variant: "destructive" 
      });
    }
  };


  const handleSaveColors = async () => {
    try {
      await saveConfig({ colors: tempColors });
      applyColors(tempColors);
      toast({ title: "Cores atualizadas!" });
    } catch (error) {
      toast({ title: "Erro ao salvar cores", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurações do Sistema</DialogTitle>
          <DialogDescription>Personalize a aparência da aplicação</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="logo" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="logo"><Upload className="h-4 w-4 mr-2" />Imagens</TabsTrigger>
            <TabsTrigger value="cores"><Palette className="h-4 w-4 mr-2" />Cores</TabsTrigger>
          </TabsList>
          <TabsContent value="logo" className="space-y-6">
            <div className="space-y-3">
              <Label>Logo do Sistema</Label>
              <Input 
                type="file" 
                accept="image/*" 
                onChange={(e) => handleImageUpload(e, 'logo')} 
              />
              {imageUrls.logo && (
                <img src={imageUrls.logo} alt="Logo" className="h-16 object-contain" />
              )}
            </div>
            <div className="space-y-3">
              <Label>Imagem de Login</Label>
              <Input 
                type="file" 
                accept="image/*" 
                onChange={(e) => handleImageUpload(e, 'login')} 
              />
              {imageUrls.login && (
                <img src={imageUrls.login} alt="Login" className="h-32 w-full object-cover rounded" />
              )}
            </div>
          </TabsContent>
          <TabsContent value="cores" className="space-y-4">
            {Object.entries(tempColors).map(([key, value]) => {
              const labels: Record<string, string> = {
                primary: 'Cor Principal',
                statusNovo: 'Status: Novo',
                statusAndamento: 'Status: Andamento',
                statusAguardo: 'Status: Aguardo',
                statusConcluido: 'Status: Concluído',
                priorityAlta: 'Prioridade: Alta',
                priorityMedia: 'Prioridade: Média',
                priorityBaixa: 'Prioridade: Baixa',
                sidebarBackground: 'Sidebar: Fundo',
                sidebarForeground: 'Sidebar: Texto',
                sidebarAccent: 'Sidebar: Item Ativo',
              };
              return (
                <div key={key} className="flex items-center gap-4">
                  <Label className="w-48">{labels[key] || key}</Label>
                  <Input type="color" value={value} onChange={(e) => setTempColors({...tempColors, [key]: e.target.value})} className="w-20" />
                  <Input type="text" value={value} onChange={(e) => setTempColors({...tempColors, [key]: e.target.value})} className="flex-1 font-mono" />
                </div>
              );
            })}
            <Button onClick={handleSaveColors} className="w-full">Salvar Cores</Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
