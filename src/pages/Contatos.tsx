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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, MessageCircle, Instagram, Linkedin, Facebook, Mail, Users as UsersIcon } from 'lucide-react';
import { MaskedInput } from '@/components/ui/masked-input';
import { Link } from 'react-router-dom';
import { EnviarEmailSMTPDialog } from '@/components/EnviarEmailSMTPDialog';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { openWhatsApp } from '@/utils/whatsapp';

interface Contato {
  id: string;
  nome: string;
  email?: string;
  telefone?: string;
  cargo?: string;
  corretora_id?: string;
  observacoes?: string;
  instagram?: string;
  linkedin?: string;
  facebook?: string;
  whatsapp?: string;
}

interface Corretora {
  id: string;
  nome: string;
}

export default function Contatos() {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [corretoras, setCorretoras] = useState<Corretora[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Contato | null>(null);
  const [formData, setFormData] = useState<Partial<Contato>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContatos, setSelectedContatos] = useState<string[]>([]);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  useEffect(() => {
    fetchContatos();
    fetchCorretoras();
  }, []);

  const filteredContatos = useMemo(() => {
    if (!searchTerm) return contatos;
    
    const term = searchTerm.toLowerCase();
    return contatos.filter(contato =>
      contato.nome.toLowerCase().includes(term) ||
      contato.email?.toLowerCase().includes(term) ||
      contato.telefone?.toLowerCase().includes(term) ||
      contato.cargo?.toLowerCase().includes(term)
    );
  }, [contatos, searchTerm]);

  const {
    paginatedItems: paginatedContatos,
    currentPage,
    itemsPerPage,
    totalPages,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination(filteredContatos);

  const fetchContatos = async () => {
    const { data, error } = await supabase
      .from('contatos')
      .select('*')
      .order('nome');
    
    if (error) {
      toast.error('Erro ao carregar contatos');
    } else {
      setContatos(data || []);
    }
  };

  const fetchCorretoras = async () => {
    const { data, error } = await supabase
      .from('corretoras')
      .select('id, nome')
      .order('nome');
    
    if (error) {
      toast.error('Erro ao carregar corretoras');
    } else {
      setCorretoras(data || []);
    }
  };

  const handleSave = async () => {
    if (!formData.nome) {
      toast.error('Nome é obrigatório');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      toast.error('Usuário não autenticado');
      return;
    }

    // Build payload explicitly to avoid sending system columns and undefineds
    const payload = {
      nome: (formData.nome || '').trim(),
      email: formData.email?.trim() || null,
      telefone: formData.telefone?.trim() || null,
      cargo: formData.cargo?.trim() || null,
      corretora_id: formData.corretora_id || null,
      observacoes: formData.observacoes?.trim() || null,
      instagram: formData.instagram?.trim() || null,
      linkedin: formData.linkedin?.trim() || null,
      facebook: formData.facebook?.trim() || null,
      whatsapp: formData.whatsapp?.trim() || null,
    };

    if (editingItem) {
      const { error } = await supabase
        .from('contatos')
        .update(payload)
        .eq('id', editingItem.id);
      
      if (error) {
        console.error('Erro ao atualizar:', error);
        toast.error('Erro ao atualizar contato');
      } else {
        toast.success('Contato atualizado!');
        setDialogOpen(false);
        fetchContatos();
      }
    } else {
      const { error } = await supabase
        .from('contatos')
        .insert([{ ...payload, created_by: user.id }]);
      
      if (error) {
        console.error('Erro ao criar:', error);
        toast.error('Erro ao criar contato');
      } else {
        toast.success('Contato criado!');
        setDialogOpen(false);
        fetchContatos();
      }
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('contatos')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Erro ao excluir:', error);
      toast.error('Erro ao excluir contato');
    } else {
      toast.success('Contato excluído!');
      fetchContatos();
    }
  };

  const openDialog = (item?: Contato) => {
    setEditingItem(item || null);
    setFormData(item || {});
    setDialogOpen(true);
  };

  const toggleSelectContato = (id: string) => {
    setSelectedContatos(prev =>
      prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedContatos.length === paginatedContatos.length) {
      setSelectedContatos([]);
    } else {
      setSelectedContatos(paginatedContatos.map(c => c.id));
    }
  };

  const getSelectedEmails = () => {
    return contatos
      .filter(c => selectedContatos.includes(c.id) && c.email)
      .map(c => c.email!);
  };

  const getCorretoraName = (corretoraId?: string) => {
    if (!corretoraId) return '-';
    const corretora = corretoras.find(c => c.id === corretoraId);
    return corretora?.nome || '-';
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <UsersIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Contatos</h1>
            <p className="text-sm text-muted-foreground">Gerencie seus contatos e informações</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
            {selectedContatos.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  const emails = getSelectedEmails();
                  if (emails.length === 0) {
                    toast.error('Nenhum contato selecionado possui email');
                    return;
                  }
                  setEmailDialogOpen(true);
                }}
              >
                <Mail className="mr-2 h-4 w-4" />
                Enviar Email ({selectedContatos.length})
              </Button>
            )}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => openDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Contato
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingItem ? 'Editar Contato' : 'Novo Contato'}
                  </DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="nome">Nome *</Label>
                    <Input
                      id="nome"
                      value={formData.nome || ''}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email || ''}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="telefone">Telefone</Label>
                      <MaskedInput
                        id="telefone"
                        format="(##) #####-####"
                        value={formData.telefone || ''}
                        onValueChange={(values) => setFormData({ ...formData, telefone: values.value })}
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="cargo">Cargo</Label>
                    <Input
                      id="cargo"
                      value={formData.cargo || ''}
                      onChange={(e) => setFormData({ ...formData, cargo: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="corretora">Corretora</Label>
                    <Select
                      value={formData.corretora_id || 'none'}
                      onValueChange={(value) => setFormData({ ...formData, corretora_id: value === 'none' ? undefined : value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma corretora" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {corretoras.map((corretora) => (
                          <SelectItem key={corretora.id} value={corretora.id}>
                            {corretora.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label className="font-semibold">Redes Sociais</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="instagram">Instagram</Label>
                        <Input
                          id="instagram"
                          placeholder="@usuario"
                          value={formData.instagram || ''}
                          onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="linkedin">LinkedIn</Label>
                        <Input
                          id="linkedin"
                          placeholder="linkedin.com/in/usuario"
                          value={formData.linkedin || ''}
                          onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="facebook">Facebook</Label>
                        <Input
                          id="facebook"
                          placeholder="facebook.com/usuario"
                          value={formData.facebook || ''}
                          onChange={(e) => setFormData({ ...formData, facebook: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="whatsapp">WhatsApp</Label>
                        <MaskedInput
                          id="whatsapp"
                          format="(##) #####-####"
                          value={formData.whatsapp || ''}
                          onValueChange={(values) => setFormData({ ...formData, whatsapp: values.value })}
                          placeholder="(00) 00000-0000"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="observacoes">Observações</Label>
                    <Textarea
                      id="observacoes"
                      value={formData.observacoes || ''}
                      onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSave}>Salvar</Button>
                </div>
              </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="border-border/40 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">Lista de Contatos</CardTitle>
            <Badge variant="secondary" className="font-normal">{totalItems} contatos</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email, telefone ou cargo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedContatos.length === paginatedContatos.length && paginatedContatos.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Corretora</TableHead>
                <TableHead>Contatos</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedContatos.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedContatos.includes(item.id)}
                      onCheckedChange={() => toggleSelectContato(item.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{item.nome}</TableCell>
                  <TableCell>{item.email || '-'}</TableCell>
                  <TableCell>{item.telefone || '-'}</TableCell>
                  <TableCell>{item.cargo || '-'}</TableCell>
                  <TableCell>{getCorretoraName(item.corretora_id)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {item.whatsapp && (
                        <Badge 
                          variant="outline" 
                          className="cursor-pointer hover:bg-accent"
                          onClick={() => openWhatsApp({ phone: item.whatsapp, message: '' })}
                        >
                          <MessageCircle className="h-3 w-3 mr-1" />
                          WhatsApp
                        </Badge>
                      )}
                      {item.instagram && (
                        <Badge 
                          variant="outline" 
                          className="cursor-pointer hover:bg-accent"
                          onClick={() => window.open(`https://instagram.com/${item.instagram}`, '_blank')}
                        >
                          <Instagram className="h-3 w-3 mr-1" />
                          Instagram
                        </Badge>
                      )}
                      {item.linkedin && (
                        <Badge 
                          variant="outline" 
                          className="cursor-pointer hover:bg-accent"
                          onClick={() => window.open(item.linkedin, '_blank')}
                        >
                          <Linkedin className="h-3 w-3 mr-1" />
                          LinkedIn
                        </Badge>
                      )}
                      {item.facebook && (
                        <Badge 
                          variant="outline" 
                          className="cursor-pointer hover:bg-accent"
                          onClick={() => window.open(item.facebook, '_blank')}
                        >
                          <Facebook className="h-3 w-3 mr-1" />
                          Facebook
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDialog(item)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          itemsPerPage={itemsPerPage}
          totalItems={totalItems}
          onPageChange={handlePageChange}
          onItemsPerPageChange={handleItemsPerPageChange}
        />
        </CardContent>
      </Card>

      <EnviarEmailSMTPDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        destinatarios={getSelectedEmails()}
        onSuccess={() => {
          setSelectedContatos([]);
          toast.success('Emails enviados!');
        }}
      />
    </div>
  );
}
