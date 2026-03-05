import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOutletContext } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, LayoutGrid, List } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const STATUSES = ["Recebimento", "Levantamento", "Acionamento Setor", "Contato Associado", "Monitoramento", "Resolvido", "Sem Resolução"];

const STATUS_COLORS: Record<string, string> = {
  "Recebimento": "bg-blue-100 text-blue-800",
  "Levantamento": "bg-yellow-100 text-yellow-800",
  "Acionamento Setor": "bg-orange-100 text-orange-800",
  "Contato Associado": "bg-purple-100 text-purple-800",
  "Monitoramento": "bg-cyan-100 text-cyan-800",
  "Resolvido": "bg-green-100 text-green-800",
  "Sem Resolução": "bg-red-100 text-red-800",
};

const TIPO_LABELS: Record<string, string> = {
  reclamacao: "Reclamação", sugestao: "Sugestão", elogio: "Elogio", denuncia: "Denúncia",
};

const PIE_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#8b5cf6"];

type Registro = {
  id: string; protocolo: string; nome: string; tipo: string; status: string;
  placa_veiculo: string | null; created_at: string; urgencia: string | null;
};

export default function PortalOuvidoria() {
  const { corretora } = useOutletContext<{ corretora: { id: string; nome: string } }>();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("all");

  useEffect(() => {
    if (!corretora?.id) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("ouvidoria_registros")
        .select("id, protocolo, nome, tipo, status, placa_veiculo, created_at, urgencia")
        .eq("corretora_id", corretora.id)
        .order("created_at", { ascending: false });
      setRegistros((data as any) || []);
      setLoading(false);
    })();
  }, [corretora?.id]);

  const filtered = registros.filter(r => {
    const matchSearch = !search || r.protocolo.toLowerCase().includes(search.toLowerCase()) || r.nome.toLowerCase().includes(search.toLowerCase());
    const matchTipo = filterTipo === "all" || r.tipo === filterTipo;
    return matchSearch && matchTipo;
  });

  const totalAbertos = filtered.filter(r => !["Resolvido", "Sem Resolução"].includes(r.status)).length;
  const resolvidos = filtered.filter(r => r.status === "Resolvido").length;
  const semResolucao = filtered.filter(r => r.status === "Sem Resolução").length;
  const tipoCounts = Object.keys(TIPO_LABELS).map(t => ({ name: TIPO_LABELS[t], value: filtered.filter(r => r.tipo === t).length }));
  const statusCounts = STATUSES.map(s => ({ name: s, count: filtered.filter(r => r.status === s).length }));

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Ouvidoria</h2>
        <p className="text-sm text-muted-foreground">Acompanhe as manifestações da associação</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{filtered.length}</p><p className="text-xs text-muted-foreground">Total</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{totalAbertos}</p><p className="text-xs text-muted-foreground">Em Andamento</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-green-600">{resolvidos}</p><p className="text-xs text-muted-foreground">Resolvidos</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-red-600">{semResolucao}</p><p className="text-xs text-muted-foreground">Sem Resolução</p></CardContent></Card>
      </div>

      <Tabs defaultValue="tabela">
        <TabsList>
          <TabsTrigger value="tabela"><List className="h-4 w-4 mr-1" /> Tabela</TabsTrigger>
          <TabsTrigger value="kanban"><LayoutGrid className="h-4 w-4 mr-1" /> Kanban</TabsTrigger>
          <TabsTrigger value="graficos">Gráficos</TabsTrigger>
        </TabsList>

        <div className="flex flex-wrap gap-3 items-center mt-4">
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Todos os tipos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {Object.entries(TIPO_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar protocolo, nome..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>

        <TabsContent value="tabela">
          <Card className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Protocolo</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 50).map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{r.protocolo}</TableCell>
                    <TableCell>{r.nome}</TableCell>
                    <TableCell><Badge variant="outline">{TIPO_LABELS[r.tipo]}</Badge></TableCell>
                    <TableCell><Badge className={STATUS_COLORS[r.status]}>{r.status}</Badge></TableCell>
                    <TableCell>{format(new Date(r.created_at), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="kanban">
          <div className="flex gap-3 overflow-x-auto pb-4 mt-4">
            {STATUSES.map(status => {
              const cards = filtered.filter(r => r.status === status);
              return (
                <div key={status} className="min-w-[220px] w-[220px] flex-shrink-0">
                  <div className={`rounded-t-lg px-3 py-2 text-sm font-semibold ${STATUS_COLORS[status]}`}>{status} ({cards.length})</div>
                  <div className="bg-muted/30 rounded-b-lg p-2 space-y-2 min-h-[150px] border border-t-0">
                    {cards.slice(0, 8).map(r => (
                      <Card key={r.id}>
                        <CardContent className="p-2.5 space-y-1">
                          <p className="text-xs font-mono text-muted-foreground">{r.protocolo}</p>
                          <p className="text-sm font-medium truncate">{r.nome}</p>
                          <Badge variant="outline" className="text-xs">{TIPO_LABELS[r.tipo]}</Badge>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="graficos">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
            <Card><CardContent className="p-6">
              <h3 className="font-semibold mb-4">Por Tipo</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={tipoCounts.filter(t => t.value > 0)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                    {tipoCounts.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip /><Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent></Card>
            <Card><CardContent className="p-6">
              <h3 className="font-semibold mb-4">Por Etapa</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={statusCounts}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={50} />
                  <YAxis /><Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
