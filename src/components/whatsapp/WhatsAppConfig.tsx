import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MessageCircle, Save, Clock, CheckCircle, XCircle, Plus, Trash2, Phone, Zap, RotateCcw, Bell } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatPhone } from '@/lib/validators';
import { WhatsAppTemplateSchedules } from './WhatsAppTemplateSchedules';
import { WhatsAppNotificacaoGlobal } from './WhatsAppNotificacaoGlobal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface WhatsAppConfigProps {
  corretoraId?: string;
}

interface PhoneEntry {
  number: string;
  label: string;
}

interface WhatsAppConfigData {
  id?: string;
  telefone_whatsapp: string;
  nome_exibicao: string;
  ativo: boolean;
  envio_automatico_cobranca: boolean;
  envio_automatico_eventos: boolean;
  envio_automatico_mgf: boolean;
  fluxo_cobranca_id: string;
  fluxo_eventos_id: string;
  fluxo_mgf_id: string;
  horario_envio: string;
  n8n_webhook_url: string;
  n8n_ativo: boolean;
  ultimo_envio_automatico?: string;
  ultimo_erro_envio?: string;
  notificar_numero: string;
  notificar_ativo: boolean;
  reset_keywords: string[];
  timeout_minutos: number;
}

interface FlowOption {
  id: string;
  name: string;
}

