import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, Mail, History, Building2, Upload, Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import InputMask from 'react-input-mask';
import { Link, useNavigate } from 'react-router-dom';
import { UploadCorretorasDialog } from '@/components/UploadCorretorasDialog';
import { EnviarEmailSMTPDialog } from '@/components/EnviarEmailSMTPDialog';
import { CorretoraHistoricoDialog } from '@/components/CorretoraHistoricoDialog';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';

interface Corretora {
  id: string;
  nome: string;
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
}

export default function Corretoras() {
  const navigate = useNavigate();
  const [corretoras, setCorretoras] = useState<Corretora[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Corretora | null>(null);
  const [formData, setFormData] = useState<Partial<Corretora>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCorretoras, setSelectedCorretoras] = useState<string[]>([]);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [historicoDialogOpen, setHistoricoDialogOpen] = useState(false);
  const [selectedCorretoraForHistory, setSelectedCorretoraForHistory] = useState<{ id: string; nome: string } | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  useEffect(() => {
    fetchCorretoras();
  }, []);

  const filteredCorretoras = useMemo(() => {
    if (!searchTerm) return corretoras;
    
    const term = searchTerm.toLowerCase();
    return corretoras.filter(corretora =>
      corretora.nome.toLowerCase().includes(term) ||
      corretora.cnpj?.toLowerCase().includes(term) ||
      corretora.susep?.toLowerCase().includes(term) ||
      corretora.cidade?.toLowerCase().includes(term) ||
      corretora.responsavel?.toLowerCase().includes(term)
    );
  }, [corretoras, searchTerm]);

  const {
    paginatedItems: paginatedCorretoras,
    currentPage,
    itemsPerPage,
    totalPages,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination(filteredCorretoras);

  const fetchCorretoras = async () => {
    const { data, error } = await supabase
      .from('corretoras')
      .select('*')
      .order('nome')
      .limit(999999); // Remove limit - fetch all corretoras
    
    if (error) {
      toast.error('Erro ao carregar corretoras');
    } else {
      setCorretoras(data || []);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('Tem certeza que deseja deletar TODAS as corretoras? Esta ação não pode ser desfeita.')) {
      return;
    }

    const { error } = await supabase
      .from('corretoras')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records
    
    if (error) {
      toast.error('Erro ao excluir todas as corretoras');
    } else {
      toast.success('Todas as corretoras foram excluídas!');
      fetchCorretoras();
    }
  };

  const handleLogoUpload = async (corretoraId: string) => {
    if (!logoFile) return null;

    try {
      setUploadingLogo(true);
      const fileExt = logoFile.name.split('.').pop();
      const fileName = `${corretoraId}/logo.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(fileName, logoFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      console.error('Erro ao fazer upload do logo:', error);
      toast.error('Erro ao fazer upload do logo');
      return null;
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!formData.nome || !formData.cnpj || !formData.susep) {
      toast.error('Nome, CNPJ e SUSEP são obrigatórios');
      return;
    }

    try {
      let logoUrl = formData.logo_url;

      if (editingItem) {
        // Upload logo if provided
        if (logoFile) {
          const uploadedUrl = await handleLogoUpload(editingItem.id);
          if (uploadedUrl) logoUrl = uploadedUrl;
        }

        const { error } = await supabase
          .from('corretoras')
          .update({ ...formData, logo_url: logoUrl })
          .eq('id', editingItem.id);
        
        if (error) throw error;
        toast.success('Corretora atualizada!');
      } else {
        const { data: newCorretora, error: insertError } = await supabase
          .from('corretoras')
          .insert([{ ...formData, nome: formData.nome! }])
          .select()
          .single();
        
        if (insertError) throw insertError;

        // Upload logo after creating
        if (logoFile && newCorretora) {
          const uploadedUrl = await handleLogoUpload(newCorretora.id);
          if (uploadedUrl) {
            await supabase
              .from('corretoras')
              .update({ logo_url: uploadedUrl })
              .eq('id', newCorretora.id);
          }
        }

        toast.success('Corretora criada!');
      }

      setDialogOpen(false);
      setLogoFile(null);
      fetchCorretoras();
    } catch (error) {
      console.error('Erro ao salvar corretora:', error);
      toast.error('Erro ao salvar corretora');
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('corretoras')
      .delete()
      .eq('id', id);
    
    if (error) {
      toast.error('Erro ao excluir corretora');
    } else {
      toast.success('Corretora excluída!');
      fetchCorretoras();
    }
  };

  const openDialog = (item?: Corretora) => {
    setEditingItem(item || null);
    setFormData(item || {});
    setDialogOpen(true);
  };

  const toggleSelectCorretora = (id: string) => {
    setSelectedCorretoras(prev =>
      prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedCorretoras.length === paginatedCorretoras.length) {
      setSelectedCorretoras([]);
    } else {
      setSelectedCorretoras(paginatedCorretoras.map(c => c.id));
    }
  };

  const getSelectedEmails = () => {
    return corretoras
      .filter(c => selectedCorretoras.includes(c.id) && c.email)
      .map(c => c.email!);
  };

  const handleOpenHistorico = (corretora: Corretora) => {
    setSelectedCorretoraForHistory({ id: corretora.id, nome: corretora.nome });
    setHistoricoDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Corretoras</h1>
            <p className="text-sm text-muted-foreground">Gerencie suas corretoras e informações</p>
          </div>
        </div>
        
        <Button
          onClick={() => navigate('/administradora')}
          variant="outline"
          className="border-primary hover:bg-primary/10 gap-2"
        >
          <Settings className="h-4 w-4" />
          Administradora
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <CardTitle>Lista de Corretoras</CardTitle>
              <div className="flex gap-2">
                <UploadCorretorasDialog onSuccess={fetchCorretoras} />
                {selectedCorretoras.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => setEmailDialogOpen(true)}
                    className="border-primary/50 hover:bg-primary/10"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Enviar E-mail ({selectedCorretoras.length})
                  </Button>
                )}
                <Button
                  onClick={() => {
                    setEditingItem(null);
                    setFormData({});
                    setDialogOpen(true);
                  }}
                  className="bg-primary hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Corretora
                </Button>
            </div>
          </div>
        </CardHeader>

          <CardContent className="p-6">
            {/* Search */}
            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Buscar por nome, CNPJ, SUSEP, cidade..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-background/50 border-border/50"
                />
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-4 rounded-lg border border-border/50">
                <div className="text-sm text-muted-foreground">Total de Corretoras</div>
                <div className="text-2xl font-bold text-primary">{corretoras.length}</div>
              </div>
              <div className="bg-gradient-to-br from-secondary/10 to-secondary/5 p-4 rounded-lg border border-border/50">
                <div className="text-sm text-muted-foreground">Selecionadas</div>
                <div className="text-2xl font-bold text-secondary">{selectedCorretoras.length}</div>
              </div>
              <div className="bg-gradient-to-br from-accent/10 to-accent/5 p-4 rounded-lg border border-border/50">
                <div className="text-sm text-muted-foreground">Exibindo</div>
                <div className="text-2xl font-bold text-accent">{paginatedCorretoras.length}</div>
              </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingItem ? 'Editar Corretora' : 'Nova Corretora'}
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
                      <Label htmlFor="cnpj">CNPJ *</Label>
                      <InputMask
                        mask="99.999.999/9999-99"
                        value={formData.cnpj || ''}
                        onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                      >
                        {(inputProps: any) => <Input {...inputProps} id="cnpj" />}
                      </InputMask>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="susep">SUSEP *</Label>
                      <Input
                        id="susep"
                        value={formData.susep || ''}
                        onChange={(e) => setFormData({ ...formData, susep: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="telefone">Telefone</Label>
                      <InputMask
                        mask="(99) 99999-9999"
                        value={formData.telefone || ''}
                        onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                      >
                        {(inputProps: any) => <Input {...inputProps} id="telefone" />}
                      </InputMask>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="cep">CEP</Label>
                      <InputMask
                        mask="99999-999"
                        value={formData.cep || ''}
                        onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                      >
                        {(inputProps: any) => <Input {...inputProps} id="cep" />}
                      </InputMask>
                    </div>
                  </div>
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
                    <Label htmlFor="endereco">Endereço</Label>
                    <Input
                      id="endereco"
                      value={formData.endereco || ''}
                      onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="cidade">Cidade</Label>
                      <Input
                        id="cidade"
                        value={formData.cidade || ''}
                        onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="estado">Estado</Label>
                      <Input
                        id="estado"
                        value={formData.estado || ''}
                        onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="responsavel">Responsável</Label>
                    <Input
                      id="responsavel"
                      value={formData.responsavel || ''}
                      onChange={(e) => setFormData({ ...formData, responsavel: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="observacoes">Observações</Label>
                    <Textarea
                      id="observacoes"
                      value={formData.observacoes || ''}
                      onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                    />
                  </div>
                  
                  <div className="grid gap-2">
                    <Label htmlFor="logo">Logo da Corretora</Label>
                    <div className="flex items-center gap-4">
                      {(formData.logo_url || logoFile) && (
                        <img 
                          src={logoFile ? URL.createObjectURL(logoFile) : formData.logo_url} 
                          alt="Logo preview" 
                          className="h-16 w-16 object-contain border rounded"
                        />
                      )}
                      <Input
                        id="logo"
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setLogoFile(file);
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      A logo será exibida nos relatórios e no link público de vistoria
                    </p>
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

            <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedCorretoras.length === paginatedCorretoras.length && paginatedCorretoras.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>SUSEP</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Cidade/Estado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedCorretoras.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedCorretoras.includes(item.id)}
                      onCheckedChange={() => toggleSelectCorretora(item.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{item.nome}</TableCell>
                  <TableCell>{item.cnpj || '-'}</TableCell>
                  <TableCell>{item.susep || '-'}</TableCell>
                  <TableCell>{item.telefone || '-'}</TableCell>
                  <TableCell>{item.email || '-'}</TableCell>
                  <TableCell>
                    {item.cidade && item.estado ? `${item.cidade}/${item.estado}` : item.cidade || item.estado || '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenHistorico(item)}
                        title="Ver histórico de atendimentos"
                      >
                        <History className="h-4 w-4" />
                      </Button>
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
          setSelectedCorretoras([]);
          toast.success('Emails enviados!');
        }}
      />

      {selectedCorretoraForHistory && (
        <CorretoraHistoricoDialog
          open={historicoDialogOpen}
          onOpenChange={setHistoricoDialogOpen}
          corretoraId={selectedCorretoraForHistory.id}
          corretoraName={selectedCorretoraForHistory.nome}
        />
      )}
    </div>
  );
}
