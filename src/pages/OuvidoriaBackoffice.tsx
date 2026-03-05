import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Search, Eye, LayoutGrid, List, Settings2, BarChart3, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import OuvidoriaConfigDialog from "@/components/ouvidoria/OuvidoriaConfigDialog";

const STATUSES = [
  "Recebimento",
  "Levantamento",
  "Acionamento Setor",
  "Contato Associado",
  "Monitoramento",
  "Resolvido",
  "Sem Resolução",
];

const STATUS_COLORS: Record<string, string> = {
  "Recebimento": "bg-blue-100 text-blue-800 border-blue-300",
  "Levantamento": "bg-yellow-100 text-yellow-800 border-yellow-300",
  "Acionamento Setor": "bg-orange-100 text-orange-800 border-orange-300",
  "Contato Associado": "bg-purple-100 text-purple-800 border-purple-300",
  "Monitoramento": "bg-cyan-100 text-cyan-800 border-cyan-300",
  "Resolvido": "bg-green-100 text-green-800 border-green-300",
  "Sem Resolução": "bg-red-100 text-red-800 border-red-300",
};

const TIPO_LABELS: Record<string, string> = {
  reclamacao: "Reclamação",
  sugestao: "Sugestão",
  elogio: "Elogio",
  denuncia: "Denúncia",
};

type Registro = {
  id: string;
  protocolo: string;
  nome: string;
  cpf: string | null;
  email: string;
  telefone: string | null;
  tipo: string;
  descricao: string;
  placa_veiculo: string | null;
  status: string;
  observacoes_internas: string | null;
  corretora_id: string;
  created_at: string;
  updated_at: string;
};

