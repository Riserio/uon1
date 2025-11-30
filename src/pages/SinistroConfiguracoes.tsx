import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Save, Trash2, Pencil, GripVertical, Settings, HelpCircle, Clock } from 'lucide-react';
import { NIVEIS_ALERTA_PESO } from '@/constants/perguntasComite';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { VistoriaPrazoConfig } from '@/components/VistoriaPrazoConfig';

// Tags disponíveis para auto-preenchimento
const AUTO_FILL_TAGS = [
  { tag: 'cliente_nome', descricao: 'Nome do cliente/associado' },
  { tag: 'cliente_cpf', descricao: 'CPF do cliente' },
  { tag: 'cliente_telefone', descricao: 'Telefone do cliente' },
  { tag: 'cliente_email', descricao: 'E-mail do cliente' },
  { tag: 'cliente_endereco', descricao: 'Endereço do cliente' },
  { tag: 'veiculo_placa', descricao: 'Placa do veículo' },
  { tag: 'veiculo_marca', descricao: 'Marca do veículo' },
  { tag: 'veiculo_modelo', descricao: 'Modelo do veículo' },
  { tag: 'veiculo_ano', descricao: 'Ano do veículo' },
  { tag: 'veiculo_cor', descricao: 'Cor do veículo' },
  { tag: 'veiculo_chassi', descricao: 'Chassi do veículo' },
  { tag: 'veiculo_valor_fipe', descricao: 'Valor FIPE do veículo' },
  { tag: 'veiculo_tipo', descricao: 'Tipo do veículo' },
  { tag: 'veiculo_quilometragem', descricao: 'Quilometragem do veículo' },
  { tag: 'veiculo_uf', descricao: 'UF do veículo' },
  { tag: 'sinistro_data', descricao: 'Data do sinistro' },
  { tag: 'sinistro_hora', descricao: 'Hora do sinistro' },
  { tag: 'sinistro_local', descricao: 'Local do sinistro' },
  { tag: 'sinistro_tipo', descricao: 'Tipo do sinistro' },
  { tag: 'sinistro_descricao', descricao: 'Descrição do sinistro' },
  { tag: 'condutor_nome', descricao: 'Nome do condutor' },
  { tag: 'condutor_cpf', descricao: 'CPF do condutor' },
  { tag: 'condutor_cnh', descricao: 'CNH do condutor' },
  { tag: 'condutor_telefone', descricao: 'Telefone do condutor' },
  { tag: 'associacao_nome', descricao: 'Nome da associação' },
  { tag: 'numero_sinistro', descricao: 'Número do sinistro' },
];

interface Categoria {
  id: string;
  tipo_sinistro: string;
  nome: string;
  ordem: number;
  ativo: boolean;
}

interface Pergunta {
  id: string;
  categoria_id: string;
  pergunta: string;
  tipo_campo: string;
  opcoes: unknown;
  obrigatoria: boolean;
  ordem: number;
  peso: number;
  nivel_alerta: string;
  peso_positivo: string[] | null;
  peso_negativo: string[] | null;
  auto_preenchivel: string | null;
  ativo: boolean;
}

