import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface Equipe {
  id: string;
  nome: string;
  descricao?: string;
  lider_id?: string;
  lideres?: string[];
}

interface Profile {
  id: string;
  nome: string;
}

interface EquipeLider {
  equipe_id: string;
  lider_id: string;
}

export default function Equipes() {
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Equipe | null>(null);
  const [formData, setFormData] = useState<Partial<Equipe>>({});
  const [selectedLideres, setSelectedLideres] = useState<string[]>([]);
  const { user, userRole } = useAuth();

  useEffect(() => {
    fetchEquipes();
    fetchProfiles();
  }, []);

  const fetchEquipes = async () => {
    let query = supabase
      .from('equipes')
      .select('*');
    
    // Se for líder, filtrar apenas as equipes onde ele é o líder
    if (userRole === 'lider' && user) {
      query = query.eq('lider_id', user.id);
    }
    
    const { data, error } = await query.order('nome');
    
    if (error) {
      toast.error('Erro ao carregar equipes');
      return;
    }
    
    // Buscar líderes adicionais de cada equipe
    const equipesComLideres = await Promise.all((data || []).map(async (equipe) => {
      const { data: lideresData } = await supabase
        .from('equipe_lideres')
        .select('lider_id')
        .eq('equipe_id', equipe.id);
      
      return {
        ...equipe,
        lideres: lideresData?.map(l => l.lider_id) || []
      };
    }));
    
    setEquipes(equipesComLideres);
  };

  const fetchProfiles = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome');
    
    if (error) {
      toast.error('Erro ao carregar usuários');
    } else {
      setProfiles(data || []);
    }
  };

  const handleSave = async () => {
    if (!formData.nome) {
      toast.error('Nome é obrigatório');
      return;
    }

    if (editingItem) {
      // Atualizar equipe
      const { error } = await supabase
        .from('equipes')
        .update(formData)
        .eq('id', editingItem.id);
      
      if (error) {
        toast.error('Erro ao atualizar equipe');
        return;
      }

      // Atualizar líderes adicionais
      // Primeiro, remover todos os líderes existentes
      await supabase
        .from('equipe_lideres')
        .delete()
        .eq('equipe_id', editingItem.id);

      // Adicionar os novos líderes
      if (selectedLideres.length > 0) {
        const lideresData = selectedLideres.map(liderId => ({
          equipe_id: editingItem.id,
          lider_id: liderId
        }));

        const { error: lideresError } = await supabase
          .from('equipe_lideres')
          .insert(lideresData);

        if (lideresError) {
          toast.error('Erro ao atualizar líderes');
          return;
        }
      }

      toast.success('Equipe atualizada!');
      setDialogOpen(false);
      fetchEquipes();
    } else {
      // Criar nova equipe - lider_id é obrigatório agora
      if (!formData.lider_id) {
        toast.error('Líder é obrigatório');
        return;
      }

      const { data: newEquipe, error } = await supabase
        .from('equipes')
        .insert([{ 
          nome: formData.nome!,
          descricao: formData.descricao,
          lider_id: formData.lider_id
        }])
        .select()
        .single();
      
      if (error) {
        toast.error('Erro ao criar equipe');
        return;
      }

      // Adicionar líderes adicionais
      if (selectedLideres.length > 0 && newEquipe) {
        const lideresData = selectedLideres.map(liderId => ({
          equipe_id: newEquipe.id,
          lider_id: liderId
        }));

        const { error: lideresError } = await supabase
          .from('equipe_lideres')
          .insert(lideresData);

        if (lideresError) {
          toast.error('Erro ao adicionar líderes');
          return;
        }
      }

      toast.success('Equipe criada!');
      setDialogOpen(false);
      fetchEquipes();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('equipes')
      .delete()
      .eq('id', id);
    
    if (error) {
      toast.error('Erro ao excluir equipe');
    } else {
      toast.success('Equipe excluída!');
      fetchEquipes();
    }
  };

  const openDialog = async (item?: Equipe) => {
    setEditingItem(item || null);
    setFormData(item || {});
    
    if (item) {
      // Carregar líderes adicionais da equipe
      const { data: lideresData } = await supabase
        .from('equipe_lideres')
        .select('lider_id')
        .eq('equipe_id', item.id);
      
      setSelectedLideres(lideresData?.map(l => l.lider_id) || []);
    } else {
      setSelectedLideres([]);
    }
    
    setDialogOpen(true);
  };

  const getLiderName = (liderId?: string) => {
    if (!liderId) return '-';
    const lider = profiles.find(p => p.id === liderId);
    return lider?.nome || '-';
  };

  const getLideresNames = (equipe: Equipe) => {
    const lideres: string[] = [];
    
    if (equipe.lider_id) {
      const lider = profiles.find(p => p.id === equipe.lider_id);
      if (lider) lideres.push(lider.nome);
    }
    
    if (equipe.lideres && equipe.lideres.length > 0) {
      equipe.lideres.forEach(liderId => {
        const lider = profiles.find(p => p.id === liderId);
        if (lider && !lideres.includes(lider.nome)) {
          lideres.push(lider.nome);
        }
      });
    }
    
    return lideres.length > 0 ? lideres.join(', ') : '-';
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon" className="hover:bg-primary/10">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold">Equipes</h1>
              <p className="text-muted-foreground">Gerenciamento de equipes</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => openDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nova Equipe
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingItem ? 'Editar Equipe' : 'Nova Equipe'}
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
                  <div className="grid gap-2">
                    <Label htmlFor="descricao">Descrição</Label>
                    <Textarea
                      id="descricao"
                      value={formData.descricao || ''}
                      onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="lider">Líder Principal</Label>
                    <Select
                      value={formData.lider_id || 'none'}
                      onValueChange={(value) => setFormData({ ...formData, lider_id: value === 'none' ? undefined : value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um líder" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {profiles.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            {profile.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Líderes Adicionais</Label>
                    <div className="border rounded-md p-4 space-y-2 max-h-[200px] overflow-y-auto">
                      {profiles.map(profile => (
                        <div key={profile.id} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`lider-${profile.id}`}
                            checked={selectedLideres.includes(profile.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedLideres([...selectedLideres, profile.id]);
                              } else {
                                setSelectedLideres(selectedLideres.filter(id => id !== profile.id));
                              }
                            }}
                            className="h-4 w-4"
                          />
                          <label htmlFor={`lider-${profile.id}`} className="text-sm cursor-pointer">
                            {profile.nome}
                          </label>
                        </div>
                      ))}
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
          </div>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Líder</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {equipes.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.nome}</TableCell>
                  <TableCell>{item.descricao || '-'}</TableCell>
                  <TableCell>{getLiderName(item.lider_id)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openDialog(item)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