export default function OuvidoriaBackoffice() {
  const { user } = useAuth();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [corretoras, setCorretoras] = useState<any[]>([]);
  const [selectedCorretora, setSelectedCorretora] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selectedRegistro, setSelectedRegistro] = useState<Registro | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "tabela">("kanban");

  useEffect(() => {
    loadCorretoras();
  }, []);

  useEffect(() => {
    loadRegistros();
  }, [selectedCorretora]);

  const loadCorretoras = async () => {
    const { data } = await supabase.from("corretoras").select("id, nome").order("nome");
    setCorretoras(data || []);
  };

  const loadRegistros = async () => {
    setLoading(true);
    let query = supabase
      .from("ouvidoria_registros")
      .select("*")
      .order("created_at", { ascending: false });

    if (selectedCorretora !== "all") {
      query = query.eq("corretora_id", selectedCorretora);
    }

    const { data, error } = await query;
    if (error) console.error(error);
    setRegistros(data || []);
    setLoading(false);
  };

  const updateStatus = async (registro: Registro, novoStatus: string) => {
    const statusAnterior = registro.status;
    const { error } = await supabase
      .from("ouvidoria_registros")
      .update({ status: novoStatus })
      .eq("id", registro.id);

    if (error) {
      toast.error("Erro ao atualizar status");
      return;
    }

    // Registrar histórico
    await supabase.from("ouvidoria_historico").insert({
      registro_id: registro.id,
      status_anterior: statusAnterior,
      status_novo: novoStatus,
      user_id: user?.id,
      user_nome: user?.email || "Sistema",
    });

    toast.success(`Status alterado para ${novoStatus}`);
    loadRegistros();
  };

  const updateObservacoes = async (id: string, obs: string) => {
    const { error } = await supabase
      .from("ouvidoria_registros")
      .update({ observacoes_internas: obs })
      .eq("id", id);

    if (error) toast.error("Erro ao salvar observações");
    else toast.success("Observações salvas");
  };

  const filtered = registros.filter((r) => {
    const matchSearch =
      !search ||
      r.protocolo.toLowerCase().includes(search.toLowerCase()) ||
      r.nome.toLowerCase().includes(search.toLowerCase()) ||
      r.email.toLowerCase().includes(search.toLowerCase()) ||
      (r.placa_veiculo?.toLowerCase().includes(search.toLowerCase()));
    const matchTipo = filterTipo === "all" || r.tipo === filterTipo;
    return matchSearch && matchTipo;
  });

  // Stats
  const stats = STATUSES.map((s) => ({
    status: s,
    count: filtered.filter((r) => r.status === s).length,
  }));

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ouvidoria</h1>
          <p className="text-muted-foreground">Gestão de manifestações</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
            <Settings2 className="h-4 w-4 mr-1" /> Configurar
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={selectedCorretora} onValueChange={setSelectedCorretora}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Todas as associações" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as associações</SelectItem>
            {corretoras.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Todos os tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {Object.entries(TIPO_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar protocolo, nome, e-mail, placa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex gap-1 border rounded-md p-0.5">
          <Button variant={viewMode === "kanban" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("kanban")}>
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button variant={viewMode === "tabela" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("tabela")}>
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {stats.map((s) => (
          <Card key={s.status} className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{s.count}</p>
              <p className="text-xs text-muted-foreground truncate">{s.status}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Content */}
      {viewMode === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STATUSES.map((status) => {
            const cards = filtered.filter((r) => r.status === status);
            return (
              <div key={status} className="min-w-[260px] w-[260px] flex-shrink-0">
                <div className={`rounded-t-lg px-3 py-2 text-sm font-semibold border ${STATUS_COLORS[status]}`}>
                  {status} ({cards.length})
                </div>
                <div className="bg-muted/30 rounded-b-lg p-2 space-y-2 min-h-[200px] border border-t-0">
                  {cards.slice(0, 10).map((r) => (
                    <Card
                      key={r.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => { setSelectedRegistro(r); setDetailOpen(true); }}
                    >
                      <CardContent className="p-3 space-y-1">
                        <p className="text-xs font-mono text-muted-foreground">{r.protocolo}</p>
                        <p className="text-sm font-medium truncate">{r.nome}</p>
                        <Badge variant="outline" className="text-xs">
                          {TIPO_LABELS[r.tipo] || r.tipo}
                        </Badge>
                        {r.placa_veiculo && (
                          <p className="text-xs text-muted-foreground">🚗 {r.placa_veiculo}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(r.created_at), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                  {cards.length > 10 && (
                    <p className="text-xs text-center text-muted-foreground">+{cards.length - 10} registros</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Protocolo</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>Data</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 50).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-sm">{r.protocolo}</TableCell>
                  <TableCell>{r.nome}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{TIPO_LABELS[r.tipo]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[r.status]}>{r.status}</Badge>
                  </TableCell>
                  <TableCell>{r.placa_veiculo || "-"}</TableCell>
                  <TableCell>{format(new Date(r.created_at), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => { setSelectedRegistro(r); setDetailOpen(true); }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedRegistro?.protocolo}
            </DialogTitle>
          </DialogHeader>
          {selectedRegistro && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Nome:</span> {selectedRegistro.nome}</div>
                <div><span className="text-muted-foreground">CPF:</span> {selectedRegistro.cpf || "-"}</div>
                <div><span className="text-muted-foreground">E-mail:</span> {selectedRegistro.email}</div>
                <div><span className="text-muted-foreground">Telefone:</span> {selectedRegistro.telefone || "-"}</div>
                <div><span className="text-muted-foreground">Tipo:</span> {TIPO_LABELS[selectedRegistro.tipo]}</div>
                <div><span className="text-muted-foreground">Placa:</span> {selectedRegistro.placa_veiculo || "-"}</div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Data:</span>{" "}
                  {format(new Date(selectedRegistro.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">Descrição</Label>
                <p className="text-sm bg-muted/50 rounded p-3 mt-1">{selectedRegistro.descricao}</p>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={selectedRegistro.status}
                  onValueChange={(v) => {
                    updateStatus(selectedRegistro, v);
                    setSelectedRegistro({ ...selectedRegistro, status: v });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Observações Internas</Label>
                <Textarea
                  defaultValue={selectedRegistro.observacoes_internas || ""}
                  onBlur={(e) => updateObservacoes(selectedRegistro.id, e.target.value)}
                  placeholder="Notas internas..."
                  rows={3}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <OuvidoriaConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        corretoras={corretoras}
      />
    </div>
  );
}