export default function SinistroConfiguracoes() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tipoSinistro, setTipoSinistro] = useState('Colisão');
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [activeMainTab, setActiveMainTab] = useState('perguntas');
  
  // Estado para edição
  const [editandoCategoria, setEditandoCategoria] = useState<string | null>(null);
  const [editandoPergunta, setEditandoPergunta] = useState<string | null>(null);
  
  // Form states
  const [novaCategoria, setNovaCategoria] = useState({ nome: '', ordem: 0, tipos_sinistro: [] as string[] });
  const [novaPergunta, setNovaPergunta] = useState({
    categoria_id: '',
    pergunta: '',
    tipo_campo: 'text',
    opcoes: '',
    obrigatoria: false,
    ordem: 0,
    nivel_alerta: 'none',
    peso_positivo: '' as string,
    peso_negativo: '' as string,
    auto_preenchivel: '',
  });

  const tiposSinistro = [
    'Colisão',
    'Furto',
    'Roubo',
    'Vidros',
    'Incêndio',
    'Danos da Natureza',
    'Perda Total',
    'Terceiro'
  ];

  useEffect(() => {
    loadData();
  }, [tipoSinistro]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load categories
      const { data: cats, error: catsError } = await supabase
        .from('sinistro_pergunta_categorias')
        .select('*')
        .eq('tipo_sinistro', tipoSinistro)
        .order('ordem');

      if (catsError) throw catsError;
      setCategorias(cats || []);

      // Load questions
      if (cats && cats.length > 0) {
        const catIds = cats.map(c => c.id);
        const { data: pergs, error: pergsError } = await supabase
          .from('sinistro_perguntas')
          .select('*')
          .in('categoria_id', catIds)
          .order('ordem');

        if (pergsError) throw pergsError;
        setPerguntas((pergs || []).map(p => ({
          ...p,
          peso_positivo: p.peso_positivo as string[] | null,
          peso_negativo: p.peso_negativo as string[] | null,
        })));
      } else {
        setPerguntas([]);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategoria = async () => {
    if (!novaCategoria.nome.trim()) {
      toast.error('Nome da categoria é obrigatório');
      return;
    }

    if (!editandoCategoria && novaCategoria.tipos_sinistro.length === 0) {
      toast.error('Selecione pelo menos um tipo de sinistro');
      return;
    }

    try {
      setSaving(true);

      if (editandoCategoria) {
        const { error } = await supabase
          .from('sinistro_pergunta_categorias')
          .update({
            nome: novaCategoria.nome,
            ordem: novaCategoria.ordem
          })
          .eq('id', editandoCategoria);

        if (error) throw error;
        toast.success('Categoria atualizada');
        setEditandoCategoria(null);
      } else {
        // Criar categoria para cada tipo de sinistro selecionado
        const insertPromises = novaCategoria.tipos_sinistro.map(tipo => 
          supabase.from('sinistro_pergunta_categorias').insert({
            tipo_sinistro: tipo,
            nome: novaCategoria.nome,
            ordem: novaCategoria.ordem || categorias.length + 1,
            ativo: true
          })
        );

        const results = await Promise.all(insertPromises);
        const hasError = results.find(r => r.error);
        if (hasError?.error) throw hasError.error;
        
        toast.success(`Categoria adicionada para ${novaCategoria.tipos_sinistro.length} tipo(s) de sinistro`);
      }

      setNovaCategoria({ nome: '', ordem: 0, tipos_sinistro: [] });
      loadData();
    } catch (error) {
      console.error('Erro ao salvar categoria:', error);
      toast.error('Erro ao salvar categoria');
    } finally {
      setSaving(false);
    }
  };

  const handleEditCategoria = (cat: Categoria) => {
    setEditandoCategoria(cat.id);
    setNovaCategoria({ nome: cat.nome, ordem: cat.ordem, tipos_sinistro: [cat.tipo_sinistro] });
  };

  const handleDeleteCategoria = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta categoria?')) return;

    try {
      const { error } = await supabase
        .from('sinistro_pergunta_categorias')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Categoria excluída');
      loadData();
    } catch (error) {
      console.error('Erro ao excluir categoria:', error);
      toast.error('Erro ao excluir categoria');
    }
  };

  const handleToggleCategoriaAtivo = async (id: string, ativo: boolean) => {
    try {
      const { error } = await supabase
        .from('sinistro_pergunta_categorias')
        .update({ ativo: !ativo })
        .eq('id', id);

      if (error) throw error;
      toast.success(ativo ? 'Categoria desativada' : 'Categoria ativada');
      loadData();
    } catch (error) {
      console.error('Erro ao atualizar categoria:', error);
      toast.error('Erro ao atualizar categoria');
    }
  };

  const handleSavePergunta = async () => {
    if (!novaPergunta.categoria_id || !novaPergunta.pergunta.trim()) {
      toast.error('Categoria e pergunta são obrigatórios');
      return;
    }

    try {
      setSaving(true);

      const opcoes = novaPergunta.opcoes
        ? novaPergunta.opcoes.split('\n').filter(o => o.trim())
        : null;

      const pesoPositivo = novaPergunta.peso_positivo
        ? novaPergunta.peso_positivo.split('\n').filter(o => o.trim())
        : null;

      const pesoNegativo = novaPergunta.peso_negativo
        ? novaPergunta.peso_negativo.split('\n').filter(o => o.trim())
        : null;

      const payload = {
        categoria_id: novaPergunta.categoria_id,
        pergunta: novaPergunta.pergunta,
        tipo_campo: novaPergunta.tipo_campo,
        tipo_sinistro: tipoSinistro,
        opcoes,
        obrigatoria: novaPergunta.obrigatoria,
        ordem: novaPergunta.ordem || perguntas.length + 1,
        nivel_alerta: novaPergunta.nivel_alerta || 'none',
        peso_positivo: pesoPositivo,
        peso_negativo: pesoNegativo,
        auto_preenchivel: novaPergunta.auto_preenchivel || null,
        ativo: true
      };

      if (editandoPergunta) {
        const { error } = await supabase
          .from('sinistro_perguntas')
          .update(payload)
          .eq('id', editandoPergunta);

        if (error) throw error;
        toast.success('Pergunta atualizada');
        setEditandoPergunta(null);
      } else {
        const { error } = await supabase
          .from('sinistro_perguntas')
          .insert([payload]);

        if (error) throw error;
        toast.success('Pergunta adicionada');
      }

      setNovaPergunta({
        categoria_id: '',
        pergunta: '',
        tipo_campo: 'text',
        opcoes: '',
        obrigatoria: false,
        ordem: 0,
        nivel_alerta: 'none',
        peso_positivo: '',
        peso_negativo: '',
        auto_preenchivel: '',
      });
      loadData();
    } catch (error) {
      console.error('Erro ao salvar pergunta:', error);
      toast.error('Erro ao salvar pergunta');
    } finally {
      setSaving(false);
    }
  };

  const handleEditPergunta = (pergunta: Pergunta) => {
    setEditandoPergunta(pergunta.id);
    const opcoesArray = Array.isArray(pergunta.opcoes) ? pergunta.opcoes : [];
    setNovaPergunta({
      categoria_id: pergunta.categoria_id,
      pergunta: pergunta.pergunta,
      tipo_campo: pergunta.tipo_campo,
      opcoes: opcoesArray.join('\n'),
      obrigatoria: pergunta.obrigatoria,
      ordem: pergunta.ordem,
      nivel_alerta: pergunta.nivel_alerta || 'none',
      peso_positivo: pergunta.peso_positivo?.join('\n') || '',
      peso_negativo: pergunta.peso_negativo?.join('\n') || '',
      auto_preenchivel: pergunta.auto_preenchivel || '',
    });
  };

  const handleCancelarEdicaoPergunta = () => {
    setEditandoPergunta(null);
    setNovaPergunta({
      categoria_id: '',
      pergunta: '',
      tipo_campo: 'text',
      opcoes: '',
      obrigatoria: false,
      ordem: 0,
      nivel_alerta: 'none',
      peso_positivo: '',
      peso_negativo: '',
      auto_preenchivel: '',
    });
  };

  const handleDeletePergunta = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta pergunta?')) return;

    try {
      const { error } = await supabase
        .from('sinistro_perguntas')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Pergunta excluída');
      loadData();
    } catch (error) {
      console.error('Erro ao excluir pergunta:', error);
      toast.error('Erro ao excluir pergunta');
    }
  };

  const handleTogglePerguntaAtivo = async (id: string, ativo: boolean) => {
    try {
      const { error } = await supabase
        .from('sinistro_perguntas')
        .update({ ativo: !ativo })
        .eq('id', id);

      if (error) throw error;
      toast.success(ativo ? 'Pergunta desativada' : 'Pergunta ativada');
      loadData();
    } catch (error) {
      console.error('Erro ao atualizar pergunta:', error);
      toast.error('Erro ao atualizar pergunta');
    }
  };

  const getCategoriaPerguntas = (categoriaId: string) => {
    return perguntas.filter(p => p.categoria_id === categoriaId);
  };

  const getAlertaBadge = (nivel: string) => {
    const nivelConfig = NIVEIS_ALERTA_PESO.find(n => n.value === nivel);
    if (nivelConfig) {
      return <Badge className={`${nivelConfig.cor} ${nivelConfig.textCor} text-[10px]`}>{nivelConfig.labelCurto}</Badge>;
    }
    return <Badge variant="outline">Nenhum</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }


  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings className="h-6 w-6" />
              Configurações de Sinistro
            </h1>
            <p className="text-muted-foreground">
              Configure perguntas do comitê e prazos de vistoria
            </p>
          </div>
        </div>
      </div>

      {/* Abas principais */}
      <Tabs value={activeMainTab} onValueChange={setActiveMainTab}>
        <TabsList>
          <TabsTrigger value="perguntas" className="gap-2">
            <Settings className="h-4 w-4" />
            Perguntas do Comitê
          </TabsTrigger>
          <TabsTrigger value="prazos" className="gap-2">
            <Clock className="h-4 w-4" />
            Prazos de Vistoria
          </TabsTrigger>
        </TabsList>

        <TabsContent value="prazos" className="mt-6">
          <VistoriaPrazoConfig />
        </TabsContent>

        <TabsContent value="perguntas" className="mt-6 space-y-6">
      {/* Filtro por tipo */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Label>Tipo de Sinistro:</Label>
            <Select value={tipoSinistro} onValueChange={setTipoSinistro}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tiposSinistro.map(tipo => (
                  <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Categorias */}
        <Card>
          <CardHeader>
            <CardTitle>Categorias</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nome da Categoria</Label>
                  <Input
                    value={novaCategoria.nome}
                    onChange={(e) => setNovaCategoria(prev => ({ ...prev, nome: e.target.value }))}
                    placeholder="Ex: Dados do Veículo"
                  />
                </div>
                <div>
                  <Label>Ordem</Label>
                  <Input
                    type="number"
                    value={novaCategoria.ordem}
                    onChange={(e) => setNovaCategoria(prev => ({ ...prev, ordem: parseInt(e.target.value) || 0 }))}
                    placeholder="0"
                  />
                </div>
              </div>

              {!editandoCategoria && (
                <div>
                  <Label className="mb-2 block">Tipos de Sinistro</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {tiposSinistro.map(tipo => (
                      <div key={tipo} className="flex items-center space-x-2">
                        <Checkbox
                          id={`tipo-cat-${tipo}`}
                          checked={novaCategoria.tipos_sinistro.includes(tipo)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setNovaCategoria(prev => ({
                                ...prev,
                                tipos_sinistro: [...prev.tipos_sinistro, tipo]
                              }));
                            } else {
                              setNovaCategoria(prev => ({
                                ...prev,
                                tipos_sinistro: prev.tipos_sinistro.filter(t => t !== tipo)
                              }));
                            }
                          }}
                        />
                        <label htmlFor={`tipo-cat-${tipo}`} className="text-sm">{tipo}</label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={handleAddCategoria} disabled={saving} className="gap-2">
                  {editandoCategoria ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {editandoCategoria ? 'Atualizar' : 'Adicionar'}
                </Button>
                {editandoCategoria && (
                  <Button variant="outline" onClick={() => {
                    setEditandoCategoria(null);
                    setNovaCategoria({ nome: '', ordem: 0, tipos_sinistro: [] });
                  }}>
                    Cancelar
                  </Button>
                )}
              </div>
            </div>

            <ScrollArea className="h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ordem</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categorias.map(cat => (
                    <TableRow key={cat.id}>
                      <TableCell className="w-16">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        {cat.ordem}
                      </TableCell>
                      <TableCell>{cat.nome}</TableCell>
                      <TableCell>
                        <Switch
                          checked={cat.ativo}
                          onCheckedChange={() => handleToggleCategoriaAtivo(cat.id, cat.ativo)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditCategoria(cat)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteCategoria(cat.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Nova Pergunta */}
        <Card>
          <CardHeader>
            <CardTitle>{editandoPergunta ? 'Editar Pergunta' : 'Nova Pergunta'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div>
                <Label>Categoria</Label>
                <Select
                  value={novaPergunta.categoria_id}
                  onValueChange={(v) => setNovaPergunta(prev => ({ ...prev, categoria_id: v }))}
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
                <Label>Pergunta</Label>
                <Textarea
                  value={novaPergunta.pergunta}
                  onChange={(e) => setNovaPergunta(prev => ({ ...prev, pergunta: e.target.value }))}
                  placeholder="Digite a pergunta..."
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo de Campo</Label>
                  <Select
                    value={novaPergunta.tipo_campo}
                    onValueChange={(v) => setNovaPergunta(prev => ({ ...prev, tipo_campo: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Texto</SelectItem>
                      <SelectItem value="textarea">Área de Texto</SelectItem>
                      <SelectItem value="select">Seleção</SelectItem>
                      <SelectItem value="date">Data</SelectItem>
                      <SelectItem value="valor">Valor</SelectItem>
                      <SelectItem value="mapa">Mapa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Peso da Resposta Negativa</Label>
                  <Select
                    value={novaPergunta.nivel_alerta}
                    onValueChange={(v) => setNovaPergunta(prev => ({ ...prev, nivel_alerta: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {NIVEIS_ALERTA_PESO.map(nivel => (
                        <SelectItem key={nivel.value} value={nivel.value}>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${nivel.cor}`} />
                            <span className="text-xs">{nivel.labelCurto}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {novaPergunta.tipo_campo === 'select' && (
                <>
                  <div>
                    <Label>Opções (uma por linha)</Label>
                    <Textarea
                      value={novaPergunta.opcoes}
                      onChange={(e) => setNovaPergunta(prev => ({ ...prev, opcoes: e.target.value }))}
                      placeholder="Opção 1&#10;Opção 2&#10;Opção 3"
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Respostas Positivas (uma por linha)</Label>
                      <Textarea
                        value={novaPergunta.peso_positivo}
                        onChange={(e) => setNovaPergunta(prev => ({ ...prev, peso_positivo: e.target.value }))}
                        placeholder="SIM&#10;NÃO SE APLICA"
                        rows={2}
                      />
                    </div>
                    <div>
                      <Label>Respostas Negativas (uma por linha)</Label>
                      <Textarea
                        value={novaPergunta.peso_negativo}
                        onChange={(e) => setNovaPergunta(prev => ({ ...prev, peso_negativo: e.target.value }))}
                        placeholder="NÃO"
                        rows={2}
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Ordem</Label>
                  <Input
                    type="number"
                    value={novaPergunta.ordem}
                    onChange={(e) => setNovaPergunta(prev => ({ ...prev, ordem: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div className="flex items-end">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={novaPergunta.obrigatoria}
                      onCheckedChange={(v) => setNovaPergunta(prev => ({ ...prev, obrigatoria: v }))}
                    />
                    <Label>Obrigatória</Label>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Label>Auto-preenchível (campo fonte)</Label>
                  <TooltipProvider>
                    <Tooltip delayDuration={0}>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-sm p-0">
                        <div className="p-3 space-y-2">
                          <p className="font-semibold text-sm border-b pb-2">Tags disponíveis para auto-preenchimento:</p>
                          <div className="max-h-64 overflow-y-auto space-y-1">
                            {AUTO_FILL_TAGS.map(item => (
                              <div key={item.tag} className="text-xs">
                                <code className="bg-muted px-1 py-0.5 rounded text-primary font-mono">{item.tag}</code>
                                <span className="text-muted-foreground ml-1">- {item.descricao}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  value={novaPergunta.auto_preenchivel}
                  onChange={(e) => setNovaPergunta(prev => ({ ...prev, auto_preenchivel: e.target.value }))}
                  placeholder="Ex: cliente_nome, veiculo_placa"
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSavePergunta} disabled={saving} className="gap-2">
                  {editandoPergunta ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {editandoPergunta ? 'Atualizar Pergunta' : 'Adicionar Pergunta'}
                </Button>
                {editandoPergunta && (
                  <Button variant="outline" onClick={handleCancelarEdicaoPergunta}>
                    Cancelar
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Perguntas */}
      <Card>
        <CardHeader>
          <CardTitle>Perguntas Cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={categorias[0]?.id}>
            <TabsList className="flex flex-wrap h-auto gap-1">
              {categorias.map(cat => (
                <TabsTrigger key={cat.id} value={cat.id} className="text-xs">
                  {cat.nome} ({getCategoriaPerguntas(cat.id).length})
                </TabsTrigger>
              ))}
            </TabsList>

            {categorias.map(cat => (
              <TabsContent key={cat.id} value={cat.id}>
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Pergunta</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Obrigatória</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getCategoriaPerguntas(cat.id).map(perg => (
                        <TableRow key={perg.id} className={!perg.ativo ? 'opacity-50' : ''}>
                          <TableCell>{perg.ordem}</TableCell>
                          <TableCell className="max-w-md truncate">{perg.pergunta}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{perg.tipo_campo}</Badge>
                          </TableCell>
                          <TableCell>
                            {perg.obrigatoria ? (
                              <Badge>Sim</Badge>
                            ) : (
                              <Badge variant="secondary">Não</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={perg.ativo}
                              onCheckedChange={() => handleTogglePerguntaAtivo(perg.id, perg.ativo)}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditPergunta(perg)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeletePergunta(perg.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {getCategoriaPerguntas(cat.id).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            Nenhuma pergunta cadastrada nesta categoria
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
