import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, FolderOpen, BarChart3 } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";

interface Props {
  corretoraId: string;
}

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
];

export default function FinanceiroCentrosCusto({ corretoraId }: Props) {
  const [centros, setCentros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resumo, setResumo] = useState<any[]>([]);
  const [formData, setFormData] = useState({ nome: "", cor: "#6366f1", descricao: "", ativo: true });

  useEffect(() => { if (corretoraId) { fetchCentros(); fetchResumo(); } }, [corretoraId]);

  const fetchCentros = async () => {
    setLoading(true);
    let query = supabase.from("centros_custo").select("*").order("nome");
    if (corretoraId === "administradora") {
      query = query.is("corretora_id", null);
    } else {
      query = query.eq("corretora_id", corretoraId);
    }
    const { data } = await query;
    setCentros(data || []);
    setLoading(false);
  };

  const fetchResumo = async () => {
    let query = supabase.from("lancamentos_financeiros").select("centro_custo_id, tipo_lancamento, valor_liquido, status");
    if (corretoraId === "administradora") {
      query = query.is("corretora_id", null);
    } else {
      query = query.eq("corretora_id", corretoraId);
    }
    const { data } = await query;
    if (!data) return;

    const map = new Map<string, { receitas: number; despesas: number; total: number }>();
    data.forEach((l) => {
      const key = l.centro_custo_id || "__sem_centro";
      if (!map.has(key)) map.set(key, { receitas: 0, despesas: 0, total: 0 });
      const entry = map.get(key)!;
      const val = l.valor_liquido || 0;
      if (l.tipo_lancamento === "receita") { entry.receitas += val; entry.total += val; }
      else { entry.despesas += val; entry.total -= val; }
    });
    setResumo(Array.from(map.entries()).map(([k, v]) => ({ id: k, ...v })));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        nome: formData.nome,
        cor: formData.cor,
        descricao: formData.descricao || null,
        ativo: formData.ativo,
        corretora_id: corretoraId === "administradora" ? null : corretoraId,
      };

      if (editingId) {
        const { error } = await supabase.from("centros_custo").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Centro de custo atualizado!");
      } else {
        const { error } = await supabase.from("centros_custo").insert([payload]);
        if (error) throw error;
        toast.success("Centro de custo criado!");
      }
      setDialogOpen(false);
      setEditingId(null);
      setFormData({ nome: "", cor: "#6366f1", descricao: "", ativo: true });
      fetchCentros();
      fetchResumo();
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar");
    }
  };

  const handleEdit = (c: any) => {
    setEditingId(c.id);
    setFormData({ nome: c.nome, cor: c.cor, descricao: c.descricao || "", ativo: c.ativo });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir centro de custo? Lançamentos vinculados perderão a associação.")) return;
    const { error } = await supabase.from("centros_custo").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Centro de custo excluído!");
    fetchCentros();
    fetchResumo();
  };

  const getCentroNome = (id: string) => {
    if (id === "__sem_centro") return "Sem Centro de Custo";
    return centros.find((c) => c.id === id)?.nome || "Desconhecido";
  };

  const getCentroCor = (id: string) => {
    if (id === "__sem_centro") return "#94a3b8";
    return centros.find((c) => c.id === id)?.cor || "#94a3b8";
  };

  const chartData = resumo
    .filter((r) => r.receitas > 0 || r.despesas > 0)
    .map((r) => ({
      nome: getCentroNome(r.id),
      receitas: r.receitas,
      despesas: r.despesas,
      saldo: r.total,
      cor: getCentroCor(r.id),
    }))
    .sort((a, b) => b.despesas - a.despesas);

  const pieData = chartData.map((d) => ({ name: d.nome, value: d.despesas, fill: d.cor }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Centros de Custo</h2>
          <Badge variant="outline">{centros.length}</Badge>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingId(null); setFormData({ nome: "", cor: "#6366f1", descricao: "", ativo: true }); } }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" />Novo Centro</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? "Editar" : "Novo"} Centro de Custo</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input required value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} />
              </div>
              <div>
                <Label>Cor</Label>
                <div className="flex gap-2 mt-1.5 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setFormData({ ...formData, cor: c })}
                      className={`h-8 w-8 rounded-lg border-2 transition-all ${formData.cor === c ? "border-foreground scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea value={formData.descricao} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={formData.ativo} onCheckedChange={(v) => setFormData({ ...formData, ativo: v })} />
                <Label>Ativo</Label>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button type="submit">{editingId ? "Atualizar" : "Criar"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Charts */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Despesas por Centro de Custo</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                    <XAxis type="number" tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} className="text-xs" />
                    <YAxis type="category" dataKey="nome" width={120} className="text-xs" tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="despesas" radius={[0, 4, 4, 0]}>
                      {chartData.map((d, i) => <Cell key={i} fill={d.cor} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Distribuição de Despesas</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                      {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cor</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Receitas</TableHead>
                <TableHead className="text-right">Despesas</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {centros.map((c) => {
                const r = resumo.find((s) => s.id === c.id) || { receitas: 0, despesas: 0, total: 0 };
                return (
                  <TableRow key={c.id}>
                    <TableCell><div className="h-4 w-4 rounded-full" style={{ backgroundColor: c.cor }} /></TableCell>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">{c.descricao || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={c.ativo ? "default" : "secondary"}>{c.ativo ? "Ativo" : "Inativo"}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-green-600">{formatCurrency(r.receitas)}</TableCell>
                    <TableCell className="text-right text-red-600">{formatCurrency(r.despesas)}</TableCell>
                    <TableCell className={`text-right font-bold ${r.total >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(r.total)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(c)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {centros.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nenhum centro de custo cadastrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
