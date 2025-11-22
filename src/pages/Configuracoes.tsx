import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export default function Configuracoes() {
  const { user } = useAuth();
  const [imageUrls, setImageUrls] = useState({ logo: "", login: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadImages = async () => {
      const { data } = await supabase.from("app_config").select("logo_url, login_image_url").maybeSingle();

      if (data) {
        setImageUrls({
          logo: data.logo_url || "",
          login: data.login_image_url || "",
        });
      }
    };

    loadImages();
  }, []);

  // 🔥 Função corrigida de upload
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

      const { error: uploadError } = await supabase.storage.from("app-assets").upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

      if (uploadError) {
        console.error("Erro Supabase:", uploadError);
        toast.error("Erro ao fazer upload da imagem.");
        setLoading(false);
        return;
      }

      const { data: urlData } = supabase.storage.from("app-assets").getPublicUrl(filePath);

      const publicUrl = urlData?.publicUrl;
      if (!publicUrl) {
        toast.error("Erro ao gerar URL da imagem.");
        setLoading(false);
        return;
      }

      if (type === "logo") {
        await supabase.from("app_config").update({ logo_url: publicUrl }).eq("user_id", user.id);

        setImageUrls((prev) => ({ ...prev, logo: publicUrl }));
      } else {
        await supabase.from("app_config").update({ login_image_url: publicUrl }).eq("user_id", user.id);

        setImageUrls((prev) => ({ ...prev, login: publicUrl }));
      }

      toast.success("Imagem enviada com sucesso!");
    } catch (err) {
      console.error("Erro inesperado:", err);
      toast.error("Erro inesperado ao enviar imagem.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <div className="space-y-4">
        <Label>Logo da Empresa</Label>
        <Input
          type="file"
          accept="image/*"
          onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], "logo")}
        />
        {imageUrls.logo && <img src={imageUrls.logo} alt="Logo" className="w-32 mt-2 rounded" />}
      </div>

      <div className="space-y-4">
        <Label>Imagem da Tela de Login</Label>
        <Input
          type="file"
          accept="image/*"
          onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], "login")}
        />
        {imageUrls.login && <img src={imageUrls.login} alt="Login background" className="w-48 mt-2 rounded" />}
      </div>
    </div>
  );
}
