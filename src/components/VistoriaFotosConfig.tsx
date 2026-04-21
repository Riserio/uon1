import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Camera, Plus, Trash2, Save } from 'lucide-react';

interface FotoConfig {
  id: string;
  tipo_vistoria: string;
  tipo_sinistro: string | null;
  label: string;
  ordem: number;
  obrigatoria: boolean;
  instrucoes: string | null;
  ativo: boolean;
}

const TIPOS_VISTORIA = [
  { value: 'sinistro', label: 'Sinistro' },
  { value: 'reativacao', label: 'Reativação' },
];

export function VistoriaFotosConfig() {
  const [fotos, setFotos] = useState<FotoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipoVistoria, setTipoVistoria] = useState('sinistro');
  const [novaFoto, setNovaFoto] = useState({ label: '', ordem: 0, obrigatoria: true, instrucoes: '' });

  useEffect(() => { load(); }, [tipoVistoria]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vistoria_fotos_config')
      .select('*')
      .eq('tipo_vistoria', tipoVistoria)
      .order('ordem');
    if (error) toast.error('Erro ao carregar');
    else setFotos(data || []);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!novaFoto.label.trim()) { toast.error('Informe o nome da foto'); return; }
    const { error } = await supabase.from('vistoria_fotos_config').insert({
      tipo_vistoria: tipoVistoria,
      label: novaFoto.label,
      ordem: novaFoto.ordem || fotos.length + 1,
      obrigatoria: novaFoto.obrigatoria,
      instrucoes: novaFoto.instrucoes || null,
      ativo: true,
    });
    if (error) { toast.error('Erro ao adicionar'); return; }
    toast.success('Foto adicionada');
    setNovaFoto({ label: '', ordem: 0, obrigatoria: true, instrucoes: '' });
    load();
  };

  const handleToggle = async (id: string, field: 'ativo' | 'obrigatoria', value: boolean) => {
    const { error } = await supabase.from('vistoria_fotos_config').update({ [field]: value }).eq('id', id);
    if (error) toast.error('Erro');
    else load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta foto da lista?')) return;
    const { error } = await supabase.from('vistoria_fotos_config').delete().eq('id', id);
    if (error) toast.error('Erro');
    else { toast.success('Excluída'); load(); }
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> Tipo de Vistoria</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={tipoVistoria} onValueChange={setTipoVistoria}>
            <SelectTrigger className="w-full md:w-72 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPOS_VISTORIA.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground mt-3">
            {tipoVistoria === 'reativacao'
              ? 'Vistoria de reativação: somente fotos básicas e dados do cliente.'
              : 'Vistoria de sinistro: fotos completas para análise.'}
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Adicionar Foto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <Label>Nome da foto</Label>
              <Input value={novaFoto.label} onChange={e => setNovaFoto({ ...novaFoto, label: e.target.value })} placeholder="Ex: Frente do veículo" />
            </div>
            <div>
              <Label>Ordem</Label>
              <Input type="number" min={0} value={novaFoto.ordem} onChange={e => setNovaFoto({ ...novaFoto, ordem: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="flex items-end gap-2">
              <Switch checked={novaFoto.obrigatoria} onCheckedChange={v => setNovaFoto({ ...novaFoto, obrigatoria: v })} />
              <Label className="mb-2">Obrigatória</Label>
            </div>
          </div>
          <div>
            <Label>Instruções (opcional)</Label>
            <Input value={novaFoto.instrucoes} onChange={e => setNovaFoto({ ...novaFoto, instrucoes: e.target.value })} placeholder="Como tirar a foto..." />
          </div>
          <Button onClick={handleAdd} className="rounded-xl gap-2"><Save className="h-4 w-4" /> Adicionar</Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader><CardTitle>Fotos configuradas — {TIPOS_VISTORIA.find(t => t.value === tipoVistoria)?.label}</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ordem</TableHead>
                  <TableHead>Foto</TableHead>
                  <TableHead>Instruções</TableHead>
                  <TableHead>Obrigatória</TableHead>
                  <TableHead>Ativa</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fotos.map(f => (
                  <TableRow key={f.id} className={!f.ativo ? 'opacity-50' : ''}>
                    <TableCell><Badge variant="outline">{f.ordem}</Badge></TableCell>
                    <TableCell className="font-medium">{f.label}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{f.instrucoes || '—'}</TableCell>
                    <TableCell><Switch checked={f.obrigatoria} onCheckedChange={v => handleToggle(f.id, 'obrigatoria', v)} /></TableCell>
                    <TableCell><Switch checked={f.ativo} onCheckedChange={v => handleToggle(f.id, 'ativo', v)} /></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(f.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {fotos.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma foto configurada</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
