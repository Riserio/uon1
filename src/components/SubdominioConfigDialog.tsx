import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Globe, Copy, Check, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SubdominioConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubdominioConfigDialog({ open, onOpenChange }: SubdominioConfigDialogProps) {
  const [subdominio, setSubdominio] = useState("");
  const [subdominioAtual, setSubdominioAtual] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const DOMINIO_BASE = "uon1.lovable.app";

  useEffect(() => {
    if (open) {
      loadSubdominioAtual();
    }
  }, [open]);

  const loadSubdominioAtual = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("subdominios_personalizados")
        .select("*")
        .eq("user_id", user.id)
        .eq("ativo", true)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSubdominioAtual(data.subdominio);
        setSubdominio(data.subdominio);
      }
    } catch (error) {
      console.error("Erro ao carregar subdomínio:", error);
    }
  };

  const validateSubdominio = (value: string): boolean => {
    setValidationError(null);

    if (!value) {
      setValidationError("Subdomínio é obrigatório");
      return false;
    }

    if (value.length < 3) {
      setValidationError("Subdomínio deve ter pelo menos 3 caracteres");
      return false;
    }

    if (value.length > 63) {
      setValidationError("Subdomínio deve ter no máximo 63 caracteres");
      return false;
    }

    const regex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
    if (!regex.test(value)) {
      setValidationError("Use apenas letras minúsculas, números e hífens (não pode começar ou terminar com hífen)");
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateSubdominio(subdominio)) {
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      if (subdominioAtual) {
        // Atualizar subdomínio existente
        const { error } = await supabase
          .from("subdominios_personalizados")
          .update({ subdominio: subdominio.toLowerCase(), updated_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .eq("ativo", true);

        if (error) {
          if (error.code === "23505") {
            toast.error("Este subdomínio já está em uso");
          } else {
            throw error;
          }
          return;
        }
      } else {
        // Criar novo subdomínio
        const { error } = await supabase.from("subdominios_personalizados").insert({
          user_id: user.id,
          subdominio: subdominio.toLowerCase(),
          ativo: true,
        });

        if (error) {
          if (error.code === "23505") {
            toast.error("Este subdomínio já está em uso");
          } else {
            throw error;
          }
          return;
        }
      }

      toast.success("Subdomínio configurado com sucesso!");
      setSubdominioAtual(subdominio.toLowerCase());
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao salvar subdomínio:", error);
      toast.error("Erro ao configurar subdomínio");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    const urlCompleta = `https://${subdominio}.${DOMINIO_BASE}`;
    await navigator.clipboard.writeText(urlCompleta);
    setCopied(true);
    toast.success("URL copiada!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubdominioChange = (value: string) => {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSubdominio(cleaned);
    if (cleaned) {
      validateSubdominio(cleaned);
    } else {
      setValidationError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Configurar Subdomínio Personalizado
          </DialogTitle>
          <DialogDescription>
            Configure um subdomínio personalizado para aplicar a marca do seu parceiro
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              O subdomínio personalizado permite que você e seus parceiros acessem o sistema com uma URL personalizada,
              como <strong>parceiro.{DOMINIO_BASE}</strong>
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="subdominio">Subdomínio Personalizado</Label>
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <Input
                  id="subdominio"
                  value={subdominio}
                  onChange={(e) => handleSubdominioChange(e.target.value)}
                  placeholder="parceiro"
                  className={validationError ? "border-destructive" : ""}
                />
                {validationError && <p className="text-sm text-destructive mt-1">{validationError}</p>}
              </div>
              <div className="flex items-center px-3 py-2 bg-muted rounded-md text-sm text-muted-foreground whitespace-nowrap">
                .{DOMINIO_BASE}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Use apenas letras minúsculas, números e hífens (3-63 caracteres)
            </p>
          </div>

          {subdominioAtual && (
            <div className="space-y-2">
              <Label>URL Atual</Label>
              <div className="flex gap-2">
                <Input value={`https://${subdominioAtual}.${DOMINIO_BASE}`} readOnly className="font-mono text-sm" />
                <Button type="button" variant="outline" size="icon" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <h4 className="font-medium text-sm">Como funciona:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>O subdomínio deve ser único no sistema</li>
              <li>
                Após configurar, você poderá acessar via:{" "}
                <strong>
                  {subdominio || "seusubdominio"}.{DOMINIO_BASE}
                </strong>
              </li>
              <li>Ideal para aplicar a identidade da marca do seu parceiro</li>
              <li>Você pode alterar o subdomínio a qualquer momento</li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading || !subdominio || !!validationError}>
            {loading ? "Salvando..." : subdominioAtual ? "Atualizar" : "Configurar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
