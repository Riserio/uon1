import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MessageCircle, Save, Clock } from 'lucide-react';

interface WhatsAppConfigProps {
  corretoraId?: string;
}

interface WhatsAppConfigData {
  id?: string;
  telefone_whatsapp: string;
  nome_exibicao: string;
  ativo: boolean;
  envio_automatico_cobranca: boolean;
  envio_automatico_eventos: boolean;
  envio_automatico_mgf: boolean;
  horario_envio: string;
}

export function WhatsAppConfig({ corretoraId }: WhatsAppConfigProps) {
  const [config, setConfig] = useState<WhatsAppConfigData>({
    telefone_whatsapp: '',
    nome_exibicao: '',
    ativo: true,
    envio_automatico_cobranca: false,
    envio_automatico_eventos: false,
    envio_automatico_mgf: false,
    horario_envio: '08:00',
  });
  const [corretoras, setCorretoras] = useState<{ id: string; nome: string }[]>([]);
  const [selectedCorretora, setSelectedCorretora] = useState<string>(corretoraId || '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCorretoras();
  }, []);

  useEffect(() => {
    if (selectedCorretora) {
      loadConfig(selectedCorretora);
    }
  }, [selectedCorretora]);

  const loadCorretoras = async () => {
    const { data, error } = await supabase
      .from('corretoras')
      .select('id, nome')
      .order('nome');
    
    if (data) {
      setCorretoras(data);
      if (!selectedCorretora && data.length > 0) {
        setSelectedCorretora(data[0].id);
      }
    }
  };

  const loadConfig = async (corretoraId: string) => {
    const { data, error } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('corretora_id', corretoraId)
      .maybeSingle();

    if (data) {
      setConfig({
        id: data.id,
        telefone_whatsapp: data.telefone_whatsapp || '',
        nome_exibicao: data.nome_exibicao || '',
        ativo: data.ativo ?? true,
        envio_automatico_cobranca: data.envio_automatico_cobranca ?? false,
        envio_automatico_eventos: data.envio_automatico_eventos ?? false,
        envio_automatico_mgf: data.envio_automatico_mgf ?? false,
        horario_envio: data.horario_envio || '08:00',
      });
    } else {
      setConfig({
        telefone_whatsapp: '',
        nome_exibicao: '',
        ativo: true,
        envio_automatico_cobranca: false,
        envio_automatico_eventos: false,
        envio_automatico_mgf: false,
        horario_envio: '08:00',
      });
    }
  };

  const handleSave = async () => {
    if (!selectedCorretora) {
      toast.error('Selecione uma associação');
      return;
    }

    if (!config.telefone_whatsapp) {
      toast.error('Informe o número do WhatsApp');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const payload = {
        corretora_id: selectedCorretora,
        telefone_whatsapp: config.telefone_whatsapp,
        nome_exibicao: config.nome_exibicao,
        ativo: config.ativo,
        envio_automatico_cobranca: config.envio_automatico_cobranca,
        envio_automatico_eventos: config.envio_automatico_eventos,
        envio_automatico_mgf: config.envio_automatico_mgf,
        horario_envio: config.horario_envio,
        created_by: user?.id,
      };

      if (config.id) {
        const { error } = await supabase
          .from('whatsapp_config')
          .update(payload)
          .eq('id', config.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('whatsapp_config')
          .insert(payload);
        
        if (error) throw error;
      }

      toast.success('Configuração salva com sucesso!');
      loadConfig(selectedCorretora);
    } catch (error: any) {
      console.error('Error saving config:', error);
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-green-500" />
          Configuração do WhatsApp
        </CardTitle>
        <CardDescription>
          Configure o número do WhatsApp e as opções de envio automático
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Associação</Label>
          <Select value={selectedCorretora} onValueChange={setSelectedCorretora}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a associação" />
            </SelectTrigger>
            <SelectContent>
              {corretoras.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Número do WhatsApp *</Label>
            <Input
              placeholder="(11) 99999-9999"
              value={config.telefone_whatsapp}
              onChange={(e) => setConfig({ ...config, telefone_whatsapp: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Número que receberá os resumos automáticos
            </p>
          </div>

          <div className="space-y-2">
            <Label>Nome de Exibição</Label>
            <Input
              placeholder="Nome do destinatário"
              value={config.nome_exibicao}
              onChange={(e) => setConfig({ ...config, nome_exibicao: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-4 border-t pt-4">
          <h4 className="font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Envio Automático
          </h4>

          <div className="space-y-2">
            <Label>Horário do Envio</Label>
            <Input
              type="time"
              value={config.horario_envio}
              onChange={(e) => setConfig({ ...config, horario_envio: e.target.value })}
              className="w-32"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Resumo de Cobrança</Label>
                <p className="text-xs text-muted-foreground">
                  Enviar automaticamente após atualização de cobrança
                </p>
              </div>
              <Switch
                checked={config.envio_automatico_cobranca}
                onCheckedChange={(checked) => setConfig({ ...config, envio_automatico_cobranca: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Resumo de Eventos</Label>
                <p className="text-xs text-muted-foreground">
                  Enviar automaticamente após atualização de eventos
                </p>
              </div>
              <Switch
                checked={config.envio_automatico_eventos}
                onCheckedChange={(checked) => setConfig({ ...config, envio_automatico_eventos: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Resumo MGF</Label>
                <p className="text-xs text-muted-foreground">
                  Enviar automaticamente após atualização de MGF
                </p>
              </div>
              <Switch
                checked={config.envio_automatico_mgf}
                onCheckedChange={(checked) => setConfig({ ...config, envio_automatico_mgf: checked })}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={config.ativo}
              onCheckedChange={(checked) => setConfig({ ...config, ativo: checked })}
            />
            <Label>WhatsApp ativo para esta associação</Label>
          </div>
          
          <Button onClick={handleSave} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Salvando...' : 'Salvar Configuração'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
