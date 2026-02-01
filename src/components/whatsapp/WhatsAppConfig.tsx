import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MessageCircle, Save, Clock, Zap, ExternalLink, TestTube, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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
  n8n_webhook_url: string;
  n8n_ativo: boolean;
  ultimo_envio_automatico?: string;
  ultimo_erro_envio?: string;
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
    n8n_webhook_url: '',
    n8n_ativo: false,
  });
  const [corretoras, setCorretoras] = useState<{ id: string; nome: string }[]>([]);
  const [selectedCorretora, setSelectedCorretora] = useState<string>(corretoraId || '');
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadCorretoras();
  }, []);

  useEffect(() => {
    if (selectedCorretora) {
      loadConfig(selectedCorretora);
    }
  }, [selectedCorretora]);

  const loadCorretoras = async () => {
    const { data } = await supabase
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
    const { data } = await supabase
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
        n8n_webhook_url: data.n8n_webhook_url || '',
        n8n_ativo: data.n8n_ativo ?? false,
        ultimo_envio_automatico: data.ultimo_envio_automatico,
        ultimo_erro_envio: data.ultimo_erro_envio,
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
        n8n_webhook_url: '',
        n8n_ativo: false,
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

    if (config.n8n_ativo && !config.n8n_webhook_url) {
      toast.error('Configure a URL do webhook n8n para ativar a integração');
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
        n8n_webhook_url: config.n8n_webhook_url,
        n8n_ativo: config.n8n_ativo,
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

  const handleTestN8N = async () => {
    if (!config.n8n_webhook_url) {
      toast.error('Configure a URL do webhook n8n primeiro');
      return;
    }

    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('enviar-whatsapp-n8n', {
        body: {
          corretora_id: selectedCorretora,
          tipo: 'cobranca',
          mensagem: '🧪 *TESTE DE INTEGRAÇÃO*\n\nSe você recebeu esta mensagem, a integração n8n está funcionando corretamente!',
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('Mensagem de teste enviada com sucesso!');
        loadConfig(selectedCorretora);
      } else {
        throw new Error(data?.error || 'Erro desconhecido');
      }
    } catch (error: any) {
      console.error('Test error:', error);
      toast.error('Erro no teste: ' + error.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
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

      {/* n8n Integration Card */}
      <Card className="border-orange-200 dark:border-orange-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-orange-500" />
            Integração n8n (Envio Automático)
          </CardTitle>
          <CardDescription>
            Configure a automação via n8n para envio automático de mensagens
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Alert */}
          {config.ultimo_erro_envio && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Último erro</AlertTitle>
              <AlertDescription>{config.ultimo_erro_envio}</AlertDescription>
            </Alert>
          )}

          {config.ultimo_envio_automatico && !config.ultimo_erro_envio && (
            <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-800 dark:text-green-200">Último envio bem-sucedido</AlertTitle>
              <AlertDescription className="text-green-700 dark:text-green-300">
                {new Date(config.ultimo_envio_automatico).toLocaleString('pt-BR')}
              </AlertDescription>
            </Alert>
          )}

          {/* Setup Instructions */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Como configurar o n8n</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>1. Crie uma conta gratuita em <a href="https://n8n.io" target="_blank" rel="noopener noreferrer" className="underline font-medium">n8n.io</a></p>
              <p>2. Crie um workflow com: <strong>Webhook → WhatsApp</strong></p>
              <p>3. Cole a URL do webhook abaixo</p>
              <Button variant="outline" size="sm" className="mt-2" asChild>
                <a href="https://n8n.io" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Abrir n8n
                </a>
              </Button>
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label>URL do Webhook n8n</Label>
            <Input
              placeholder="https://seu-n8n.app.n8n.cloud/webhook/..."
              value={config.n8n_webhook_url}
              onChange={(e) => setConfig({ ...config, n8n_webhook_url: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Copie a URL do nó Webhook no seu workflow n8n
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                checked={config.n8n_ativo}
                onCheckedChange={(checked) => setConfig({ ...config, n8n_ativo: checked })}
              />
              <Label>Ativar integração n8n</Label>
            </div>
            
            <Button 
              variant="outline" 
              onClick={handleTestN8N} 
              disabled={testing || !config.n8n_webhook_url || !config.id}
              title={!config.id ? 'Salve a configuração primeiro' : ''}
            >
              <TestTube className="h-4 w-4 mr-2" />
              {testing ? 'Testando...' : !config.id ? 'Salve primeiro' : 'Testar Integração'}
            </Button>
          </div>

          {/* Auto-send options */}
          <div className="space-y-4 border-t pt-4">
            <h4 className="font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Envio Automático via n8n
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
                  disabled={!config.n8n_ativo}
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
                  disabled={!config.n8n_ativo}
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
                  disabled={!config.n8n_ativo}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              {loading ? 'Salvando...' : 'Salvar Configuração'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
