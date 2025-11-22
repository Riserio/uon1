import bg from "/mnt/data/Captura de Tela 2025-11-22 às 11.48.06.png";

import { useState, useEffect } from "react";
import { useAppConfig } from "@/hooks/useAppConfig";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Palette, Image as ImageIcon } from "lucide-react";

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

const defaultColors: ConfigColors = {
  primary: "#3b82f6",
  statusNovo: "#3b82f6",
  statusAndamento: "#f59e0b",
  statusAguardo: "#a855f7",
  statusConcluido: "#22c55e",
  priorityAlta: "#ef4444",
  priorityMedia: "#f59e0b",
  priorityBaixa: "#22c55e",
  sidebarBackground: "#fafafa",
  sidebarForeground: "#1e293b",
  sidebarAccent: "#f1f5f9",
};

export default function Configuracoes() {
  const { config, saveConfig, applyColors } = useAppConfig();
  const { user } = useAuth();
  const [tempColors, setTempColors] = useState<ConfigColors>(config.colors);
  const [imageUrls, setImageUrls] = useState<ImageUploadState>({
    logo: config.logo_url || "",
    login: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setTempColors(config.colors);
    loadImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const loadImages = async () => {
    if (!user) return;

    try {
      const { data: configData } = await supabase
        .from("app_config")
        .select("login_image_url")
        .eq("user_id", user.id)
        .maybeSingle();

      if (configData?.login_image_url) {
        setImageUrls((prev) => ({ ...prev, login: configData.login_image_url }));
      }
    } catch (error) {
      console.error("Error loading images:", error);
    }
  };

  // Função de upload corrigida (sem usar upsert)
  const handleImageUpload = async (file: File, type: "logo" | "login") => {
    if (!user) {
      toast.error("Usuário não autenticado.");
      return;
    }

    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("Arquivo muito grande. Máximo 2MB.");
      return;
    }

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}-${type}-${Date.now()}.${fileExt}`;
      const filePath = `${type}/${fileName}`;

      setLoading(true);

      // Tenta remover arquivo anterior com mesmo nome (opcional — aqui remove o mesmo path caso exista)
      // await supabase.storage.from('app-assets').remove([filePath]);

      // Upload sem upsert
      const { error: uploadError } = await supabase.storage.from("app-assets").upload(filePath, file);

      if (uploadError) {
        console.error("Erro Supabase Upload:", uploadError);
        toast.error("Erro ao fazer upload da imagem.");
        setLoading(false);
        return;
      }

      // Obtém URL pública
      const { data: urlData } = supabase.storage.from("app-assets").getPublicUrl(filePath);

      const publicUrl = urlData?.publicUrl;
      if (!publicUrl) {
        toast.error("Erro ao gerar URL da imagem.");
        setLoading(false);
        return;
      }

      // Atualiza config no banco conforme o tipo
      if (type === "logo") {
        await saveConfig({ logo_url: publicUrl });
        setImageUrls((prev) => ({ ...prev, logo: publicUrl }));
      } else {
        const { error: updateError } = await supabase
          .from("app_config")
          .update({ login_image_url: publicUrl })
          .eq("user_id", user.id);

        if (updateError) {
          console.error("Erro ao atualizar URL no banco:", updateError);
          toast.error("Erro ao salvar imagem no banco.");
          setLoading(false);
          return;
        }
        setImageUrls((prev) => ({ ...prev, login: publicUrl }));
      }

      toast.success("Imagem atualizada com sucesso!");
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error("Erro ao fazer upload da imagem.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveColors = async () => {
    try {
      await saveConfig({ colors: tempColors });
      toast.success("Cores salvas com sucesso!");
    } catch (error) {
      console.error("Error saving colors:", error);
      toast.error("Erro ao salvar cores.");
    }
  };

  const handleResetColors = () => {
    setTempColors(defaultColors);
    applyColors(defaultColors);
    toast.success("Cores resetadas para padrão!");
  };

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20"
      style={{
        backgroundImage: `url(${bg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Palette className="h-7 w-7 text-primary" />
              </div>
              Configurações do Sistema
            </h1>
            <p className="text-muted-foreground mt-1">Personalize a aparência da aplicação</p>
          </div>
        </div>

        <Tabs defaultValue="colors" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 mb-8">
            <TabsTrigger value="colors" className="gap-2">
              <Palette className="h-4 w-4" />
              Cores
            </TabsTrigger>
            <TabsTrigger value="images" className="gap-2">
              <ImageIcon className="h-4 w-4" />
              Imagens
            </TabsTrigger>
          </TabsList>

          <TabsContent value="colors" className="space-y-6">
            <Card className="border-2">
              <CardHeader>
                <CardTitle>Personalização de Cores</CardTitle>
                <CardDescription>Ajuste as cores do sistema conforme sua preferência</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="primary">Cor Primária</Label>
                    <div className="flex gap-2">
                      <Input
                        id="primary"
                        type="color"
                        value={tempColors.primary}
                        onChange={(e) => setTempColors({ ...tempColors, primary: e.target.value })}
                        className="h-10 w-20"
                      />
                      <Input
                        type="text"
                        value={tempColors.primary}
                        onChange={(e) => setTempColors({ ...tempColors, primary: e.target.value })}
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="statusNovo">Status: Novo</Label>
                    <div className="flex gap-2">
                      <Input
                        id="statusNovo"
                        type="color"
                        value={tempColors.statusNovo}
                        onChange={(e) => setTempColors({ ...tempColors, statusNovo: e.target.value })}
                        className="h-10 w-20"
                      />
                      <Input
                        type="text"
                        value={tempColors.statusNovo}
                        onChange={(e) => setTempColors({ ...tempColors, statusNovo: e.target.value })}
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="statusAndamento">Status: Andamento</Label>
                    <div className="flex gap-2">
                      <Input
                        id="statusAndamento"
                        type="color"
                        value={tempColors.statusAndamento}
                        onChange={(e) => setTempColors({ ...tempColors, statusAndamento: e.target.value })}
                        className="h-10 w-20"
                      />
                      <Input
                        type="text"
                        value={tempColors.statusAndamento}
                        onChange={(e) => setTempColors({ ...tempColors, statusAndamento: e.target.value })}
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="statusAguardo">Status: Aguardo</Label>
                    <div className="flex gap-2">
                      <Input
                        id="statusAguardo"
                        type="color"
                        value={tempColors.statusAguardo}
                        onChange={(e) => setTempColors({ ...tempColors, statusAguardo: e.target.value })}
                        className="h-10 w-20"
                      />
                      <Input
                        type="text"
                        value={tempColors.statusAguardo}
                        onChange={(e) => setTempColors({ ...tempColors, statusAguardo: e.target.value })}
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="statusConcluido">Status: Concluído</Label>
                    <div className="flex gap-2">
                      <Input
                        id="statusConcluido"
                        type="color"
                        value={tempColors.statusConcluido}
                        onChange={(e) => setTempColors({ ...tempColors, statusConcluido: e.target.value })}
                        className="h-10 w-20"
                      />
                      <Input
                        type="text"
                        value={tempColors.statusConcluido}
                        onChange={(e) => setTempColors({ ...tempColors, statusConcluido: e.target.value })}
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="priorityAlta">Prioridade: Alta</Label>
                    <div className="flex gap-2">
                      <Input
                        id="priorityAlta"
                        type="color"
                        value={tempColors.priorityAlta}
                        onChange={(e) => setTempColors({ ...tempColors, priorityAlta: e.target.value })}
                        className="h-10 w-20"
                      />
                      <Input
                        type="text"
                        value={tempColors.priorityAlta}
                        onChange={(e) => setTempColors({ ...tempColors, priorityAlta: e.target.value })}
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="priorityMedia">Prioridade: Média</Label>
                    <div className="flex gap-2">
                      <Input
                        id="priorityMedia"
                        type="color"
                        value={tempColors.priorityMedia}
                        onChange={(e) => setTempColors({ ...tempColors, priorityMedia: e.target.value })}
                        className="h-10 w-20"
                      />
                      <Input
                        type="text"
                        value={tempColors.priorityMedia}
                        onChange={(e) => setTempColors({ ...tempColors, priorityMedia: e.target.value })}
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="priorityBaixa">Prioridade: Baixa</Label>
                    <div className="flex gap-2">
                      <Input
                        id="priorityBaixa"
                        type="color"
                        value={tempColors.priorityBaixa}
                        onChange={(e) => setTempColors({ ...tempColors, priorityBaixa: e.target.value })}
                        className="h-10 w-20"
                      />
                      <Input
                        type="text"
                        value={tempColors.priorityBaixa}
                        onChange={(e) => setTempColors({ ...tempColors, priorityBaixa: e.target.value })}
                        className="flex-1"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <Button onClick={handleSaveColors} className="flex-1">
                    Salvar Cores
                  </Button>
                  <Button onClick={handleResetColors} variant="outline">
                    Resetar Padrão
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="images" className="space-y-6">
            <Card className="border-2">
              <CardHeader>
                <CardTitle>Logo do Sistema</CardTitle>
                <CardDescription>Imagem exibida no cabeçalho e menu lateral</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {imageUrls.logo && (
                  <div className="flex justify-center p-4 bg-muted/30 rounded-lg">
                    <img src={imageUrls.logo} alt="Logo atual" className="max-h-24 object-contain" />
                  </div>
                )}
                <div>
                  <Label htmlFor="logo-upload" className="cursor-pointer">
                    <div className="border-2 border-dashed rounded-lg p-6 hover:border-primary transition-colors text-center">
                      <ImageIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Clique para selecionar uma nova logo</p>
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG até 2MB</p>
                    </div>
                  </Label>
                  <Input
                    id="logo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file, "logo");
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardHeader>
                <CardTitle>Imagem de Login</CardTitle>
                <CardDescription>Imagem de fundo da tela de login</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {imageUrls.login && (
                  <div className="flex justify-center p-4 bg-muted/30 rounded-lg">
                    <img
                      src={imageUrls.login}
                      alt="Imagem de login atual"
                      className="max-h-48 object-contain rounded"
                    />
                  </div>
                )}
                <div>
                  <Label htmlFor="login-upload" className="cursor-pointer">
                    <div className="border-2 border-dashed rounded-lg p-6 hover:border-primary transition-colors text-center">
                      <ImageIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Clique para selecionar uma nova imagem</p>
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG até 2MB</p>
                    </div>
                  </Label>
                  <Input
                    id="login-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file, "login");
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
