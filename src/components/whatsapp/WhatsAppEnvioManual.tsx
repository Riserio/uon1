import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Send, RefreshCw, MessageCircle, Eye } from 'lucide-react';
import { openWhatsApp } from '@/utils/whatsapp';

interface Template {
  id: string;
  nome: string;
  tipo: string;
  mensagem: string;
}

interface WhatsAppConfig {
  telefone_whatsapp: string;
  nome_exibicao: string;
}

export function WhatsAppEnvioManual() {
  const [corretoras, setCorretoras] = useState<{ id: string; nome: string }[]>([]);
  const [selectedCorretora, setSelectedCorretora] = useState<string>('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [mensagem, setMensagem] = useState('');
  const [previewMensagem, setPreviewMensagem] = useState('');
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatingPreview, setGeneratingPreview] = useState(false);

  useEffect(() => {
    loadCorretoras();
    loadTemplates();
  }, []);

  useEffect(() => {
    if (selectedCorretora) {
      loadConfig(selectedCorretora);
    }
  }, [selectedCorretora]);

  useEffect(() => {
    if (selectedTemplate) {
      const template = templates.find(t => t.id === selectedTemplate);
      if (template) {
        setMensagem(template.mensagem);
      }
    }
  }, [selectedTemplate, templates]);

  const loadCorretoras = async () => {
    const { data } = await supabase
      .from('corretoras')
      .select('id, nome')
      .order('nome');
    
    if (data) {
      setCorretoras(data);
    }
  };

  const loadTemplates = async () => {
    const { data } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .eq('ativo', true)
      .order('nome');

    if (data) {
      setTemplates(data);
    }
  };

  const loadConfig = async (corretoraId: string) => {
    const { data } = await supabase
      .from('whatsapp_config')
      .select('telefone_whatsapp, nome_exibicao')
      .eq('corretora_id', corretoraId)
      .maybeSingle();

    setConfig(data);
  };

  const generatePreview = async () => {
    if (!selectedCorretora || !selectedTemplate) {
      toast.error('Selecione a associação e o template');
      return;
    }

    const template = templates.find(t => t.id === selectedTemplate);
    if (!template) return;

    setGeneratingPreview(true);
    try {
      let resumoData: Record<string, string> = {};

      if (template.tipo === 'cobranca') {
        const { data } = await supabase.functions.invoke('gerar-resumo-cobranca', {
          body: { corretora_id: selectedCorretora },
        });
        if (data?.resumo) {
          setPreviewMensagem(data.resumo);
          setMensagem(data.resumo);
          return;
        }
      } else if (template.tipo === 'eventos') {
        const { data } = await supabase.functions.invoke('gerar-resumo-eventos', {
          body: { corretora_id: selectedCorretora },
        });
        if (data?.resumo) {
          setPreviewMensagem(data.resumo);
          setMensagem(data.resumo);
          return;
        }
      }

      // For manual templates, just use the template message
      setPreviewMensagem(template.mensagem);
      setMensagem(template.mensagem);
    } catch (error: any) {
      console.error('Error generating preview:', error);
      toast.error('Erro ao gerar preview: ' + error.message);
    } finally {
      setGeneratingPreview(false);
    }
  };

  const handleEnviar = async () => {
    if (!selectedCorretora) {
      toast.error('Selecione uma associação');
      return;
    }

    if (!config?.telefone_whatsapp) {
      toast.error('Associação não tem WhatsApp configurado');
      return;
    }

    if (!mensagem) {
      toast.error('Digite ou gere uma mensagem');
      return;
    }

    setLoading(true);
    try {
      // Log the message
      const { data: { user } } = await supabase.auth.getUser();
      
      await supabase.from('whatsapp_historico').insert({
        corretora_id: selectedCorretora,
        template_id: selectedTemplate || null,
        telefone_destino: config.telefone_whatsapp,
        mensagem,
        tipo: templates.find(t => t.id === selectedTemplate)?.tipo || 'manual',
        status: 'enviado',
        enviado_em: new Date().toISOString(),
        enviado_por: user?.id,
      });

      // Open WhatsApp
      openWhatsApp({
        phone: config.telefone_whatsapp,
        message: mensagem,
      });

      toast.success('WhatsApp aberto! Envie a mensagem manualmente.');
    } catch (error: any) {
      console.error('Error sending:', error);
      toast.error('Erro ao enviar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5 text-green-500" />
          Envio Manual
        </CardTitle>
        <CardDescription>
          Gere e envie mensagens de resumo manualmente via WhatsApp
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Associação *</Label>
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
            {config && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MessageCircle className="h-3 w-3" />
                {config.telefone_whatsapp} - {config.nome_exibicao || 'Sem nome'}
              </p>
            )}
            {selectedCorretora && !config && (
              <p className="text-xs text-destructive">
                ⚠️ Associação sem WhatsApp configurado
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Template</Label>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nome} ({t.tipo})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={generatePreview}
            disabled={!selectedCorretora || !selectedTemplate || generatingPreview}
          >
            {generatingPreview ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Eye className="h-4 w-4 mr-2" />
            )}
            Gerar Preview
          </Button>
        </div>

        <div className="space-y-2">
          <Label>Mensagem</Label>
          <Textarea
            placeholder="Gere o preview ou digite a mensagem manualmente..."
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            rows={12}
            className="font-mono text-sm"
          />
        </div>

        <Button 
          onClick={handleEnviar} 
          disabled={loading || !config?.telefone_whatsapp || !mensagem}
          className="w-full bg-green-600 hover:bg-green-700"
        >
          <Send className="h-4 w-4 mr-2" />
          {loading ? 'Abrindo WhatsApp...' : 'Enviar via WhatsApp'}
        </Button>
      </CardContent>
    </Card>
  );
}
