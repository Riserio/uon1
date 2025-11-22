import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function Configuracoes() {
  const [imagem, setImagem] = useState<File | null>(null);
  const [imagemUrl, setImagemUrl] = useState("");

  useEffect(() => {
    carregarConfiguracao();
  }, []);

  async function carregarConfiguracao() {
    const { data } = await supabase.from("configuracoes").select("*").single();
    if (data?.imagem_fundo) {
      setImagemUrl(data.imagem_fundo);
    }
  }

  async function handleUpload() {
    if (!imagem) {
      toast.error("Selecione uma imagem primeiro");
      return;
    }

    const nomeArquivo = `bg-${Date.now()}.jpg`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("backgrounds")
      .upload(nomeArquivo, imagem, { upsert: true });

    if (uploadError) {
      console.error(uploadError);
      toast.error("Erro ao fazer upload da imagem.");
      return;
    }

    const { data: urlData } = supabase.storage.from("backgrounds").getPublicUrl(nomeArquivo);

    const publicUrl = urlData.publicUrl;

    const { error: updateError } = await supabase.from("configuracoes").update({ imagem_fundo: publicUrl }).eq("id", 1);

    if (updateError) {
      toast.error("Erro ao salvar no banco");
      return;
    }

    setImagemUrl(publicUrl);
    toast.success("Imagem atualizada com sucesso!");
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl mb-4 font-semibold">Configurações do Sistema</h1>

      <div className="space-y-4">
        <div>
          <p className="font-medium">Imagem atual:</p>
          {imagemUrl ? (
            <img src={imagemUrl} alt="Fundo" className="w-64 rounded-md shadow" />
          ) : (
            <p>Nenhuma imagem configurada.</p>
          )}
        </div>

        <Input type="file" accept="image/*" onChange={(e) => setImagem(e.target.files?.[0] || null)} />

        <Button onClick={handleUpload}>Salvar Imagem</Button>
      </div>
    </div>
  );
}
