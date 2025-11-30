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
import { Plus, Pencil, Trash2, Search, Mail, History, Building2, Upload, MapPin, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

  const handleSave = async () => {
    if (!formData.nome || !formData.cnpj || !formData.susep) {
      toast.error('Nome, CNPJ e SUSEP são obrigatórios');
      return;
    }

    if (editingItem) {
      const { error } = await supabase
        .from('corretoras')
        .update(formData)
        .eq('id', editingItem.id);
      
      if (error) {
        toast.error('Erro ao atualizar corretora');
      } else {
        toast.success('Corretora atualizada!');
        setDialogOpen(false);
        fetchCorretoras();
      }
    } else {
      const { error } = await supabase
        .from('corretoras')
        .insert([{ ...formData, nome: formData.nome! }]);
      
      if (error) {
        toast.error('Erro ao criar corretora');
      } else {
        toast.success('Corretora criada!');
        setDialogOpen(false);
        fetchCorretoras();
      }
    }
  };

  const handleBuscarCep = async () => {
    if (!formData.cep) {
      toast.error('Digite um CEP');
      return;
    }

    const cepData = await lookupCep(formData.cep);
    if (cepData) {
      setFormData({
        ...formData,
        endereco: cepData.logradouro,
        cidade: cepData.localidade,
        estado: cepData.uf,
      });
      toast.success('CEP encontrado!');
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

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(filePath);

      setFormData({ ...formData, logo_url: publicUrl });
      toast.success('Logo enviada com sucesso!');
    } catch (error) {
      console.error('Erro ao enviar logo:', error);
      toast.error('Erro ao enviar logo');
    } finally {
      setUploadingLogo(false);
    }
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
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Corretoras</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas corretoras e informações</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <CardTitle>Lista de Corretoras</CardTitle>
              <div className="flex gap-2">
                <Link to="/administradora">
                  <Button
                    variant="outline"
                    className="border-primary/50 hover:bg-primary/10"
                  >
                    <Building2 className="h-4 w-4 mr-2" />
                    Administradora
                  </Button>
                </Link>
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
                      <MaskedInput
                        id="cnpj"
                        format="##.###.###/####-##"
                        value={formData.cnpj || ''}
                        onValueChange={(values) => setFormData({ ...formData, cnpj: values.value })}
                        placeholder="00.000.000/0000-00"
                      />
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
                      <MaskedInput
                        id="telefone"
                        format="(##) #####-####"
                        value={formData.telefone || ''}
                        onValueChange={(values) => setFormData({ ...formData, telefone: values.value })}
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="cep">CEP</Label>
                      <div className="flex gap-2">
                        <MaskedInput
                          id="cep"
                          format="#####-###"
                          value={formData.cep || ''}
                          onValueChange={(values) => setFormData({ ...formData, cep: values.value })}
                          placeholder="00000-000"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={handleBuscarCep}
                          disabled={cepLoading}
                          title="Buscar CEP"
                        >
                          <MapPin className="h-4 w-4" />
                        </Button>
                      </div>
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

                  {/* Upload de Logo */}
                  <div className="grid gap-2">
                    <Label>Logo da Corretora</Label>
                    <div className="flex items-center gap-4">
                      {formData.logo_url && (
                        <img 
                          src={formData.logo_url} 
                          alt="Logo" 
                          className="h-16 w-auto object-contain border rounded p-2"
                        />
                      )}
                      <div className="flex-1">
                        <Label htmlFor="logo-upload" className="cursor-pointer">
                          <div className="border-2 border-dashed rounded-lg p-4 hover:border-primary transition-colors text-center">
                            <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">
                              {uploadingLogo ? 'Enviando...' : 'Clique para fazer upload da logo'}
                            </p>
                          </div>
                        </Label>
                        <Input
                          id="logo-upload"
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="hidden"
                          disabled={uploadingLogo}
                        />
                      </div>
                    </div>
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
                        onClick={() => {
                          setSelectedCorretoraForHistory({ id: item.id, nome: item.nome });
                          setParceiroDialogOpen(true);
                        }}
                        title="Gerenciar Parceiros BI"
                      >
                        <Users className="h-4 w-4" />
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
        <>
          <CorretoraHistoricoDialog
            open={historicoDialogOpen}
            onOpenChange={setHistoricoDialogOpen}
            corretoraId={selectedCorretoraForHistory.id}
            corretoraName={selectedCorretoraForHistory.nome}
          />
          <GerenciarParceirosDialog
            open={parceiroDialogOpen}
            onOpenChange={setParceiroDialogOpen}
            corretoraId={selectedCorretoraForHistory.id}
            corretoraNome={selectedCorretoraForHistory.nome}
          />
        </>
      )}
    </div>
  );
}
