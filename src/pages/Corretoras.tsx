import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, Mail, History, Building2, Upload, MapPin, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { MaskedInput } from '@/components/ui/masked-input';
import { Link } from 'react-router-dom';
import { UploadCorretorasDialog } from '@/components/UploadCorretorasDialog';
import { EnviarEmailSMTPDialog } from '@/components/EnviarEmailSMTPDialog';
import { CorretoraHistoricoDialog } from '@/components/CorretoraHistoricoDialog';
import GerenciarParceirosDialog from '@/components/GerenciarParceirosDialog';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { useCepLookup } from '@/hooks/useCepLookup';

interface Corretora {
  id: string;
  nome: string;
  slug?: string | null;
  cnpj?: string;
  susep?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  cep?: string;
  cidade?: string;
  estado?: string;
  responsavel?: string;
  observacoes?: string;
  logo_url?: string;
  logo_collapsed_url?: string;
  logo_expanded_url?: string;
}

export default function Corretoras() {
  const [corretoras, setCorretoras] = useState<Corretora[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Corretora | null>(null);
  const [formData, setFormData] = useState<Partial<Corretora>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCorretoras, setSelectedCorretoras] = useState<string[]>([]);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [historicoDialogOpen, setHistoricoDialogOpen] = useState(false);
  const [parceiroDialogOpen, setParceiroDialogOpen] = useState(false);
  const [selectedCorretoraForHistory, setSelectedCorretoraForHistory] = useState<{ id: string; nome: string } | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const { lookupCep, loading: cepLoading } = useCepLookup();

  useEffect(() => { fetchCorretoras(); }, []);

  const filteredCorretoras = useMemo(() => {
    if (!searchTerm) return corretoras;
    const term = searchTerm.toLowerCase();
    return corretoras.filter(c =>
      c.nome.toLowerCase().includes(term) ||
      c.cnpj?.toLowerCase().includes(term) ||
      c.susep?.toLowerCase().includes(term) ||
      c.cidade?.toLowerCase().includes(term) ||
      c.responsavel?.toLowerCase().includes(term)
    );
  }, [corretoras, searchTerm]);

  const {
    paginatedItems: paginatedCorretoras, currentPage, itemsPerPage, totalPages, totalItems,
    handlePageChange, handleItemsPerPageChange,
  } = usePagination(filteredCorretoras);

  const fetchCorretoras = async () => {
    const { data, error } = await supabase.from('corretoras').select('*').order('nome').limit(999999);
    if (error) toast.error('Erro ao carregar associações');
    else setCorretoras(data || []);
  };

  const handleSave = async () => {
    if (!formData.nome || !formData.cnpj || !formData.susep) {
      toast.error('Nome, CNPJ e SUSEP são obrigatórios');
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error('Sessão expirada.'); return; }

    if (editingItem) {
      const { error } = await supabase.from('corretoras').update(formData).eq('id', editingItem.id);
      if (error) { toast.error(`Erro: ${error.message}`); } 
      else { toast.success('Associação atualizada!'); setDialogOpen(false); fetchCorretoras(); }
    } else {
      const { error } = await supabase.from('corretoras').insert([{ ...formData, nome: formData.nome! }]);
      if (error) { toast.error(`Erro: ${error.message}`); }
      else { toast.success('Associação criada!'); setDialogOpen(false); fetchCorretoras(); }
    }
  };

  const handleBuscarCep = async () => {
    if (!formData.cep) { toast.error('Digite um CEP'); return; }
    const cepData = await lookupCep(formData.cep);
    if (cepData) {
      setFormData({ ...formData, endereco: cepData.logradouro, cidade: cepData.localidade, estado: cepData.uf });
      toast.success('CEP encontrado!');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta associação?')) return;
    const { error } = await supabase.from('corretoras').delete().eq('id', id);
    if (error) toast.error('Erro ao excluir'); else { toast.success('Excluída!'); fetchCorretoras(); }
  };

  const openDialog = (item?: Corretora) => { setEditingItem(item || null); setFormData(item || {}); setDialogOpen(true); };
  const toggleSelectCorretora = (id: string) => { setSelectedCorretoras(prev => prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]); };
  const toggleSelectAll = () => {
    setSelectedCorretoras(selectedCorretoras.length === paginatedCorretoras.length ? [] : paginatedCorretoras.map(c => c.id));
  };
  const getSelectedEmails = () => corretoras.filter(c => selectedCorretoras.includes(c.id) && c.email).map(c => c.email!);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${Math.random()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('logos').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(filePath);
      setFormData({ ...formData, logo_url: publicUrl });
      toast.success('Logo enviada!');
    } catch { toast.error('Erro ao enviar logo'); }
    finally { setUploadingLogo(false); }
  };

  const comEmail = corretoras.filter(c => c.email).length;
  const comCidade = corretoras.filter(c => c.cidade).length;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Associações</h1>
            <p className="text-sm text-muted-foreground">Gerencie suas associações</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/administradora">
            <Button variant="outline" className="rounded-xl gap-1.5">
              <Building2 className="h-4 w-4" /> Administradora
            </Button>
          </Link>
          <UploadCorretorasDialog onSuccess={fetchCorretoras} />
          {selectedCorretoras.length > 0 && (
            <Button variant="outline" className="rounded-xl gap-1.5" onClick={() => setEmailDialogOpen(true)}>
              <Mail className="h-4 w-4" /> E-mail ({selectedCorretoras.length})
            </Button>
          )}
          <Button onClick={() => { setEditingItem(null); setFormData({}); setDialogOpen(true); }} className="rounded-xl gap-1.5 shadow-sm">
            <Plus className="h-4 w-4" /> Nova Associação
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Total</p>
            <p className="text-2xl font-bold mt-1">{corretoras.length}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Selecionadas</p>
            <p className="text-2xl font-bold mt-1">{selectedCorretoras.length}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Com E-mail</p>
            <p className="text-2xl font-bold mt-1">{comEmail}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Exibindo</p>
            <p className="text-2xl font-bold mt-1">{paginatedCorretoras.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search + Table */}
      <Card className="rounded-2xl border-border/50 shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, CNPJ, SUSEP, cidade..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 rounded-xl bg-background/50"
            />
          </div>

          <div className="border rounded-xl overflow-hidden overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox checked={selectedCorretoras.length === paginatedCorretoras.length && paginatedCorretoras.length > 0} onCheckedChange={toggleSelectAll} />
                  </TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="hidden md:table-cell">CNPJ</TableHead>
                  <TableHead className="hidden lg:table-cell">SUSEP</TableHead>
                  <TableHead className="hidden sm:table-cell">Telefone</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead className="hidden lg:table-cell">Cidade/UF</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedCorretoras.map((item) => (
                  <TableRow key={item.id} className="group">
                    <TableCell>
                      <Checkbox checked={selectedCorretoras.includes(item.id)} onCheckedChange={() => toggleSelectCorretora(item.id)} />
                    </TableCell>
                    <TableCell className="font-medium">{item.nome}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{item.cnpj || '-'}</TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">{item.susep || '-'}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{item.telefone || '-'}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{item.email || '-'}</TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {item.cidade && item.estado ? `${item.cidade}/${item.estado}` : item.cidade || item.estado || '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => { setSelectedCorretoraForHistory({ id: item.id, nome: item.nome }); setHistoricoDialogOpen(true); }} title="Histórico">
                          <History className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => { setSelectedCorretoraForHistory({ id: item.id, nome: item.nome }); setParceiroDialogOpen(true); }} title="Parceiros">
                          <Users className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openDialog(item)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive hover:text-destructive" onClick={() => handleDelete(item.id)} title="Excluir">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginationControls currentPage={currentPage} totalPages={totalPages} itemsPerPage={itemsPerPage} totalItems={totalItems} onPageChange={handlePageChange} onItemsPerPageChange={handleItemsPerPageChange} />
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Editar Associação' : 'Nova Associação'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" value={formData.nome || ''} onChange={(e) => {
                const nome = e.target.value;
                const autoSlug = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                const updates: Partial<Corretora> = { ...formData, nome };
                if (!formData.slug || formData.slug === (formData.nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) {
                  updates.slug = autoSlug;
                }
                setFormData(updates);
              }} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="slug">Identificador URL</Label>
              <Input id="slug" value={formData.slug || ''} onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="ex: associacao" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>CNPJ *</Label>
                <MaskedInput format="##.###.###/####-##" value={formData.cnpj || ''} onValueChange={(v) => setFormData({ ...formData, cnpj: v.value })} placeholder="00.000.000/0000-00" />
              </div>
              <div className="grid gap-2">
                <Label>SUSEP *</Label>
                <Input value={formData.susep || ''} onChange={(e) => setFormData({ ...formData, susep: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Telefone</Label>
                <MaskedInput format="(##) #####-####" value={formData.telefone || ''} onValueChange={(v) => setFormData({ ...formData, telefone: v.value })} placeholder="(00) 00000-0000" />
              </div>
              <div className="grid gap-2">
                <Label>CEP</Label>
                <div className="flex gap-2">
                  <MaskedInput format="#####-###" value={formData.cep || ''} onValueChange={(v) => setFormData({ ...formData, cep: v.value })} placeholder="00000-000" className="flex-1" />
                  <Button type="button" variant="outline" size="icon" onClick={handleBuscarCep} disabled={cepLoading} title="Buscar CEP">
                    <MapPin className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input type="email" value={formData.email || ''} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Endereço</Label>
              <Input value={formData.endereco || ''} onChange={(e) => setFormData({ ...formData, endereco: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Cidade</Label>
                <Input value={formData.cidade || ''} onChange={(e) => setFormData({ ...formData, cidade: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Estado</Label>
                <Input value={formData.estado || ''} onChange={(e) => setFormData({ ...formData, estado: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Responsável</Label>
              <Input value={formData.responsavel || ''} onChange={(e) => setFormData({ ...formData, responsavel: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Observações</Label>
              <Textarea value={formData.observacoes || ''} onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Logo</Label>
              <div className="flex items-center gap-4">
                {formData.logo_url && <img src={formData.logo_url} alt="Logo" className="h-16 w-auto object-contain border rounded-xl p-2" />}
                <div className="flex-1">
                  <Label htmlFor="logo-upload" className="cursor-pointer">
                    <div className="border-2 border-dashed rounded-xl p-4 hover:border-primary transition-colors text-center">
                      <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">{uploadingLogo ? 'Enviando...' : 'Upload da logo'}</p>
                    </div>
                  </Label>
                  <Input id="logo-upload" type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploadingLogo} />
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">Cancelar</Button>
            <Button onClick={handleSave} className="rounded-xl">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <EnviarEmailSMTPDialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen} destinatarios={getSelectedEmails()} onSuccess={() => { setSelectedCorretoras([]); toast.success('Emails enviados!'); }} />

      {selectedCorretoraForHistory && (
        <>
          <CorretoraHistoricoDialog open={historicoDialogOpen} onOpenChange={setHistoricoDialogOpen} corretoraId={selectedCorretoraForHistory.id} corretoraName={selectedCorretoraForHistory.nome} />
          <GerenciarParceirosDialog open={parceiroDialogOpen} onOpenChange={setParceiroDialogOpen} corretoraId={selectedCorretoraForHistory.id} corretoraNome={selectedCorretoraForHistory.nome} />
        </>
      )}
    </div>
  );
}
