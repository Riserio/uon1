import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';

interface EnviarEmailSMTPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  destinatarios: string[];
  onSuccess?: () => void;
}

export function EnviarEmailSMTPDialog({
  open,
  onOpenChange,
  destinatarios,
  onSuccess
}: EnviarEmailSMTPDialogProps) {
  const [assunto, setAssunto] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);

  const handleEnviar = async () => {
    if (!assunto.trim() || !mensagem.trim()) {
      toast.error('Assunto e mensagem são obrigatórios');
      return;
    }

    if (destinatarios.length === 0) {
      toast.error('Nenhum destinatário selecionado');
      return;
    }

    setEnviando(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error('Sessão expirada');
        return;
      }

      const response = await supabase.functions.invoke('enviar-email-smtp', {
        body: {
          to: destinatarios,
          subject: assunto,
          message: mensagem,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) {
        throw response.error;
      }

      const { results } = response.data;
      const sucessos = results.filter((r: any) => r.status === 'enviado').length;
      const erros = results.filter((r: any) => r.status === 'erro').length;

      if (sucessos > 0) {
        toast.success(`${sucessos} email(s) enviado(s) com sucesso!`);
      }
      if (erros > 0) {
        toast.error(`${erros} email(s) falharam`);
      }

      setAssunto('');
      setMensagem('');
      onOpenChange(false);
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('Erro ao enviar emails:', error);
      toast.error(error.message || 'Erro ao enviar emails');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Enviar Email
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Destinatários ({destinatarios.length})</Label>
            <div className="mt-2 p-3 bg-muted rounded-md text-sm max-h-32 overflow-y-auto">
              {destinatarios.map((email, index) => (
                <div key={index} className="py-1">{email}</div>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="assunto">Assunto *</Label>
            <Input
              id="assunto"
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              placeholder="Assunto do email"
            />
          </div>

          <div>
            <Label htmlFor="mensagem">Mensagem *</Label>
            <Textarea
              id="mensagem"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Digite sua mensagem..."
              rows={8}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={enviando}
            >
              Cancelar
            </Button>
            <Button onClick={handleEnviar} disabled={enviando}>
              {enviando ? 'Enviando...' : 'Enviar Email'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
