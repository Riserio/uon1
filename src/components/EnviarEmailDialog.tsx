import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';

interface EnviarEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  atendimentoId: string;
  atendimentoAssunto: string;
  conteudoInicial?: string;
  emailInicial?: string;
  status?: string;
}

export function EnviarEmailDialog({
  open,
  onOpenChange,
  atendimentoId,
  atendimentoAssunto,
  conteudoInicial = '',
  emailInicial = '',
  status
}: EnviarEmailDialogProps) {
  const [destinatario, setDestinatario] = useState('');
  const [assunto, setAssunto] = useState(`Atualização: ${atendimentoAssunto}`);
  const [mensagem, setMensagem] = useState(conteudoInicial);
  const [enviando, setEnviando] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  // Load email template based on status
  useEffect(() => {
    const loadTemplate = async () => {
      if (!open || !status) return;
      
      setLoadingTemplate(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Find active template for this status
        const { data: templates, error } = await supabase
          .from('email_templates')
          .select('*')
          .eq('user_id', user.id)
          .eq('ativo', true)
          .contains('status', [status]);

        if (error) {
          console.error('Erro ao carregar template:', error);
          return;
        }

        if (templates && templates.length > 0) {
          const template = templates[0];
          setAssunto(template.assunto);
          setMensagem(template.corpo);
          toast.success('Template carregado automaticamente');
        }
      } catch (error) {
        console.error('Erro ao carregar template:', error);
      } finally {
        setLoadingTemplate(false);
      }
    };

    loadTemplate();
  }, [open, status]);

  // Update destinatario when emailInicial changes
  useEffect(() => {
    if (emailInicial) {
      setDestinatario(emailInicial);
    }
  }, [emailInicial]);

  const handleEnviar = async () => {
    if (!destinatario.trim() || !assunto || !mensagem) {
      toast.error('Preencha todos os campos');
      return;
    }

    // Parse multiple emails (comma or semicolon separated)
    const emails = destinatario
      .split(/[,;]/)
      .map(email => email.trim())
      .filter(email => email.length > 0);

    setEnviando(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: atendimento } = await supabase
        .from('atendimentos')
        .select('status')
        .eq('id', atendimentoId)
        .single();

      const response = await supabase.functions.invoke('enviar-email-atendimento', {
        body: {
          to: emails,
          subject: assunto,
          message: mensagem,
          atendimentoAssunto,
          status: atendimento?.status || 'andamento',
          atendimentoId
        }
      });

      if (response.error) throw response.error;

      // Salvar no histórico para cada destinatário
      for (const email of emails) {
        await supabase.from('email_historico').insert({
          atendimento_id: atendimentoId,
          destinatario: email,
          assunto,
          corpo: mensagem,
          status: 'enviado',
          enviado_por: user.id
        });
      }

      toast.success(`E-mail enviado com sucesso para ${emails.length} destinatário(s)`);
      onOpenChange(false);
      setDestinatario('');
      setAssunto(`Atualização: ${atendimentoAssunto}`);
      setMensagem('');
    } catch (error) {
      console.error('Erro ao enviar e-mail:', error);
      toast.error('Erro ao enviar e-mail');

      // Salvar erro no histórico
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        for (const email of emails) {
          await supabase.from('email_historico').insert({
            atendimento_id: atendimentoId,
            destinatario: email,
            assunto,
            corpo: mensagem,
            status: 'erro',
            erro_mensagem: error instanceof Error ? error.message : 'Erro desconhecido',
            enviado_por: user.id
          });
        }
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Enviar E-mail ao Cliente</DialogTitle>
          <DialogDescription>
            Envie uma atualização sobre o atendimento por e-mail
          </DialogDescription>
        </DialogHeader>
        {loadingTemplate ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2 text-sm text-muted-foreground">Carregando template...</span>
          </div>
        ) : (
          <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="destinatario">E-mail do Destinatário(s) *</Label>
            <Input
              id="destinatario"
              type="text"
              placeholder="cliente@exemplo.com, outro@exemplo.com"
              value={destinatario}
              onChange={(e) => setDestinatario(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Separe múltiplos e-mails com vírgula ou ponto e vírgula
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assunto">Assunto *</Label>
            <Input
              id="assunto"
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mensagem">Mensagem *</Label>
            <Textarea
              id="mensagem"
              rows={8}
              placeholder="Digite a mensagem para o cliente..."
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={enviando}
            >
              Cancelar
            </Button>
            <Button onClick={handleEnviar} disabled={enviando}>
              {enviando ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Enviar E-mail
                </>
              )}
            </Button>
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
