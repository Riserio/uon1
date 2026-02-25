import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Save, Trash2, FileText, Tag, Edit2, Eye, Code } from 'lucide-react';
import DOMPurify from 'dompurify';

interface Template {
  id: string;
  nome: string;
  tipo: 'cobranca' | 'eventos' | 'mgf' | 'manual';
  mensagem: string;
  formato: 'texto' | 'html';
  ativo: boolean;
}

const TAGS_BY_TYPE: Record<string, { tag: string; descricao: string }[]> = {
  cobranca: [
    { tag: '{nome_associacao}', descricao: 'Nome da associação' },
    { tag: '{data_atual}', descricao: 'Data atual' },
    { tag: '{percentual_inadimplencia}', descricao: 'Percentual de inadimplência' },
    { tag: '{total_gerados}', descricao: 'Total de boletos gerados' },
    { tag: '{total_baixados}', descricao: 'Total de boletos baixados' },
    { tag: '{faturamento_esperado}', descricao: 'Faturamento esperado' },
    { tag: '{faturamento_recebido}', descricao: 'Faturamento recebido' },
    { tag: '{total_aberto}', descricao: 'Total em aberto' },
    { tag: '{boletos_por_dia}', descricao: 'Boletos por dia de vencimento' },
    { tag: '{cooperativa_maior_inadimplencia}', descricao: 'Cooperativa com maior inadimplência' },
    { tag: '{cooperativa_menor_inadimplencia}', descricao: 'Cooperativa com menor inadimplência' },
  ],
  eventos: [
    { tag: '{nome_associacao}', descricao: 'Nome da associação' },
    { tag: '{mes_referencia}', descricao: 'Mês de referência' },
    { tag: '{total_eventos}', descricao: 'Total de eventos' },
    { tag: '{eventos_colisao}', descricao: 'Eventos de colisão' },
    { tag: '{eventos_vidros}', descricao: 'Eventos de vidros' },
    { tag: '{eventos_furto_roubo}', descricao: 'Eventos de furto/roubo' },
    { tag: '{eventos_outros}', descricao: 'Outros eventos' },
    { tag: '{cidade_mais_eventos}', descricao: 'Cidade com mais eventos' },
    { tag: '{cooperativa_mais_eventos}', descricao: 'Cooperativa com mais eventos' },
  ],
  mgf: [
    { tag: '{nome_associacao}', descricao: 'Nome da associação' },
    { tag: '{mes_referencia}', descricao: 'Mês de referência' },
    { tag: '{total_lancamentos}', descricao: 'Total de lançamentos' },
    { tag: '{valor_total}', descricao: 'Valor total' },
    { tag: '{lancamentos_por_categoria}', descricao: 'Lançamentos por categoria' },
  ],
  manual: [
    { tag: '{nome_associacao}', descricao: 'Nome da associação' },
    { tag: '{data_atual}', descricao: 'Data atual' },
  ],
};

// Sample data for preview
const SAMPLE_DATA: Record<string, string> = {
  '{nome_associacao}': 'Associação Exemplo',
  '{data_atual}': new Date().toLocaleDateString('pt-BR'),
  '{percentual_inadimplencia}': '12,5%',
  '{total_gerados}': '450',
  '{total_baixados}': '380',
  '{faturamento_esperado}': 'R$ 125.000,00',
  '{faturamento_recebido}': 'R$ 109.375,00',
  '{total_aberto}': 'R$ 15.625,00',
  '{boletos_por_dia}': '15 boletos/dia',
  '{cooperativa_maior_inadimplencia}': 'Cooperativa ABC',
  '{cooperativa_menor_inadimplencia}': 'Cooperativa XYZ',
  '{mes_referencia}': 'Janeiro/2026',
  '{total_eventos}': '32',
  '{eventos_colisao}': '18',
  '{eventos_vidros}': '8',
  '{eventos_furto_roubo}': '4',
  '{eventos_outros}': '2',
  '{cidade_mais_eventos}': 'São Paulo',
  '{cooperativa_mais_eventos}': 'Cooperativa ABC',
  '{total_lancamentos}': '120',
  '{valor_total}': 'R$ 45.000,00',
  '{lancamentos_por_categoria}': 'Manutenção: 40, Combustível: 30, Outros: 50',
};

