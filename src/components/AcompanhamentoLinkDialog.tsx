import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Mail, MessageCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { openWhatsApp } from '@/utils/whatsapp';

interface AcompanhamentoLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AcompanhamentoLinkDialog({
  open,
  onOpenChange,
}: AcompanhamentoLinkDialogProps) {
  const link = `${window.location.origin}/acompanhamento`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copiado para área de transferência');
    } catch (error) {
      toast.error('Erro ao copiar link');
    }
  };

  const handleShareEmail = () => {
    const subject = encodeURIComponent('Acompanhe seu sinistro');
    const body = encodeURIComponent(
      `Olá!\n\nVocê pode acompanhar o status do seu sinistro através do link abaixo:\n\n${link}\n\nDigite a placa do seu veículo ou CPF para consultar.`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  const handleShareWhatsApp = () => {
    openWhatsApp({
      message: `Olá! Você pode acompanhar o status do seu sinistro através deste link: ${link}\n\nDigite a placa do seu veículo ou CPF para consultar.`
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link de Acompanhamento de Sinistro</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              Compartilhe este link com seus clientes para que eles possam acompanhar o status do sinistro
            </p>
            
            <div className="flex gap-2">
              <Input
                value={link}
                readOnly
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyLink}
                title="Copiar link"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleShareEmail}
            >
              <Mail className="mr-2 h-4 w-4" />
              Email
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleShareWhatsApp}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              WhatsApp
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => window.open(link, '_blank')}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
