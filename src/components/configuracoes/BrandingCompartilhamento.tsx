import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Share2, Save, Upload } from "lucide-react";

export function BrandingCompartilhamento() {
  const qc = useQueryClient();
  const [og, setOg] = useState({ og_titulo: "", og_descricao: "", og_imagem_url: "" });

  const { data: corretora, isLoading } = useQuery({
    queryKey: ["minha_corretora_og"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data: link } = await supabase
        .from("corretora_usuarios")
        .select("corretora_id")
        .eq("profile_id", u.user.id)
        .eq("ativo", true)
        .limit(1)
        .maybeSingle();
      if (!link?.corretora_id) return null;
      const { data: c } = await supabase
        .from("corretoras")
        .select("id, nome, og_titulo, og_descricao, og_imagem_url, logo_url, logo_expanded_url")
        .eq("id", link.corretora_id)
        .maybeSingle();
      return c;
    },
  });

  useEffect(() => {
    if (corretora) {
      setOg({
        og_titulo: corretora.og_titulo || "Vangard",
        og_descricao: corretora.og_descricao || "",
        og_imagem_url:
          corretora.og_imagem_url || `${window.location.origin}/images/vangard-logo.png`,
      });
    }
  }, [corretora]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!corretora?.id) throw new Error("Associação não encontrada");
      const { error } = await supabase
        .from("corretoras")
        .update({
          og_titulo: og.og_titulo || null,
          og_descricao: og.og_descricao || null,
          og_imagem_url: og.og_imagem_url || null,
        })
        .eq("id", corretora.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Branding de compartilhamento salvo");
      qc.invalidateQueries({ queryKey: ["minha_corretora_og"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const upload = async (file: File) => {
    if (!corretora?.id) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 2MB.");
      return;
    }
    try {
      const ext = file.name.split(".").pop();
      const path = `og/${corretora.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("app-config")
        .upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("app-config").getPublicUrl(path);
      setOg((o) => ({ ...o, og_imagem_url: data.publicUrl }));
      toast.success("Imagem enviada");
    } catch (e: any) {
      toast.error(e.message || "Erro no upload");
    }
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 sm:p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Share2 className="h-5 w-5 text-primary" />
          Branding de compartilhamento
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Define a logo e o texto exibidos quando alguém compartilha um link
          de formulário desta administradora no WhatsApp, redes sociais ou
          e-mail.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : !corretora ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma associação vinculada ao seu usuário.
        </p>
      ) : (
        <>
          <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
            Editando: <span className="font-medium text-foreground">{corretora.nome}</span>
          </div>

          <div className="space-y-1.5">
            <Label>Título exibido no preview</Label>
            <Input
              value={og.og_titulo}
              onChange={(e) => setOg({ ...og, og_titulo: e.target.value })}
              placeholder="Vangard"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              rows={2}
              value={og.og_descricao}
              onChange={(e) => setOg({ ...og, og_descricao: e.target.value })}
              placeholder="Curta frase exibida abaixo do título."
            />
          </div>

          <div className="space-y-2">
            <Label>Logo / imagem</Label>
            <div className="flex items-start gap-4">
              <div className="h-20 w-20 rounded-xl border border-dashed border-border/60 bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                {og.og_imagem_url ? (
                  <img src={og.og_imagem_url} alt="" className="max-h-full max-w-full object-contain" />
                ) : (
                  <Share2 className="h-6 w-6 text-muted-foreground/40" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Input
                  value={og.og_imagem_url}
                  onChange={(e) => setOg({ ...og, og_imagem_url: e.target.value })}
                  placeholder="https://..."
                />
                <Label htmlFor="og-upload" className="cursor-pointer inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                  <Upload className="h-3.5 w-3.5" /> Enviar nova imagem (PNG/JPG até 2MB)
                </Label>
                <Input
                  id="og-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(f);
                  }}
                />
              </div>
            </div>
          </div>

          <Button
            onClick={() => salvar.mutate()}
            disabled={salvar.isPending}
            className="rounded-xl gap-2"
          >
            <Save className="h-4 w-4" />
            {salvar.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </>
      )}
    </div>
  );
}