function replaceTagsWithSample(text: string): string {
  let result = text;
  for (const [tag, value] of Object.entries(SAMPLE_DATA)) {
    result = result.split(tag).join(value);
  }
  return result;
}

export function WhatsAppTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [novoTemplate, setNovoTemplate] = useState({
    nome: '',
    tipo: 'cobranca' as Template['tipo'],
    formato: 'texto' as Template['formato'],
    mensagem: '',
    ativo: true,
  });
  const [showForm, setShowForm] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [previewFormato, setPreviewFormato] = useState<'texto' | 'html'>('texto');

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    const { data } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) {
      setTemplates(data.map((t: any) => ({ ...t, formato: t.formato || 'texto' })) as Template[]);
    }
  };

  const handleSave = async () => {
    if (!novoTemplate.nome || !novoTemplate.mensagem) {
      toast.error('Preencha nome e mensagem');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (editingTemplate) {
        const { error } = await supabase
          .from('whatsapp_templates')
          .update({
            nome: novoTemplate.nome,
            tipo: novoTemplate.tipo,
            formato: novoTemplate.formato,
            mensagem: novoTemplate.mensagem,
            ativo: novoTemplate.ativo,
          })
          .eq('id', editingTemplate.id);

        if (error) throw error;
        toast.success('Template atualizado!');
      } else {
        const { error } = await supabase
          .from('whatsapp_templates')
          .insert({
            nome: novoTemplate.nome,
            tipo: novoTemplate.tipo,
            formato: novoTemplate.formato,
            mensagem: novoTemplate.mensagem,
            ativo: novoTemplate.ativo,
            created_by: user?.id,
          });

        if (error) throw error;
        toast.success('Template criado!');
      }

      setNovoTemplate({ nome: '', tipo: 'cobranca', formato: 'texto', mensagem: '', ativo: true });
      setEditingTemplate(null);
      setShowForm(false);
      loadTemplates();
    } catch (error: any) {
      console.error('Error saving template:', error);
      toast.error('Erro ao salvar: ' + error.message);
    }
  };

  const handleEdit = (template: Template) => {
    setEditingTemplate(template);
    setNovoTemplate({
      nome: template.nome,
      tipo: template.tipo,
      formato: template.formato || 'texto',
      mensagem: template.mensagem,
      ativo: template.ativo,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este template?')) return;

    try {
      const { error } = await supabase
        .from('whatsapp_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Template excluído!');
      loadTemplates();
    } catch (error: any) {
      toast.error('Erro ao excluir: ' + error.message);
    }
  };

  const insertTag = (tag: string) => {
    setNovoTemplate({
      ...novoTemplate,
      mensagem: novoTemplate.mensagem + tag,
    });
  };

  const openPreview = (mensagem: string, formato: 'texto' | 'html') => {
    const rendered = replaceTagsWithSample(mensagem);
    setPreviewContent(rendered);
    setPreviewFormato(formato);
    setPreviewOpen(true);
  };

  const getTipoBadgeColor = (tipo: string) => {
    switch (tipo) {
      case 'cobranca': return 'bg-blue-100 text-blue-800';
      case 'eventos': return 'bg-orange-100 text-orange-800';
      case 'mgf': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Prévia do Template
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto border rounded-lg bg-background">
            {previewFormato === 'html' ? (
              <div 
                className="p-6"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewContent) }}
              />
            ) : (
              <pre className="p-6 text-sm whitespace-pre-wrap font-sans text-foreground">
                {previewContent}
              </pre>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            * As tags foram substituídas por dados de exemplo para visualização
          </p>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Templates de Mensagem
              </CardTitle>
              <CardDescription>
                Gerencie os templates de mensagens com tags dinâmicas (texto ou HTML)
              </CardDescription>
            </div>
            <Button onClick={() => { setShowForm(!showForm); setEditingTemplate(null); setNovoTemplate({ nome: '', tipo: 'cobranca', formato: 'texto', mensagem: '', ativo: true }); }}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Template
            </Button>
          </div>
        </CardHeader>
        
        {showForm && (
          <CardContent className="border-b">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Nome do Template *</Label>
                  <Input
                    placeholder="Ex: Resumo Diário de Cobrança"
                    value={novoTemplate.nome}
                    onChange={(e) => setNovoTemplate({ ...novoTemplate, nome: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo *</Label>
                  <Select 
                    value={novoTemplate.tipo} 
                    onValueChange={(v) => setNovoTemplate({ ...novoTemplate, tipo: v as Template['tipo'] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cobranca">Cobrança</SelectItem>
                      <SelectItem value="eventos">Eventos</SelectItem>
                      <SelectItem value="mgf">MGF</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Formato *</Label>
                  <Select 
                    value={novoTemplate.formato} 
                    onValueChange={(v) => setNovoTemplate({ ...novoTemplate, formato: v as Template['formato'] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="texto">Texto</SelectItem>
                      <SelectItem value="html">HTML</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Tags Disponíveis
                </Label>
                <div className="flex flex-wrap gap-2">
                  {TAGS_BY_TYPE[novoTemplate.tipo]?.map((item) => (
                    <Button
                      key={item.tag}
                      variant="outline"
                      size="sm"
                      onClick={() => insertTag(item.tag)}
                      title={item.descricao}
                    >
                      {item.tag}
                    </Button>
                  ))}
                </div>
              </div>

              {novoTemplate.formato === 'html' ? (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Code className="h-4 w-4" />
                    Código HTML *
                  </Label>
                  <Tabs defaultValue="code">
                    <TabsList className="mb-2">
                      <TabsTrigger value="code">Código</TabsTrigger>
                      <TabsTrigger value="preview">Prévia</TabsTrigger>
                    </TabsList>
                    <TabsContent value="code">
                      <Textarea
                        placeholder="<html>&#10;<body>&#10;  <h1>Olá {nome_associacao}</h1>&#10;  <p>Seu relatório está pronto.</p>&#10;</body>&#10;</html>"
                        value={novoTemplate.mensagem}
                        onChange={(e) => setNovoTemplate({ ...novoTemplate, mensagem: e.target.value })}
                        rows={14}
                        className="font-mono text-sm"
                      />
                    </TabsContent>
                    <TabsContent value="preview">
                      <div className="border rounded-lg p-4 min-h-[200px] bg-background">
                        <div 
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(replaceTagsWithSample(novoTemplate.mensagem)) }}
                        />
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Mensagem *</Label>
                  <Textarea
                    placeholder="Digite a mensagem usando as tags disponíveis..."
                    value={novoTemplate.mensagem}
                    onChange={(e) => setNovoTemplate({ ...novoTemplate, mensagem: e.target.value })}
                    rows={10}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use *texto* para negrito no WhatsApp
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={handleSave}>
                  <Save className="h-4 w-4 mr-2" />
                  {editingTemplate ? 'Atualizar' : 'Salvar'}
                </Button>
                <Button variant="outline" onClick={() => openPreview(novoTemplate.mensagem, novoTemplate.formato)}>
                  <Eye className="h-4 w-4 mr-2" />
                  Prévia
                </Button>
                <Button variant="outline" onClick={() => { setShowForm(false); setEditingTemplate(null); }}>
                  Cancelar
                </Button>
              </div>
            </div>
          </CardContent>
        )}

        <CardContent className="pt-6">
          <div className="space-y-4">
            {templates.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum template cadastrado
              </p>
            ) : (
              templates.map((template) => (
                <div
                  key={template.id}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-medium">{template.nome}</h4>
                        <Badge className={getTipoBadgeColor(template.tipo)}>
                          {template.tipo}
                        </Badge>
                        <Badge variant={template.formato === 'html' ? 'default' : 'secondary'} className="text-[10px]">
                          {template.formato === 'html' ? 'HTML' : 'Texto'}
                        </Badge>
                        {!template.ativo && (
                          <Badge variant="secondary">Inativo</Badge>
                        )}
                      </div>
                      <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans line-clamp-3">
                        {template.mensagem}
                      </pre>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openPreview(template.mensagem, template.formato)} title="Prévia">
                        <Eye className="h-4 w-4 text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(template)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(template.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
