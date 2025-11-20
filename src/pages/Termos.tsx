import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, FileText, Upload, ExternalLink, Check, ChevronsUpDown } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const TIPOS_SINISTRO = [
  'Colisão',
  'Roubo/Furto',
  'Incêndio',
  'Enchente/Alagamento',
  'Danos a Terceiros',
  'Quebra de Vidros',
  'Outros',
  'Todos' // Para termos gerais que se aplicam a todos os tipos
];

export default function Termos() {
  const [termos, setTermos] = useState<any[]>([]);
  const [corretoras, setCorretoras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTermo, setEditingTermo] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    tipo_sinistro: [] as string[],
    corretora_id: '',
    ativo: true,
    obrigatorio: true,
    ordem: 0,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [corretoraSearchOpen, setCorretoraSearchOpen] = useState(false);
  const [corretoraSearch, setCorretoraSearch] = useState('');

  useEffect(() => {
    loadTermos();
  }, []);

  const loadTermos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('termos')
        .select('*, corretoras(nome)')
        .order('ordem');

      if (error) throw error;
      setTermos(data || []);
    } catch (error) {
      console.error('Erro ao carregar termos:', error);
      toast.error('Erro ao carregar termos');
    } finally {
      setLoading(false);
    }
  };

  const loadCorretoras = async (searchTerm?: string) => {
    try {
      let query = supabase
        .from('corretoras')
        .select('id, nome')
        .order('nome');
      
      if (searchTerm && searchTerm.length >= 3) {
        query = query.ilike('nome', `%${searchTerm}%`);
      } else if (!searchTerm) {
        // Não carrega nada se não tem busca
        setCorretoras([]);
        return;
      }

      const { data, error } = await query.limit(20);

      if (error) throw error;
      setCorretoras(data || []);
    } catch (error) {
      console.error('Erro ao carregar corretoras:', error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast.error('Apenas arquivos PDF são permitidos');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Arquivo muito grande. Máximo 10MB');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editingTermo && !selectedFile) {
      toast.error('Selecione um arquivo PDF');
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      let arquivo_url = editingTermo?.arquivo_url;
      let arquivo_nome = editingTermo?.arquivo_nome;

      // Upload do novo arquivo se foi selecionado
      if (selectedFile) {
        // Sanitizar o nome do arquivo removendo espaços e caracteres especiais
        const sanitizedFileName = selectedFile.name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove acentos
          .replace(/[^a-zA-Z0-9.-]/g, '_'); // Substitui caracteres especiais por underscore
        
        const fileName = `${Date.now()}_${sanitizedFileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('termos')
          .upload(fileName, selectedFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('termos')
          .getPublicUrl(fileName);

        arquivo_url = publicUrl;
        arquivo_nome = selectedFile.name;
      }

      const termoData = {
        ...formData,
        arquivo_url,
        arquivo_nome,
        created_by: user.id,
      };

      if (editingTermo) {
        const { error } = await supabase
          .from('termos')
          .update(termoData)
          .eq('id', editingTermo.id);

        if (error) throw error;
        toast.success('Termo atualizado com sucesso!');
      } else {
        const { error } = await supabase
          .from('termos')
          .insert(termoData);

        if (error) throw error;
        toast.success('Termo criado com sucesso!');
      }

      setDialogOpen(false);
      resetForm();
      loadTermos();
    } catch (error) {
      console.error('Erro ao salvar termo:', error);
      toast.error('Erro ao salvar termo');
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = async (termo: any) => {
    setEditingTermo(termo);
    setFormData({
      titulo: termo.titulo,
      descricao: termo.descricao || '',
      tipo_sinistro: termo.tipo_sinistro || [],
      corretora_id: termo.corretora_id || '',
      ativo: termo.ativo,
      obrigatorio: termo.obrigatorio,
      ordem: termo.ordem,
    });
    
    // Carregar corretora se existir
    if (termo.corretora_id) {
      const { data } = await supabase
        .from('corretoras')
        .select('id, nome')
        .eq('id', termo.corretora_id)
        .single();
      
      if (data) {
        setCorretoras([data]);
      }
    }
    
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este termo?')) return;

    try {
      const { error } = await supabase
        .from('termos')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Termo excluído com sucesso!');
      loadTermos();
    } catch (error) {
      console.error('Erro ao excluir termo:', error);
      toast.error('Erro ao excluir termo');
    }
  };

  const resetForm = () => {
    setFormData({
      titulo: '',
      descricao: '',
      tipo_sinistro: [],
      corretora_id: '',
      ativo: true,
      obrigatorio: true,
      ordem: 0,
    });
    setEditingTermo(null);
    setSelectedFile(null);
    setCorretoraSearch('');
    setCorretoras([]);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileText className="h-8 w-8" />
          Termos de Aceite
        </h1>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Termo
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-3">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground">Carregando termos...</p>
          </div>
        </div>
      ) : termos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">Nenhum termo cadastrado</h3>
            <p className="text-muted-foreground mb-6">Crie termos que os clientes deverão aceitar na vistoria</p>
            <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeiro Termo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {termos.map((termo) => (
            <Card key={termo.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="text-lg">{termo.titulo}</span>
                  <div className="flex gap-2">
                    {termo.ativo ? (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Ativo</span>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">Inativo</span>
                    )}
                    {termo.obrigatorio && (
                      <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Obrigatório</span>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {termo.corretoras?.nome && (
                  <div>
                    <p className="text-sm text-muted-foreground">Corretora</p>
                    <p className="text-sm font-semibold">{termo.corretoras.nome}</p>
                  </div>
                )}
                {termo.tipo_sinistro && termo.tipo_sinistro.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground">Tipos de Sinistro</p>
                    <p className="text-sm font-semibold">{termo.tipo_sinistro.join(', ')}</p>
                  </div>
                )}
                {termo.descricao && (
                  <div>
                    <p className="text-sm text-muted-foreground">Descrição</p>
                    <p className="text-sm">{termo.descricao}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground">Arquivo</p>
                  <a 
                    href={termo.arquivo_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    {termo.arquivo_nome}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Ordem de Exibição</p>
                  <p className="text-sm font-semibold">{termo.ordem}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Criado em</p>
                  <p className="text-sm">{format(new Date(termo.created_at), 'dd/MM/yyyy HH:mm')}</p>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => handleEdit(termo)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleDelete(termo.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTermo ? 'Editar Termo' : 'Novo Termo'}</DialogTitle>
            <DialogDescription>
              Preencha os dados do termo de aceite que será exibido na vistoria pública
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input
                required
                value={formData.titulo}
                onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                placeholder="Ex: Termo de Responsabilidade"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Corretora</Label>
                <Popover open={corretoraSearchOpen} onOpenChange={setCorretoraSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={corretoraSearchOpen}
                      className="w-full justify-between"
                    >
                      {formData.corretora_id
                        ? corretoras.find((c) => c.id === formData.corretora_id)?.nome || 'Selecione...'
                        : 'Todas as corretoras'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0">
                    <Command>
                      <CommandInput 
                        placeholder="Digite 3 letras para buscar..." 
                        value={corretoraSearch}
                        onValueChange={(value) => {
                          setCorretoraSearch(value);
                          if (value.length >= 3) {
                            loadCorretoras(value);
                          }
                        }}
                      />
                      <CommandEmpty>
                        {corretoraSearch.length < 3 
                          ? 'Digite ao menos 3 letras para buscar' 
                          : 'Nenhuma corretora encontrada'}
                      </CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value=""
                          onSelect={() => {
                            setFormData({ ...formData, corretora_id: '' });
                            setCorretoraSearchOpen(false);
                            setCorretoraSearch('');
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              formData.corretora_id === '' ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          Todas as corretoras
                        </CommandItem>
                        {corretoras.map((corretora) => (
                          <CommandItem
                            key={corretora.id}
                            value={corretora.nome}
                            onSelect={() => {
                              setFormData({ ...formData, corretora_id: corretora.id });
                              setCorretoraSearchOpen(false);
                              setCorretoraSearch('');
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                formData.corretora_id === corretora.id ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            {corretora.nome}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label>Tipos de Sinistro</Label>
                <div className="space-y-2 mt-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                  {TIPOS_SINISTRO.map((tipo) => (
                    <div key={tipo} className="flex items-center space-x-2">
                      <Checkbox
                        id={`tipo-${tipo}`}
                        checked={formData.tipo_sinistro.includes(tipo)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormData({
                              ...formData,
                              tipo_sinistro: [...formData.tipo_sinistro, tipo]
                            });
                          } else {
                            setFormData({
                              ...formData,
                              tipo_sinistro: formData.tipo_sinistro.filter((t) => t !== tipo)
                            });
                          }
                        }}
                      />
                      <Label htmlFor={`tipo-${tipo}`} className="cursor-pointer font-normal">
                        {tipo}
                      </Label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Deixe vazio para aplicar a todos os tipos
                </p>
              </div>
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                placeholder="Breve descrição do termo..."
                rows={3}
              />
            </div>

            <div>
              <Label>Arquivo PDF {!editingTermo && '*'}</Label>
              <div className="mt-2">
                <Label htmlFor="pdf-file" className="cursor-pointer">
                  <div className="border-2 border-dashed border-primary/30 rounded-lg p-4 text-center hover:border-primary transition-colors">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-primary" />
                    <p className="text-sm text-muted-foreground">
                      {selectedFile ? selectedFile.name : 'Clique para selecionar PDF (max 10MB)'}
                    </p>
                  </div>
                </Label>
                <Input
                  id="pdf-file"
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Ordem</Label>
                <Input
                  type="number"
                  value={formData.ordem}
                  onChange={(e) => setFormData({ ...formData, ordem: parseInt(e.target.value) })}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  checked={formData.ativo}
                  onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })}
                />
                <Label>Ativo</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  checked={formData.obrigatorio}
                  onCheckedChange={(checked) => setFormData({ ...formData, obrigatorio: checked })}
                />
                <Label>Obrigatório</Label>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                Cancelar
              </Button>
              <Button type="submit" disabled={uploading}>
                {uploading ? 'Salvando...' : editingTermo ? 'Atualizar' : 'Criar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
