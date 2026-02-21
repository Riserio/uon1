import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MessageCircle, Save } from 'lucide-react';
import { formatPhone } from '@/lib/validators';

export function WhatsAppNotificacaoGlobal() {
  const [notificarAtivo, setNotificarAtivo] = useState(false);
  const [notificarNumero, setNotificarNumero] = useState('');
  const [configId, setConfigId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    const { data } = await supabase
      .from('whatsapp_notificacao_global')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (data) {
      setConfigId(data.id);
      setNotificarAtivo(data.notificar_ativo ?? false);
      setNotificarNumero(data.notificar_numero || '');
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const payload = {
        notificar_ativo: notificarAtivo,
        notificar_numero: notificarNumero.replace(/\D/g, '') || null,
        updated_at: new Date().toISOString(),
      };

      if (configId) {
        const { error } = await supabase
          .from('whatsapp_notificacao_global')
          .update(payload)
          .eq('id', configId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('whatsapp_notificacao_global')
          .insert(payload);
        if (error) throw error;
      }

      toast.success('Configuração de notificação salva!');
      loadConfig();
    } catch (error: unknown) {
      toast.error('Erro ao salvar: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          Notificação de Mensagens Recebidas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Receba uma notificação no WhatsApp toda vez que uma nova mensagem chegar no sistema — independente da associação.
        </p>

        <div className="flex items-center gap-3">
          <Switch
            checked={notificarAtivo}
            onCheckedChange={setNotificarAtivo}
          />
          <Label>Ativar notificação</Label>
        </div>

        {notificarAtivo && (
          <div className="space-y-2">
            <Label>Número para notificação</Label>
            <Input
              placeholder="(XX) XXXXX-XXXX"
              value={notificarNumero ? formatPhone(notificarNumero) : ''}
              onChange={(e) => setNotificarNumero(formatPhone(e.target.value))}
              maxLength={16}
            />
            <p className="text-xs text-muted-foreground">
              Este número receberá uma mensagem automática quando novas mensagens chegarem.
            </p>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
