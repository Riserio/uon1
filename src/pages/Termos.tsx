import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, FileText, Upload, ExternalLink, Check, ChevronsUpDown, Shield, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';

const TIPOS_SINISTRO = ['Colisão', 'Roubo/Furto', 'Incêndio', 'Enchente/Alagamento', 'Danos a Terceiros', 'Quebra de Vidros', 'Outros', 'Todos'];

export default function Termos() {
  const [termos, setTermos] = useState<any[]>([]);
  const [corretoras, setCorretoras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTermo, setEditingTermo] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({ titulo: '', descricao: '', tipo_sinistro: [] as string[], corretora_id: '', ativo: true, obrigatorio: true, ordem: 0 });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [corretoraSearchOpen, setCorretoraSearchOpen] = useState(false);
  const [corretoraSearch, setCorretoraSearch] = useState('');

  useEffect(() => { loadTermos(); }, []);

  const loadTermos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('termos').select('*, corretoras(nome)').order('ordem');
      if (error) throw error;
      setTermos(data || []);
    } catch { toast.error('Erro ao carregar termos'); }
    finally { setLoading(false); }
  };

  const loadCorretoras = async (searchTerm?: string) => {
    try {
      let query = supabase.from('corretoras').select('id, nome').order('nome');
      if (searchTerm && searchTerm.length >= 3) query = query.ilike('nome', `%${searchTerm}%`);
      else if (!searchTerm) { setCorretoras([]); return; }
      const { data } = await query.limit(20);
      setCorretoras(data || []);
    } catch { /* silent */ }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { toast.error('Apenas PDF'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Max 10MB'); return; }
    setSelectedFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTermo && !selectedFile) { toast.error('Selecione um PDF'); return; }
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');
      let arquivo_url = editingTermo?.arquivo_url;
      let arquivo_nome = editingTermo?.arquivo_nome;
      if (selectedFile) {
        const sanitized = selectedFile.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `${Date.now()}_${sanitized}`;
        const { error: upErr } = await supabase.storage.from('termos').upload(fileName, selectedFile);
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from('termos').getPublicUrl(fileName);
        arquivo_url = publicUrl;
        arquivo_nome = selectedFile.name;
      }
      const termoData = { ...formData, arquivo_url, arquivo_nome, created_by: user.id };
      if (editingTermo) {
        const { error } = await supabase.from('termos').update(termoData).eq('id', editingTermo.id);
        if (error) throw error;
        toast.success('Termo atualizado!');
      } else {
        const { error } = await supabase.from('termos').insert(termoData);
        if (error) throw error;
        toast.success('Termo criado!');
      }
      setDialogOpen(false); resetForm(); loadTermos();
    } catch { toast.error('Erro ao salvar'); }
    finally { setUploading(false); }
  };

  const handleEdit = async (termo: any) => {
    setEditingTermo(termo);
    setFormData({ titulo: termo.titulo, descricao: termo.descricao || '', tipo_sinistro: termo.tipo_sinistro || [], corretora_id: termo.corretora_id || '', ativo: termo.ativo, obrigatorio: termo.obrigatorio, ordem: termo.ordem });
    if (termo.corretora_id) {
      const { data } = await supabase.from('corretoras').select('id, nome').eq('id', termo.corretora_id).single();
      if (data) setCorretoras([data]);
    }
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este termo?')) return;
    const { error } = await supabase.from('termos').delete().eq('id', id);
    if (error) toast.error('Erro'); else { toast.success('Excluído!'); loadTermos(); }
  };

  const resetForm = () => {
    setFormData({ titulo: '', descricao: '', tipo_sinistro: [], corretora_id: '', ativo: true, obrigatorio: true, ordem: 0 });
    setEditingTermo(null); setSelectedFile(null); setCorretoraSearch(''); setCorretoras([]);
  };

  const ativos = termos.filter(t => t.ativo).length;
  const obrigatorios = termos.filter(t => t.obrigatorio).length;

  const grouped = termos.reduce<Record<string, any[]>>((acc, termo) => {
    const key = termo.corretora_id || 'geral';
    if (!acc[key]) acc[key] = [];
    acc[key].push(termo);
    return acc;
  }, {});

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6">
      <PageHeader
        icon={Shield}
        title="Termos de Aceite"
        subtitle="Gerencie os termos exibidos nas vistorias"
        actions={
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="rounded-xl gap-1.5 shadow-sm">
            <Plus className="h-4 w-4" /> Novo Termo
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Total</p>
            <p className="text-2xl font-bold mt-1">{termos.length}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Ativos</p>
            <p className="text-2xl font-bold mt-1 text-primary">{ativos}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Obrigatórios</p>
            <p className="text-2xl font-bold mt-1">{obrigatorios}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Grupos</p>
            <p className="text-2xl font-bold mt-1">{Object.keys(grouped).length}</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary/20 border-t-primary" />
        </div>
      ) : termos.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-2 border-border/60">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="p-4 rounded-2xl bg-muted/50 mb-4">
              <FileText className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold mb-1">Nenhum termo cadastrado</h3>
            <p className="text-sm text-muted-foreground mb-4">Crie termos para as vistorias</p>
            <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="rounded-xl gap-1.5">
              <Plus className="h-4 w-4" /> Criar Primeiro Termo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([key, termosGrupo]) => (
            <div key={key} className="space-y-3">
              <div className="flex items-center gap-2">
                {key === 'geral' ? (
                  <Badge variant="secondary" className="rounded-lg px-3 py-1 text-sm gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> Termos Gerais
                  </Badge>
                ) : (
                  <Badge variant="outline" className="rounded-lg px-3 py-1 text-sm gap-1.5">
                    <Building2 className="h-3.5 w-3.5" /> {termosGrupo[0]?.corretoras?.nome || 'Associação'}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">{termosGrupo.length} termo(s)</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {termosGrupo.map((termo: any) => (
                  <Card key={termo.id} className="rounded-2xl border-border/50 hover:shadow-md transition-shadow group">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-base line-clamp-1">{termo.titulo}</h3>
                        <div className="flex gap-1.5 flex-shrink-0">
                          {termo.ativo ? (
                            <Badge className="bg-primary/15 text-primary border-0 text-[10px]">Ativo</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">Inativo</Badge>
                          )}
                          {termo.obrigatorio && <Badge variant="destructive" className="text-[10px]">Obrigatório</Badge>}
                        </div>
                      </div>

                      {termo.tipo_sinistro?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {termo.tipo_sinistro.map((tipo: string) => (
                            <Badge key={tipo} variant="outline" className="text-[10px] rounded-md">{tipo}</Badge>
                          ))}
                        </div>
                      )}

                      {termo.descricao && <p className="text-sm text-muted-foreground line-clamp-2">{termo.descricao}</p>}

                      <a href={termo.arquivo_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1.5 truncate">
                        <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">{termo.arquivo_nome}</span>
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      </a>

                      <div className="flex items-center justify-between pt-2 border-t border-border/50">
                        <span className="text-[11px] text-muted-foreground">
                          Ordem: {termo.ordem} · {format(new Date(termo.created_at), 'dd/MM/yy')}
                        </span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg" onClick={() => handleEdit(termo)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg text-destructive hover:text-destructive" onClick={() => handleDelete(termo.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTermo ? 'Editar Termo' : 'Novo Termo'}</DialogTitle>
            <DialogDescription>Preencha os dados do termo de aceite</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input required value={formData.titulo} onChange={(e) => setFormData({ ...formData, titulo: e.target.value })} placeholder="Ex: Termo de Responsabilidade" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Associação</Label>
                <Popover open={corretoraSearchOpen} onOpenChange={setCorretoraSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between">
                      {formData.corretora_id ? corretoras.find(c => c.id === formData.corretora_id)?.nome || 'Selecione...' : 'Todas'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0">
                    <Command>
                      <CommandInput placeholder="Digite 3 letras..." value={corretoraSearch} onValueChange={(v) => { setCorretoraSearch(v); if (v.length >= 3) loadCorretoras(v); }} />
                      <CommandEmpty>{corretoraSearch.length < 3 ? 'Digite ao menos 3 letras' : 'Nenhuma encontrada'}</CommandEmpty>
                      <CommandGroup>
                        <CommandItem value="" onSelect={() => { setFormData({ ...formData, corretora_id: '' }); setCorretoraSearchOpen(false); }}>
                          <Check className={cn('mr-2 h-4 w-4', formData.corretora_id === '' ? 'opacity-100' : 'opacity-0')} /> Todas
                        </CommandItem>
                        {corretoras.map(c => (
                          <CommandItem key={c.id} value={c.nome} onSelect={() => { setFormData({ ...formData, corretora_id: c.id }); setCorretoraSearchOpen(false); }}>
                            <Check className={cn('mr-2 h-4 w-4', formData.corretora_id === c.id ? 'opacity-100' : 'opacity-0')} /> {c.nome}
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
                  {TIPOS_SINISTRO.map(tipo => (
                    <div key={tipo} className="flex items-center space-x-2">
                      <Checkbox id={`tipo-${tipo}`} checked={formData.tipo_sinistro.includes(tipo)} onCheckedChange={(checked) => {
                        setFormData({ ...formData, tipo_sinistro: checked ? [...formData.tipo_sinistro, tipo] : formData.tipo_sinistro.filter(t => t !== tipo) });
                      }} />
                      <Label htmlFor={`tipo-${tipo}`} className="cursor-pointer font-normal">{tipo}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea value={formData.descricao} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} placeholder="Breve descrição..." rows={3} />
            </div>

            <div>
              <Label>Arquivo PDF {!editingTermo && '*'}</Label>
              <div className="mt-2">
                <Label htmlFor="pdf-file" className="cursor-pointer">
                  <div className="border-2 border-dashed border-primary/30 rounded-xl p-4 text-center hover:border-primary transition-colors">
                    <Upload className="h-6 w-6 mx-auto mb-2 text-primary" />
                    <p className="text-sm text-muted-foreground">{selectedFile ? selectedFile.name : 'Clique para selecionar PDF (max 10MB)'}</p>
                  </div>
                </Label>
                <Input id="pdf-file" type="file" accept="application/pdf" onChange={handleFileSelect} className="hidden" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Ordem</Label>
                <Input type="number" value={formData.ordem} onChange={(e) => setFormData({ ...formData, ordem: parseInt(e.target.value) })} />
              </div>
              <div className="flex items-center space-x-2">
                <Switch checked={formData.ativo} onCheckedChange={(v) => setFormData({ ...formData, ativo: v })} />
                <Label>Ativo</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch checked={formData.obrigatorio} onCheckedChange={(v) => setFormData({ ...formData, obrigatorio: v })} />
                <Label>Obrigatório</Label>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} className="rounded-xl">Cancelar</Button>
              <Button type="submit" disabled={uploading} className="rounded-xl">{uploading ? 'Salvando...' : editingTermo ? 'Atualizar' : 'Criar'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
