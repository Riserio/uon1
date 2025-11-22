import { useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "react-hot-toast";

export default function Configuracoes() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [imageUrls, setImageUrls] = useState({ logo: "", login: "" });

  useEffect(() => {
    if (user) fetchConfig();
  }, [user]);

  const fetchConfig = async () => {
    const { data, error } = await supabase
      .from("app_config")
      .select("logo_url, login_image_url")
      .eq("user_id", user.id)
      .single();

    if (!error && data) {
      setImageUrls({
        logo: data.logo_url || "",
        login: data.login_image_url || "",
      });
    }
  };

  const saveConfig = async (values: any) => {
    const { error } = await supabase.from("app_config").update(values).eq("user_id", user.id);

    if (error) console.error(error);
  };

  const handleImageUpload = async (file: File, type: "logo" | "login") => {
    if (!user) return;

    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("Arquivo muito grande. Máximo 2MB.");
      return;
    }

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}-${type}-${Date.now()}.${fileExt}`;
      const filePath = `${type}/${fileName}`;

      await supabase.storage.from("app-assets").remove([filePath]);

      const { error: uploadError } = await supabase.storage.from("app-assets").upload(filePath, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("app-assets").getPublicUrl(filePath);

      if (type === "logo") {
        await saveConfig({ logo_url: publicUrl });
        setImageUrls((prev) => ({ ...prev, logo: publicUrl }));
      } else {
        const { error: updateError } = await supabase
          .from("app_config")
          .update({ login_image_url: publicUrl })
          .eq("user_id", user.id);

        if (updateError) throw updateError;

        setImageUrls((prev) => ({ ...prev, login: publicUrl }));
      }

      toast.success("Imagem atualizada com sucesso!");
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error("Erro ao fazer upload da imagem.");
    }
  };

  const handleFileChange = (e: any, type: "logo" | "login") => {
    const file = e.target.files[0];
    if (file) handleImageUpload(file, type);
  };

  return (
    <div className="p-6 w-full max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">Configurações</h1>

      {/* LOGO */}
      <div className="mb-6">
        <label className="font-medium">Logo</label>
        <div className="mt-2 flex items-center gap-4">
          {imageUrls.logo ? (
            <img src={imageUrls.logo} alt="Logo" className="w-32 h-32 object-contain border rounded" />
          ) : (
            <div className="w-32 h-32 border rounded flex items-center justify-center text-gray-400">Sem imagem</div>
          )}

          <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, "logo")} />
        </div>
      </div>

      {/* LOGIN IMAGE */}
      <div className="mb-6">
        <label className="font-medium">Imagem da Tela de Login</label>
        <div className="mt-2 flex items-center gap-4">
          {imageUrls.login ? (
            <img src={imageUrls.login} alt="Login Illustration" className="w-32 h-32 object-cover border rounded" />
          ) : (
            <div className="w-32 h-32 border rounded flex items-center justify-center text-gray-400">Sem imagem</div>
          )}

          <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, "login")} />
        </div>
      </div>
    </div>
  );
}