export function WhatsAppConfig({ corretoraId }: WhatsAppConfigProps) {
  const [config, setConfig] = useState<WhatsAppConfigData>({
    telefone_whatsapp: '',
    nome_exibicao: '',
    ativo: true,
    envio_automatico_cobranca: false,
    envio_automatico_eventos: false,
    envio_automatico_mgf: false,
    fluxo_cobranca_id: '',
    fluxo_eventos_id: '',
    fluxo_mgf_id: '',
    horario_envio: '08:00',
    n8n_webhook_url: '',
    n8n_ativo: false,
    notificar_numero: '',
    notificar_ativo: false,
    reset_keywords: ['reiniciar', 'menu', 'voltar', 'sair', '0'],
    timeout_minutos: 30,
  });
  const [keywordInput, setKeywordInput] = useState('');
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneEntry[]>([{ number: '', label: '' }]);
  const [corretoras, setCorretoras] = useState<{ id: string; nome: string }[]>([]);
  const [selectedCorretora, setSelectedCorretora] = useState<string>(corretoraId || '');
  const [flows, setFlows] = useState<FlowOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadCorretoras();
    loadFlows();
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

  const loadFlows = async () => {
    const { data } = await supabase
      .from('whatsapp_flows')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    if (data) setFlows(data);
  };

  const parsePhoneNumbers = (telefone: string, nome: string): PhoneEntry[] => {
    if (!telefone) return [{ number: '', label: '' }];
    const numbers = telefone.split(',').map(n => n.trim()).filter(Boolean);
    const labels = nome.split(',').map(n => n.trim());
    if (numbers.length === 0) return [{ number: '', label: '' }];
    return numbers.map((num, i) => ({ number: num, label: labels[i] || '' }));
  };

  const loadConfig = async (cId: string) => {
    const { data } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('corretora_id', cId)
      .maybeSingle();

    if (data) {
      const phones = parsePhoneNumbers(data.telefone_whatsapp || '', data.nome_exibicao || '');
      setPhoneNumbers(phones);
      setConfig({
        id: data.id,
        telefone_whatsapp: data.telefone_whatsapp || '',
        nome_exibicao: data.nome_exibicao || '',
        ativo: data.ativo ?? true,
        envio_automatico_cobranca: data.envio_automatico_cobranca ?? false,
        envio_automatico_eventos: data.envio_automatico_eventos ?? false,
        envio_automatico_mgf: data.envio_automatico_mgf ?? false,
        fluxo_cobranca_id: (data as any).fluxo_cobranca_id || '',
        fluxo_eventos_id: (data as any).fluxo_eventos_id || '',
        fluxo_mgf_id: (data as any).fluxo_mgf_id || '',
        horario_envio: data.horario_envio || '08:00',
        n8n_webhook_url: data.n8n_webhook_url || '',
        n8n_ativo: data.n8n_ativo ?? false,
        ultimo_envio_automatico: data.ultimo_envio_automatico,
        ultimo_erro_envio: data.ultimo_erro_envio,
        notificar_numero: (data as any).notificar_numero || '',
        notificar_ativo: (data as any).notificar_ativo ?? false,
        reset_keywords: (data as any).reset_keywords || ['reiniciar', 'menu', 'voltar', 'sair', '0'],
        timeout_minutos: (data as any).timeout_minutos ?? 30,
      });
    } else {
      setPhoneNumbers([{ number: '', label: '' }]);
      setConfig({
        telefone_whatsapp: '',
        nome_exibicao: '',
        ativo: true,
        envio_automatico_cobranca: false,
        envio_automatico_eventos: false,
        envio_automatico_mgf: false,
        fluxo_cobranca_id: '',
        fluxo_eventos_id: '',
        fluxo_mgf_id: '',
        horario_envio: '08:00',
        n8n_webhook_url: '',
        n8n_ativo: false,
        notificar_numero: '',
        notificar_ativo: false,
        reset_keywords: ['reiniciar', 'menu', 'voltar', 'sair', '0'],
        timeout_minutos: 30,
      });
    }
  };

  const addPhoneNumber = () => {
    setPhoneNumbers([...phoneNumbers, { number: '', label: '' }]);
  };

  const removePhoneNumber = (index: number) => {
    if (phoneNumbers.length <= 1) return;
    setPhoneNumbers(phoneNumbers.filter((_, i) => i !== index));
  };

  const updatePhoneNumber = (index: number, field: 'number' | 'label', value: string) => {
    const updated = [...phoneNumbers];
    updated[index] = { ...updated[index], [field]: value };
    setPhoneNumbers(updated);
  };

  const handleSave = async () => {
    if (!selectedCorretora) {
      toast.error('Selecione uma associação');
      return;
    }

    const validPhones = phoneNumbers.filter(p => p.number.trim());
    if (validPhones.length === 0) {
      toast.error('Informe ao menos um número de WhatsApp');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const telefones = validPhones.map(p => p.number.trim()).join(', ');
      const nomes = validPhones.map(p => p.label.trim()).join(', ');

      const payload = {
        corretora_id: selectedCorretora,
        telefone_whatsapp: telefones,
        nome_exibicao: nomes,
        ativo: config.ativo,
        envio_automatico_cobranca: config.envio_automatico_cobranca,
        envio_automatico_eventos: config.envio_automatico_eventos,
        envio_automatico_mgf: config.envio_automatico_mgf,
        fluxo_cobranca_id: config.fluxo_cobranca_id || null,
        fluxo_eventos_id: config.fluxo_eventos_id || null,
        fluxo_mgf_id: config.fluxo_mgf_id || null,
        horario_envio: config.horario_envio,
        n8n_webhook_url: config.n8n_webhook_url,
        n8n_ativo: config.n8n_ativo,
        reset_keywords: config.reset_keywords,
        timeout_minutos: config.timeout_minutos,
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
    } catch (error: unknown) {
      console.error('Error saving config:', error);
      toast.error('Erro ao salvar: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  const handleTestMeta = async () => {
    if (!config.id) {
      toast.error('Salve a configuração primeiro');
      return;
    }

    setTesting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/enviar-whatsapp-meta`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${session?.access_token || anonKey}`,
        },
        body: JSON.stringify({
          corretora_id: selectedCorretora,
          tipo: 'cobranca',
          mensagem: '🧪 *TESTE DE INTEGRAÇÃO*\n\nSe você recebeu esta mensagem, a integração WhatsApp Business API está funcionando corretamente! ✅',
        }),
      });

      const data = await response.json();

      if (data?.success) {
        toast.success('Mensagem de teste enviada com sucesso!');
        loadConfig(selectedCorretora);
      } else {
        throw new Error(data?.error || 'Erro desconhecido');
      }
    } catch (error: unknown) {
      console.error('Test error:', error);
      toast.error('Erro no teste: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Unified header: association selector + status + save */}
      <Card className="rounded-2xl">
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-4 lg:items-end lg:justify-between">
            <div className="flex-1 space-y-2">
              <Label className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-green-600" />
                Associação
              </Label>
              <Select value={selectedCorretora} onValueChange={setSelectedCorretora}>
                <SelectTrigger><SelectValue placeholder="Selecione a associação" /></SelectTrigger>
                <SelectContent>
                  {corretoras.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={config.ativo}
                  onCheckedChange={(checked) => setConfig({ ...config, ativo: checked })}
                />
                <Label className="whitespace-nowrap">WhatsApp ativo</Label>
              </div>
              <Button onClick={handleSave} disabled={loading}>
                <Save className="h-4 w-4 mr-2" />
                {loading ? 'Salvando...' : 'Salvar tudo'}
              </Button>
            </div>
          </div>

          {(config.ultimo_erro_envio || config.ultimo_envio_automatico) && (
            <div className="mt-4">
              {config.ultimo_erro_envio ? (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Último erro</AlertTitle>
                  <AlertDescription>{config.ultimo_erro_envio}</AlertDescription>
                </Alert>
              ) : (
                <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-800 dark:text-green-200">Último envio bem-sucedido</AlertTitle>
                  <AlertDescription className="text-green-700 dark:text-green-300">
                    {new Date(config.ultimo_envio_automatico!).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sub-tabs */}
      <Tabs defaultValue="conexao" className="space-y-4">
        <TabsList className="rounded-full bg-muted/40 backdrop-blur p-1">
          <TabsTrigger value="conexao" className="rounded-full gap-1.5">
            <Phone className="h-3.5 w-3.5" /> Conexão & Números
          </TabsTrigger>
          <TabsTrigger value="envios" className="rounded-full gap-1.5">
            <Zap className="h-3.5 w-3.5" /> Envios Automáticos
          </TabsTrigger>
          <TabsTrigger value="fluxo" className="rounded-full gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> Reinício de Fluxo
          </TabsTrigger>
          <TabsTrigger value="alertas" className="rounded-full gap-1.5">
            <Bell className="h-3.5 w-3.5" /> Alertas Globais
          </TabsTrigger>
        </TabsList>

        {/* === CONEXÃO === */}
        <TabsContent value="conexao">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Phone className="h-4 w-4" /> Números de Destino
              </CardTitle>
              <CardDescription>
                Todos os números abaixo recebem os resumos automáticos configurados nesta associação.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {phoneNumbers.map((phone, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-green-100 text-green-700 text-xs font-bold shrink-0 dark:bg-green-900 dark:text-green-300">
                      {index + 1}
                    </div>
                    <Input
                      placeholder="(XX) XXXXX-XXXX"
                      value={phone.number}
                      onChange={(e) => updatePhoneNumber(index, 'number', formatPhone(e.target.value))}
                      className="flex-1"
                      maxLength={16}
                    />
                    <Input
                      placeholder="Nome (opcional)"
                      value={phone.label}
                      onChange={(e) => updatePhoneNumber(index, 'label', e.target.value)}
                      className="flex-1"
                    />
                    {phoneNumbers.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removePhoneNumber(index)} className="shrink-0 text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={addPhoneNumber} className="gap-1">
                <Plus className="h-3.5 w-3.5" /> Adicionar número
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === ENVIOS AUTOMÁTICOS === */}
        <TabsContent value="envios" className="space-y-4">
          {/* Post-import triggers */}
          <Collapsible>
            <Card className="rounded-2xl">
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer select-none [&[data-state=open]_svg.chev]:rotate-180">
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-1.5">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Zap className="h-4 w-4 text-amber-500" /> Disparo após importação
                      </CardTitle>
                      <CardDescription>
                        Quando a importação de BI terminar, dispara o fluxo de automação selecionado.
                      </CardDescription>
                    </div>
                    <ChevronDown className="chev h-4 w-4 text-muted-foreground transition-transform shrink-0" />
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-3">
              {([
                { key: 'cobranca', label: 'Resumo de Cobrança', toggle: 'envio_automatico_cobranca', flow: 'fluxo_cobranca_id' },
                { key: 'eventos', label: 'Resumo de Eventos', toggle: 'envio_automatico_eventos', flow: 'fluxo_eventos_id' },
                { key: 'mgf', label: 'Resumo MGF', toggle: 'envio_automatico_mgf', flow: 'fluxo_mgf_id' },
              ] as const).map((row) => {
                const checked = (config as any)[row.toggle] as boolean;
                const flowId = (config as any)[row.flow] as string;
                return (
                  <div key={row.key} className="rounded-xl border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="font-medium">{row.label}</Label>
                      <Switch
                        checked={checked}
                        onCheckedChange={(v) => setConfig({ ...config, [row.toggle]: v } as any)}
                      />
                    </div>
                    {checked && (
                      <Select value={flowId} onValueChange={(v) => setConfig({ ...config, [row.flow]: v } as any)}>
                        <SelectTrigger><SelectValue placeholder="Selecione o fluxo..." /></SelectTrigger>
                        <SelectContent>
                          {flows.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Scheduled templates */}
          {selectedCorretora && <WhatsAppTemplateSchedules corretoraId={selectedCorretora} />}
        </TabsContent>

        {/* === REINÍCIO DE FLUXO === */}
        <TabsContent value="fluxo">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-orange-500" /> Reinício de Fluxo
              </CardTitle>
              <CardDescription>
                Define quando um fluxo expira e quais palavras o contato pode enviar para reiniciá-lo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Tempo de expiração (minutos)</Label>
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={config.timeout_minutos}
                  onChange={(e) => setConfig({ ...config, timeout_minutos: parseInt(e.target.value) || 30 })}
                  className="w-40"
                />
                <p className="text-xs text-muted-foreground">
                  Se o contato ficar inativo por esse tempo, o fluxo expira automaticamente.
                </p>
              </div>

              <div className="space-y-2 border-t pt-4">
                <Label>Palavras-chave de reinício</Label>
                <div className="flex flex-wrap gap-2">
                  {config.reset_keywords.map((kw, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-muted px-2.5 py-1 rounded-full text-sm">
                      {kw}
                      <button
                        type="button"
                        onClick={() => setConfig({ ...config, reset_keywords: config.reset_keywords.filter((_, idx) => idx !== i) })}
                        className="text-muted-foreground hover:text-destructive ml-1"
                      >×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Nova palavra-chave..."
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && keywordInput.trim()) {
                        e.preventDefault();
                        const k = keywordInput.trim().toLowerCase();
                        if (!config.reset_keywords.includes(k)) {
                          setConfig({ ...config, reset_keywords: [...config.reset_keywords, k] });
                        }
                        setKeywordInput('');
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const k = keywordInput.trim().toLowerCase();
                      if (k && !config.reset_keywords.includes(k)) {
                        setConfig({ ...config, reset_keywords: [...config.reset_keywords, k] });
                      }
                      setKeywordInput('');
                    }}
                    disabled={!keywordInput.trim()}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Adicionar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === ALERTAS GLOBAIS === */}
        <TabsContent value="alertas">
          <WhatsAppNotificacaoGlobal />
        </TabsContent>
      </Tabs>
    </div>
  );
}