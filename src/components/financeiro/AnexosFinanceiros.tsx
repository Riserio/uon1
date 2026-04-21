import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Paperclip, X, FileText, Download, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AnexoFinanceiro {
  url: string;
  nome: string;
  tamanho?: number;
  tipo?: string;
}

interface Props {
  anexos: AnexoFinanceiro[];
  onChange: (anexos: AnexoFinanceiro[]) => void;
  disabled?: boolean;
}

export function AnexosFinanceiros({ anexos, onChange, disabled }: Props) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const novos: AnexoFinanceiro[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name}: máximo 10MB`);
          continue;
        }
        const ext = file.name.split(".").pop();
        const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage
          .from("financeiro-anexos")
          .upload(path, file);
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage
          .from("financeiro-anexos")
          .getPublicUrl(path);
        novos.push({ url: publicUrl, nome: file.name, tamanho: file.size, tipo: file.type });
      }
      onChange([...(anexos || []), ...novos]);
      toast.success(`${novos.length} arquivo(s) anexado(s)`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar anexo");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleRemove = (idx: number) => {
    const novos = [...anexos];
    novos.splice(idx, 1);
    onChange(novos);
  };

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <Paperclip className="h-4 w-4" />
        Anexos
      </Label>
      <div className="flex items-center gap-2">
        <Input
          type="file"
          multiple
          onChange={handleUpload}
          disabled={disabled || uploading}
          className="cursor-pointer"
        />
        {uploading && <Upload className="h-4 w-4 animate-pulse text-muted-foreground" />}
      </div>
      {anexos && anexos.length > 0 && (
        <ul className="space-y-1 mt-2">
          {anexos.map((a, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate hover:underline"
                  title={a.nome}
                >
                  {a.nome}
                </a>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => window.open(a.url, "_blank")}
                  title="Baixar"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
                {!disabled && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => handleRemove(i)}
                    title="Remover"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
