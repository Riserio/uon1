import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Save, GripVertical, Settings, FileQuestion, Clock, Building2 } from 'lucide-react';
import { SinistroPergunta, SinistroPerguntaCategoria } from '@/hooks/useSinistroPerguntas';

interface SinistroConfiguracoesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TIPOS_SINISTRO = [
  { value: 'colisao', label: 'Colisão / Danos da Natureza / Incêndio' },
  { value: 'roubo_furto', label: 'Roubo e Furto' },
  { value: 'vidros', label: 'Vidros' },
];

const TIPOS_CAMPO = [
  { value: 'select', label: 'Múltipla escolha' },
  { value: 'text', label: 'Texto curto' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'date', label: 'Data' },
  { value: 'valor', label: 'Valor monetário' },
  { value: 'mapa', label: 'Mapa/Localização' },
];

const NIVEIS_ALERTA = [
  { value: '', label: 'Sem alerta' },
  { value: 'aprovacao', label: '🟢 Aprovação' },
  { value: 'atencao', label: '🟡 Requer atenção' },
  { value: 'passivel_ressarcimento', label: '🟠 Passível de ressarcimento' },
  { value: 'passivel_negativa', label: '🔴 Passível de negativa' },
];

export function SinistroConfiguracoesDialog({ open, onOpenChange }: SinistroConfiguracoesDialogProps) {
  const [activeTab, setActiveTab] = useState('perguntas');
  const [tipoSinistro, setTipoSinistro] = useState('colisao');
  const [categorias, setCategorias] = useState<SinistroPerguntaCategoria[]>([]);
  const [perguntas, setPerguntas] = useState<SinistroPergunta[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Configuração de vistoria
  const [corretoras, setCorretoras] = useState<any[]>([]);
  const [selectedCorretora, setSelectedCorretora] = useState('');
  const [vistoriaConfig, setVistoriaConfig] = useState({
    prazo_realizacao_dias: 7,
    prazo_expiracao_link_horas: 48
  });

  // Nova pergunta
  const [novaPergunta, setNovaPergunta] = useState({
    categoria_id: '',
    pergunta: '',
    tipo_campo: 'select',
    opcoes: '',
    peso: 0,
    peso_positivo: '',
    peso_negativo: '',
    obrigatoria: false,
    nivel_alerta: ''
  });

  useEffect(() => {
    if (open) {
      loadData();
      loadCorretoras();
    }
  }, [open, tipoSinistro]);

  const loadData = async () => {
    try {
      setLoading(true);

      const { data: categoriasData } = await supabase
        .from('sinistro_pergunta_categorias')
        .select('*')
        .eq('tipo_sinistro', tipoSinistro)
        .eq('ativo', true)
        .order('ordem');

      setCategorias(categoriasData || []);

      const { data: perguntasData } = await supabase
        .from('sinistro_perguntas')
        .select('*')
        .eq('tipo_sinistro', tipoSinistro)
        .order('ordem');

      const perguntasTyped: SinistroPergunta[] = (perguntasData || []).map(p => ({
        ...p,
        opcoes: p.opcoes as string[] | null,
      }));
      setPerguntas(perguntasTyped);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCorretoras = async () => {
    const { data } = await supabase.from('corretoras').select('id, nome').order('nome');
    setCorretoras(data || []);
  };

  const loadVistoriaConfig = async (corretoraId: string) => {
    const { data } = await supabase
      .from('vistoria_config_corretora')
      .select('*')
      .eq('corretora_id', corretoraId)
      .maybeSingle();

    if (data) {
      setVistoriaConfig({
        prazo_realizacao_dias: data.prazo_realizacao_dias,
        prazo_expiracao_link_horas: data.prazo_expiracao_link_horas
      });
    } else {
      setVistoriaConfig({
        prazo_realizacao_dias: 7,
        prazo_expiracao_link_horas: 48
      });
    }
  };

  const handleSaveVistoriaConfig = async () => {
    if (!selectedCorretora) {
      toast.error('Selecione uma corretora');
      return;
    }

    try {
      setSaving(true);
      
      const { error } = await supabase
        .from('vistoria_config_corretora')
        .upsert({
          corretora_id: selectedCorretora,
          prazo_realizacao_dias: vistoriaConfig.prazo_realizacao_dias,
          prazo_expiracao_link_horas: vistoriaConfig.prazo_expiracao_link_horas
        }, { onConflict: 'corretora_id' });

      if (error) throw error;
      toast.success('Configuração salva com sucesso');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategoria = async () => {
    const nome = prompt('Nome da categoria:');
    if (!nome) return;

    try {
      const maxOrdem = categorias.length > 0 ? Math.max(...categorias.map(c => c.ordem)) : 0;
      
      const { error } = await supabase
        .from('sinistro_pergunta_categorias')
        .insert({
          tipo_sinistro: tipoSinistro,
          nome,
          ordem: maxOrdem + 1
        });

      if (error) throw error;
      toast.success('Categoria adicionada');
      loadData();
    } catch (error) {
      toast.error('Erro ao adicionar categoria');
    }
  };

  const handleAddPergunta = async () => {
    if (!novaPergunta.categoria_id || !novaPergunta.pergunta) {
      toast.error('Preencha categoria e pergunta');
      return;
    }

    try {
      const maxOrdem = perguntas.filter(p => p.categoria_id === novaPergunta.categoria_id).length;
      
      const opcoesArray = novaPergunta.tipo_campo === 'select' && novaPergunta.opcoes
        ? novaPergunta.opcoes.split('\n').map(o => o.trim()).filter(Boolean)
        : null;

      const { error } = await supabase
        .from('sinistro_perguntas')
        .insert({
          tipo_sinistro: tipoSinistro,
          categoria_id: novaPergunta.categoria_id,
          pergunta: novaPergunta.pergunta,
          tipo_campo: novaPergunta.tipo_campo,
          opcoes: opcoesArray,
          peso: novaPergunta.peso,
          peso_positivo: novaPergunta.peso_positivo ? novaPergunta.peso_positivo.split(',').map(s => s.trim()) : null,
          peso_negativo: novaPergunta.peso_negativo ? novaPergunta.peso_negativo.split(',').map(s => s.trim()) : null,
          obrigatoria: novaPergunta.obrigatoria,
          nivel_alerta: novaPergunta.nivel_alerta || null,
          ordem: maxOrdem + 1
        });

      if (error) throw error;

      toast.success('Pergunta adicionada');
      setNovaPergunta({
        categoria_id: '',
        pergunta: '',
        tipo_campo: 'select',
        opcoes: '',
        peso: 0,
        peso_positivo: '',
        peso_negativo: '',
        obrigatoria: false,
        nivel_alerta: ''
      });
      loadData();
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao adicionar pergunta');
    }
  };

  const handleDeletePergunta = async (id: string) => {
    if (!confirm('Excluir esta pergunta?')) return;

    try {
      const { error } = await supabase
        .from('sinistro_perguntas')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Pergunta excluída');
      loadData();
    } catch (error) {
      toast.error('Erro ao excluir');
    }
  };

  const handleTogglePergunta = async (pergunta: SinistroPergunta) => {
    try {
      const { error } = await supabase
        .from('sinistro_perguntas')
        .update({ ativo: !pergunta.ativo })
        .eq('id', pergunta.id);

      if (error) throw error;
      loadData();
    } catch (error) {
      toast.error('Erro ao atualizar');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configurações de Sinistros
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="perguntas" className="gap-2">
              <FileQuestion className="h-4 w-4" />
              Perguntas e Pesos
            </TabsTrigger>
            <TabsTrigger value="vistoria" className="gap-2">
              <Clock className="h-4 w-4" />
              Prazos de Vistoria
            </TabsTrigger>
          </TabsList>

          <TabsContent value="perguntas" className="flex-1 overflow-hidden flex flex-col mt-4">
            <div className="flex items-center gap-4 mb-4">
              <Label>Tipo de Sinistro:</Label>
              <Select value={tipoSinistro} onValueChange={setTipoSinistro}>
                <SelectTrigger className="w-[300px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_SINISTRO.map(tipo => (
                    <SelectItem key={tipo.value} value={tipo.value}>{tipo.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleAddCategoria}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Categoria
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4 flex-1 overflow-hidden">
              {/* Lista de perguntas */}
              <Card className="overflow-hidden flex flex-col">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Perguntas Cadastradas</CardTitle>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-hidden">
                  <ScrollArea className="h-[400px]">
                    {categorias.map(categoria => (
                      <div key={categoria.id} className="border-b">
                        <div className="bg-muted px-3 py-2 font-medium text-sm">
                          {categoria.nome}
                        </div>
                        {perguntas
                          .filter(p => p.categoria_id === categoria.id)
                          .map(pergunta => (
                            <div 
                              key={pergunta.id} 
                              className={`flex items-center gap-2 px-3 py-2 border-b text-sm ${!pergunta.ativo ? 'opacity-50' : ''}`}
                            >
                              <GripVertical className="h-4 w-4 text-muted-foreground" />
                              <div className="flex-1 truncate">{pergunta.pergunta}</div>
                              {pergunta.peso > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  Peso: {pergunta.peso}
                                </Badge>
                              )}
                              <Switch
                                checked={pergunta.ativo}
                                onCheckedChange={() => handleTogglePergunta(pergunta)}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleDeletePergunta(pergunta.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                      </div>
                    ))}
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Formulário nova pergunta */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Nova Pergunta</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs">Categoria</Label>
                    <Select
                      value={novaPergunta.categoria_id}
                      onValueChange={v => setNovaPergunta(p => ({ ...p, categoria_id: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {categorias.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs">Pergunta</Label>
                    <Textarea
                      value={novaPergunta.pergunta}
                      onChange={e => setNovaPergunta(p => ({ ...p, pergunta: e.target.value }))}
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Tipo de Campo</Label>
                      <Select
                        value={novaPergunta.tipo_campo}
                        onValueChange={v => setNovaPergunta(p => ({ ...p, tipo_campo: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIPOS_CAMPO.map(tipo => (
                            <SelectItem key={tipo.value} value={tipo.value}>{tipo.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">Peso</Label>
                      <Input
                        type="number"
                        value={novaPergunta.peso}
                        onChange={e => setNovaPergunta(p => ({ ...p, peso: parseInt(e.target.value) || 0 }))}
                      />
                    </div>
                  </div>

                  {novaPergunta.tipo_campo === 'select' && (
                    <div>
                      <Label className="text-xs">Opções (uma por linha)</Label>
                      <Textarea
                        value={novaPergunta.opcoes}
                        onChange={e => setNovaPergunta(p => ({ ...p, opcoes: e.target.value }))}
                        rows={3}
                        placeholder="Sim&#10;Não&#10;Não se aplica"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Respostas positivas (,)</Label>
                      <Input
                        value={novaPergunta.peso_positivo}
                        onChange={e => setNovaPergunta(p => ({ ...p, peso_positivo: e.target.value }))}
                        placeholder="Sim, Bom"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Respostas negativas (,)</Label>
                      <Input
                        value={novaPergunta.peso_negativo}
                        onChange={e => setNovaPergunta(p => ({ ...p, peso_negativo: e.target.value }))}
                        placeholder="Não, Ruim"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Nível de Alerta</Label>
                    <Select
                      value={novaPergunta.nivel_alerta}
                      onValueChange={v => setNovaPergunta(p => ({ ...p, nivel_alerta: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {NIVEIS_ALERTA.map(nivel => (
                          <SelectItem key={nivel.value} value={nivel.value}>{nivel.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={novaPergunta.obrigatoria}
                      onCheckedChange={v => setNovaPergunta(p => ({ ...p, obrigatoria: v }))}
                    />
                    <Label className="text-xs">Obrigatória</Label>
                  </div>

                  <Button onClick={handleAddPergunta} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Pergunta
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="vistoria" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Configuração de Prazos por Corretora
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Corretora</Label>
                  <Select 
                    value={selectedCorretora} 
                    onValueChange={v => {
                      setSelectedCorretora(v);
                      loadVistoriaConfig(v);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma corretora..." />
                    </SelectTrigger>
                    <SelectContent>
                      {corretoras.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedCorretora && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Prazo para realização da vistoria (dias)</Label>
                        <Input
                          type="number"
                          value={vistoriaConfig.prazo_realizacao_dias}
                          onChange={e => setVistoriaConfig(c => ({
                            ...c,
                            prazo_realizacao_dias: parseInt(e.target.value) || 7
                          }))}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Este prazo será exibido na Landing Page da vistoria online
                        </p>
                      </div>

                      <div>
                        <Label>Prazo de expiração do link (horas)</Label>
                        <Input
                          type="number"
                          value={vistoriaConfig.prazo_expiracao_link_horas}
                          onChange={e => setVistoriaConfig(c => ({
                            ...c,
                            prazo_expiracao_link_horas: parseInt(e.target.value) || 48
                          }))}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Após este prazo o link da vistoria expira
                        </p>
                      </div>
                    </div>

                    <Button onClick={handleSaveVistoriaConfig} disabled={saving}>
                      <Save className="h-4 w-4 mr-2" />
                      {saving ? 'Salvando...' : 'Salvar Configuração'}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
