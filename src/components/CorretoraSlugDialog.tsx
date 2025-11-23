import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CorretoraSlugDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  corretora: { id: string; nome: string; slug: string | null };
  onSuccess: () => void;
}

export function CorretoraSlugDialog({
  open,
  onOpenChange,
  corretora,
  onSuccess,
}: CorretoraSlugDialogProps) {
  const [slug, setSlug] = useState(corretora.slug || '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!slug) {
      toast.error('Digite um slug');
      return;
    }

    // Validar formato do slug
    const slugRegex = /^[a-z0-9-]{3,63}$/;
    if (!slugRegex.test(slug)) {
      toast.error('Slug inválido. Use apenas letras minúsculas, números e hífens (3-63 caracteres)');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('corretoras')
        .update({ slug })
        .eq('id', corretora.id);

      if (error) throw error;

      toast.success('Slug configurado com sucesso');
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Erro ao atualizar slug:', error);
      if (error.code === '23505') {
        toast.error('Este slug já está em uso');
      } else {
        toast.error('Erro ao configurar slug');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurar Slug - {corretora.nome}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="slug">
              Slug do Portal *
              <span className="text-xs text-muted-foreground ml-2">
                (usado para acesso: /{slug}/login)
              </span>
            </Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="valecar"
              required
            />
            <p className="text-xs text-muted-foreground">
              Apenas letras minúsculas, números e hífens (3-63 caracteres)
            </p>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              Salvar Slug
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
