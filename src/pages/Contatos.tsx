import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, MessageCircle, Instagram, Linkedin, Facebook, Mail, Users as UsersIcon } from 'lucide-react';
import { MaskedInput } from '@/components/ui/masked-input';
import { EnviarEmailSMTPDialog } from '@/components/EnviarEmailSMTPDialog';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { openWhatsApp } from '@/utils/whatsapp';

interface Contato {
  id: string; nome: string; email?: string; telefone?: string; cargo?: string;
  corretora_id?: string; observacoes?: string; instagram?: string; linkedin?: string;
  facebook?: string; whatsapp?: string;
}
interface Corretora { id: string; nome: string; }

export default function Contatos() {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [corretoras, setCorretoras] = useState<Corretora[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Contato | null>(null);
  const [formData, setFormData] = useState<Partial<Contato>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContatos, setSelectedContatos] = useState<string[]>([]);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  useEffect(() => { fetchContatos(); fetchCorretoras(); }, []);

  const filteredContatos = useMemo(() => {
    if (!searchTerm) return contatos;
    const term = searchTerm.toLowerCase();
    return contatos.filter(c => c.nome.toLowerCase().includes(term) || c.email?.toLowerCase().includes(term) || c.telefone?.toLowerCase().includes(term) || c.cargo?.toLowerCase().includes(term));
  }, [contatos, searchTerm]);

  const { paginatedItems: paginatedContatos, currentPage, itemsPerPage, totalPages, totalItems, handlePageChange, handleItemsPerPageChange } = usePagination(filteredContatos);

  const fetchContatos = async () => {
    const { data, error } = await supabase.from('contatos').select('*').order('nome');
    if (error) toast.error('Erro ao carregar'); else setContatos(data || []);
  };

  const fetchCorretoras = async () => {
    const { data, error } = await supabase.from('corretoras').select('id, nome').order('nome');
    if (error) toast.error('Erro'); else setCorretoras(data || []);
  };

  const handleSave = async () => {
    if (!formData.nome) { toast.error('Nome obrigatório'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Não autenticado'); return; }
    const payload = {
      nome: (formData.nome || '').trim(), email: formData.email?.trim() || null, telefone: formData.telefone?.trim() || null,
      cargo: formData.cargo?.trim() || null, corretora_id: formData.corretora_id || null, observacoes: formData.observacoes?.trim() || null,
      instagram: formData.instagram?.trim() || null, linkedin: formData.linkedin?.trim() || null, facebook: formData.facebook?.trim() || null,
      whatsapp: formData.whatsapp?.trim() || null,
    };
    if (editingItem) {
      const { error } = await supabase.from('contatos').update(payload).eq('id', editingItem.id);
      if (error) toast.error('Erro'); else { toast.success('Atualizado!'); setDialogOpen(false); fetchContatos(); }
    } else {
      const { error } = await supabase.from('contatos').insert([{ ...payload, created_by: user.id }]);
      if (error) toast.error('Erro'); else { toast.success('Criado!'); setDialogOpen(false); fetchContatos(); }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir?')) return;
    const { error } = await supabase.from('contatos').delete().eq('id', id);
    if (error) toast.error('Erro'); else { toast.success('Excluído!'); fetchContatos(); }
  };

  const openDialog = (item?: Contato) => { setEditingItem(item || null); setFormData(item || {}); setDialogOpen(true); };
  const toggleSelectContato = (id: string) => { setSelectedContatos(prev => prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]); };
  const toggleSelectAll = () => { setSelectedContatos(selectedContatos.length === paginatedContatos.length ? [] : paginatedContatos.map(c => c.id)); };
  const getSelectedEmails = () => contatos.filter(c => selectedContatos.includes(c.id) && c.email).map(c => c.email!);
  const getCorretoraName = (id?: string) => id ? corretoras.find(c => c.id === id)?.nome || '-' : '-';

  const comEmail = contatos.filter(c => c.email).length;
  const comWhatsapp = contatos.filter(c => c.whatsapp).length;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-primary/10">
            <UsersIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Contatos</h1>
            <p className="text-sm text-muted-foreground">Gerencie seus contatos</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedContatos.length > 0 && (
            <Button variant="outline" className="rounded-xl gap-1.5" onClick={() => {
              if (getSelectedEmails().length === 0) { toast.error('Nenhum email'); return; }
              setEmailDialogOpen(true);
            }}>
              <Mail className="h-4 w-4" /> E-mail ({selectedContatos.length})
            </Button>
          )}
          <Button onClick={() => openDialog()} className="rounded-xl gap-1.5 shadow-sm">
            <Plus className="h-4 w-4" /> Novo Contato
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Total</p>
            <p className="text-2xl font-bold mt-1">{contatos.length}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Selecionados</p>
            <p className="text-2xl font-bold mt-1">{selectedContatos.length}</p>
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
            <p className="text-xs text-muted-foreground font-medium">Com WhatsApp</p>
            <p className="text-2xl font-bold mt-1">{comWhatsapp}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="rounded-2xl border-border/50 shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, email, telefone ou cargo..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 rounded-xl bg-background/50" />
          </div>

          <div className="border rounded-xl overflow-hidden overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"><Checkbox checked={selectedContatos.length === paginatedContatos.length && paginatedContatos.length > 0} onCheckedChange={toggleSelectAll} /></TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead className="hidden md:table-cell">Telefone</TableHead>
                  <TableHead className="hidden lg:table-cell">Cargo</TableHead>
                  <TableHead className="hidden lg:table-cell">Associação</TableHead>
                  <TableHead className="hidden md:table-cell">Redes</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedContatos.map((item) => (
                  <TableRow key={item.id} className="group">
                    <TableCell><Checkbox checked={selectedContatos.includes(item.id)} onCheckedChange={() => toggleSelectContato(item.id)} /></TableCell>
                    <TableCell className="font-medium">{item.nome}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{item.email || '-'}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{item.telefone || '-'}</TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">{item.cargo || '-'}</TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">{getCorretoraName(item.corretora_id)}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex gap-1 flex-wrap">
                        {item.whatsapp && (
                          <Badge variant="outline" className="cursor-pointer hover:bg-accent text-[10px] rounded-md" onClick={() => openWhatsApp({ phone: item.whatsapp, message: '' })}>
                            <MessageCircle className="h-3 w-3 mr-0.5" /> WA
                          </Badge>
                        )}
                        {item.instagram && (
                          <Badge variant="outline" className="cursor-pointer hover:bg-accent text-[10px] rounded-md" onClick={() => window.open(`https://instagram.com/${item.instagram}`, '_blank')}>
                            <Instagram className="h-3 w-3" />
                          </Badge>
                        )}
                        {item.linkedin && (
                          <Badge variant="outline" className="cursor-pointer hover:bg-accent text-[10px] rounded-md" onClick={() => window.open(item.linkedin, '_blank')}>
                            <Linkedin className="h-3 w-3" />
                          </Badge>
                        )}
                        {item.facebook && (
                          <Badge variant="outline" className="cursor-pointer hover:bg-accent text-[10px] rounded-md" onClick={() => window.open(item.facebook, '_blank')}>
                            <Facebook className="h-3 w-3" />
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openDialog(item)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive hover:text-destructive" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4" /></Button>
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
          <DialogHeader><DialogTitle>{editingItem ? 'Editar Contato' : 'Novo Contato'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nome *</Label>
              <Input value={formData.nome || ''} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Email</Label>
                <Input type="email" value={formData.email || ''} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Telefone</Label>
                <MaskedInput format="(##) #####-####" value={formData.telefone || ''} onValueChange={(v) => setFormData({ ...formData, telefone: v.value })} placeholder="(00) 00000-0000" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Cargo</Label>
              <Input value={formData.cargo || ''} onChange={(e) => setFormData({ ...formData, cargo: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Associação</Label>
              <Select value={formData.corretora_id || 'none'} onValueChange={(v) => setFormData({ ...formData, corretora_id: v === 'none' ? undefined : v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {corretoras.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="font-semibold">Redes Sociais</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Instagram</Label>
                  <Input placeholder="@usuario" value={formData.instagram || ''} onChange={(e) => setFormData({ ...formData, instagram: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>LinkedIn</Label>
                  <Input placeholder="linkedin.com/in/usuario" value={formData.linkedin || ''} onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>Facebook</Label>
                  <Input placeholder="facebook.com/usuario" value={formData.facebook || ''} onChange={(e) => setFormData({ ...formData, facebook: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>WhatsApp</Label>
                  <MaskedInput format="(##) #####-####" value={formData.whatsapp || ''} onValueChange={(v) => setFormData({ ...formData, whatsapp: v.value })} placeholder="(00) 00000-0000" />
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Observações</Label>
              <Textarea value={formData.observacoes || ''} onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">Cancelar</Button>
            <Button onClick={handleSave} className="rounded-xl">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <EnviarEmailSMTPDialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen} destinatarios={getSelectedEmails()} onSuccess={() => { setSelectedContatos([]); toast.success('Enviados!'); }} />
    </div>
  );
}
