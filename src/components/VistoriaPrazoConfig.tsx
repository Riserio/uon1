import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Save, Clock, Building2 } from 'lucide-react';

interface PrazoConfig {
  id: string;
  corretora_id: string;
  prazo_dias: number;
  prazo_horas: number;
  ativo: boolean;
  corretora?: { nome: string };
}

interface Corretora {
  id: string;
  nome: string;
}

export function VistoriaPrazoConfig() {
  const [corretoras, setCorretoras] = useState<Corretora[]>([]);
  const [prazos, setPrazos] = useState<PrazoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [selectedCorretora, setSelectedCorretora] = useState('');
  const [prazoDias, setPrazoDias] = useState(3);
  const [prazoHoras, setPrazoHoras] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Carregar associações
      const { data: corretorasData, error: corretorasError } = await supabase
        .from('corretoras')
        .select('id, nome')
        .order('nome');

      if (corretorasError) throw corretorasError;
      setCorretoras(corretorasData || []);

      // Carregar configurações de prazo
      const { data: prazosData, error: prazosError } = await supabase
        .from('vistoria_prazo_config')
        .select('*, corretoras(nome)')
        .order('created_at', { ascending: false });

      if (prazosError) throw prazosError;
      setPrazos((prazosData || []).map(p => ({
        ...p,
        corretora: p.corretoras as { nome: string } | undefined
      })));

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedCorretora) {
      toast.error('Selecione uma associação');
      return;
    }

    if (prazoDias < 0 || prazoHoras < 0) {
      toast.error('Valores de prazo devem ser positivos');
      return;
    }

    try {
      setSaving(true);

      // Verificar se já existe configuração para esta associação
      const existente = prazos.find(p => p.corretora_id === selectedCorretora);

      if (existente) {
        // Atualizar
        const { error } = await supabase
          .from('vistoria_prazo_config')
          .update({
            prazo_dias: prazoDias,
            prazo_horas: prazoHoras,
            ativo: true
          })
          .eq('id', existente.id);

        if (error) throw error;
        toast.success('Prazo atualizado com sucesso');
      } else {
        // Inserir
        const { error } = await supabase
          .from('vistoria_prazo_config')
          .insert({
            corretora_id: selectedCorretora,
            prazo_dias: prazoDias,
            prazo_horas: prazoHoras,
            ativo: true
          });

        if (error) throw error;
        toast.success('Prazo configurado com sucesso');
      }

      // Recarregar dados
      loadData();
      setSelectedCorretora('');
      setPrazoDias(3);
      setPrazoHoras(0);

    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAtivo = async (id: string, ativo: boolean) => {
    try {
      const { error } = await supabase
        .from('vistoria_prazo_config')
        .update({ ativo: !ativo })
        .eq('id', id);

      if (error) throw error;
      toast.success(ativo ? 'Prazo desativado' : 'Prazo ativado');
      loadData();
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      toast.error('Erro ao atualizar');
    }
  };

  const handleEdit = (prazo: PrazoConfig) => {
    setSelectedCorretora(prazo.corretora_id);
    setPrazoDias(prazo.prazo_dias);
    setPrazoHoras(prazo.prazo_horas);
  };

  const formatPrazo = (dias: number, horas: number) => {
    const partes = [];
    if (dias > 0) partes.push(`${dias} dia${dias > 1 ? 's' : ''}`);
    if (horas > 0) partes.push(`${horas} hora${horas > 1 ? 's' : ''}`);
    return partes.length > 0 ? partes.join(' e ') : '0 horas';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Configurar Prazo de Vistoria
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <Label>Associação</Label>
              <Select value={selectedCorretora} onValueChange={setSelectedCorretora}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma associação..." />
                </SelectTrigger>
                <SelectContent>
                  {corretoras.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Dias</Label>
              <Input
                type="number"
                min={0}
                value={prazoDias}
                onChange={(e) => setPrazoDias(parseInt(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>Horas</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={prazoHoras}
                onChange={(e) => setPrazoHoras(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="bg-muted/50 p-3 rounded-lg text-sm text-muted-foreground">
            <p>
              <strong>Prazo configurado:</strong> {formatPrazo(prazoDias, prazoHoras)}
            </p>
            <p className="mt-1">
              Quando um sinistro for registrado com essa associação, a vistoria terá este prazo a partir do momento do registro.
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar Configuração'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Prazos Configurados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Associação</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prazos.map(prazo => (
                  <TableRow key={prazo.id} className={!prazo.ativo ? 'opacity-50' : ''}>
                    <TableCell className="font-medium">
                      {prazo.corretora?.nome || 'N/A'}
                    </TableCell>
                    <TableCell>
                      {formatPrazo(prazo.prazo_dias, prazo.prazo_horas)}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={prazo.ativo}
                        onCheckedChange={() => handleToggleAtivo(prazo.id, prazo.ativo)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(prazo)}
                      >
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {prazos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      Nenhum prazo configurado ainda
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
