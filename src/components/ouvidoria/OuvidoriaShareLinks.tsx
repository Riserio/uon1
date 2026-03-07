import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Share2, Copy, Code, ExternalLink } from "lucide-react";

interface Props {
  corretoraId: string;
}

export function OuvidoriaShareLinks({ corretoraId }: Props) {
  const [slug, setSlug] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("corretoras")
        .select("slug, id")
        .eq("id", corretoraId)
        .maybeSingle();
      setSlug(data?.slug || data?.id || corretoraId);
    })();
  }, [corretoraId]);

  const baseUrl = window.location.origin;
  const link = `${baseUrl}/ouvidoria/${slug}`;
  const embedCode = `<iframe src="${link}" width="100%" height="700" frameborder="0" style="border:0;border-radius:12px;" allow="clipboard-write"></iframe>`;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-full">
          <Share2 className="h-4 w-4" /> Compartilhar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Compartilhar Ouvidoria</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          {/* Direct link */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <ExternalLink className="h-4 w-4" /> Link direto
            </Label>
            <div className="flex gap-2">
              <Input readOnly value={link} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => copy(link, "Link")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Envie este link para que os associados acessem o formulário de ouvidoria.</p>
          </div>

          {/* Embed */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <Code className="h-4 w-4" /> Código para incorporar (embed)
            </Label>
            <div className="flex gap-2">
              <Input readOnly value={embedCode} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => copy(embedCode, "Código embed")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Cole este código HTML na sua página para incorporar o formulário.</p>
          </div>

          {/* Preview */}
          <div className="rounded-xl border overflow-hidden">
            <div className="bg-muted/30 px-3 py-2 text-xs text-muted-foreground font-medium">Prévia</div>
            <iframe src={link} className="w-full h-[300px] border-0" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
