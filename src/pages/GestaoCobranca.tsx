import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Users, Receipt, FileText, DollarSign, AlertCircle, CheckCircle2, Clock, Trash2, Pencil, Upload, Download } from "lucide-react";
import { format, parseISO, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

type Cliente = {
  id: string;
  nome: string;
  documento: string | null;
  tipo_documento: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  observacoes: string | null;
  ativo: boolean;
};

type Cobranca = {
  id: string;
  cliente_id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  status: "pendente" | "pago" | "vencido" | "cancelado";
  recorrencia: "unica" | "mensal" | "trimestral" | "semestral" | "anual";
  link_pagamento: string | null;
  metodo_pagamento: string | null;
  observacoes: string | null;
};

type NotaFiscal = {
  id: string;
  cliente_id: string | null;
  cobranca_id: string | null;
  numero: string | null;
  data_emissao: string | null;
  valor: number | null;
  arquivo_url: string;
  arquivo_nome: string;
  observacoes: string | null;
  created_at: string;
};

const formatBRL = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDate = (d: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return format(new Date(y, m - 1, day), "dd/MM/yyyy", { locale: ptBR });
};

export default function GestaoCobranca() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("dashboard");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cobrancas, setCobrancas] = useState<Cobranca[]>([]);
  const [notas, setNotas] = useState<NotaFiscal[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [clienteDialogOpen, setClienteDialogOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [cobrancaDialogOpen, setCobrancaDialogOpen] = useState(false);
  const [editingCobranca, setEditingCobranca] = useState<Cobranca | null>(null);
  const [nfDialogOpen, setNfDialogOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?redirect=/gestao-cobranca");
  }, [authLoading, user, navigate]);

  const loadAll = async () => {
    setLoading(true);
    const [c1, c2, c3] = await Promise.all([
      supabase.from("clientes_gestao").select("*").order("nome"),
      supabase.from("cobrancas_gestao").select("*").order("data_vencimento", { ascending: false }),
      supabase.from("notas_fiscais_gestao").select("*").order("created_at", { ascending: false }),
    ]);
    if (c1.error) toast.error("Erro ao carregar clientes");
    if (c2.error) toast.error("Erro ao carregar cobranças");
    if (c3.error) toast.error("Erro ao carregar notas fiscais");
    setClientes((c1.data as Cliente[]) || []);
    setCobrancas((c2.data as Cobranca[]) || []);
    setNotas((c3.data as NotaFiscal[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (user) loadAll();
  }, [user]);

  // Auto-update vencidos
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const vencidos = cobrancas.filter(
      (c) => c.status === "pendente" && c.data_vencimento < today
    );
    if (vencidos.length > 0) {
      supabase
        .from("cobrancas_gestao")
        .update({ status: "vencido" })
        .in("id", vencidos.map((v) => v.id))
        .then(({ error }) => {
          if (!error) {
            setCobrancas((prev) =>
              prev.map((c) => (vencidos.find((v) => v.id === c.id) ? { ...c, status: "vencido" } : c))
            );
          }
        });
    }
  }, [cobrancas.length]);

  const stats = useMemo(() => {
    const total = cobrancas.reduce((s, c) => s + Number(c.valor), 0);
    const pago = cobrancas.filter((c) => c.status === "pago").reduce((s, c) => s + Number(c.valor), 0);
    const pendente = cobrancas.filter((c) => c.status === "pendente").reduce((s, c) => s + Number(c.valor), 0);
    const vencido = cobrancas.filter((c) => c.status === "vencido").reduce((s, c) => s + Number(c.valor), 0);
    return { total, pago, pendente, vencido, qtdClientes: clientes.length, qtdCobrancas: cobrancas.length };
  }, [cobrancas, clientes]);

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  const clienteNome = (id: string) => clientes.find((c) => c.id === id)?.nome || "—";

  const statusBadge = (s: string) => {
    const map: Record<string, { label: string; className: string }> = {
      pendente: { label: "Pendente", className: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30" },
      pago: { label: "Pago", className: "bg-green-500/15 text-green-700 border-green-500/30" },
      vencido: { label: "Vencido", className: "bg-red-500/15 text-red-700 border-red-500/30" },
      cancelado: { label: "Cancelado", className: "bg-gray-500/15 text-gray-700 border-gray-500/30" },
    };
    const cfg = map[s] || map.pendente;
    return <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f5f3ff] via-[#ede9fe] to-[#e0e7ff] p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#362c89]">Gestão de Cobranças</h1>
            <p className="text-muted-foreground">Clientes, cobranças recorrentes e notas fiscais</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/")}>Voltar ao site</Button>
        </header>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-white/60 backdrop-blur rounded-2xl p-1">
            <TabsTrigger value="dashboard" className="rounded-xl">Painel</TabsTrigger>
            <TabsTrigger value="clientes" className="rounded-xl">Clientes</TabsTrigger>
            <TabsTrigger value="cobrancas" className="rounded-xl">Cobranças</TabsTrigger>
            <TabsTrigger value="notas" className="rounded-xl">Notas Fiscais</TabsTrigger>
          </TabsList>

          {/* DASHBOARD */}
          <TabsContent value="dashboard" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={DollarSign} label="Total" value={formatBRL(stats.total)} color="from-[#362c89] to-[#5a4fcf]" />
              <StatCard icon={CheckCircle2} label="Recebido" value={formatBRL(stats.pago)} color="from-emerald-600 to-emerald-400" />
              <StatCard icon={Clock} label="Pendente" value={formatBRL(stats.pendente)} color="from-yellow-600 to-yellow-400" />
              <StatCard icon={AlertCircle} label="Vencido" value={formatBRL(stats.vencido)} color="from-red-600 to-red-400" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="rounded-2xl backdrop-blur bg-muted/40">
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Clientes ativos</CardTitle></CardHeader>
                <CardContent><div className="text-3xl font-bold text-[#362c89]">{stats.qtdClientes}</div></CardContent>
              </Card>
              <Card className="rounded-2xl backdrop-blur bg-muted/40">
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Receipt className="h-4 w-4" /> Cobranças cadastradas</CardTitle></CardHeader>
                <CardContent><div className="text-3xl font-bold text-[#362c89]">{stats.qtdCobrancas}</div></CardContent>
              </Card>
            </div>
            <Card className="rounded-2xl backdrop-blur bg-muted/40">
              <CardHeader><CardTitle>Próximas cobranças</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cobrancas.filter((c) => c.status !== "pago" && c.status !== "cancelado").slice(0, 8).map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{clienteNome(c.cliente_id)}</TableCell>
                        <TableCell>{c.descricao}</TableCell>
                        <TableCell>{formatDate(c.data_vencimento)}</TableCell>
                        <TableCell>{formatBRL(Number(c.valor))}</TableCell>
                        <TableCell>{statusBadge(c.status)}</TableCell>
                      </TableRow>
                    ))}
                    {cobrancas.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma cobrança cadastrada</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CLIENTES */}
          <TabsContent value="clientes" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button onClick={() => { setEditingCliente(null); setClienteDialogOpen(true); }} className="bg-[#362c89] hover:bg-[#2d2473]">
                <Plus className="h-4 w-4 mr-2" /> Novo Cliente
              </Button>
            </div>
            <Card className="rounded-2xl backdrop-blur bg-muted/40">
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientes.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.nome}</TableCell>
                        <TableCell>{c.documento || "—"}</TableCell>
                        <TableCell>{c.email || "—"}</TableCell>
                        <TableCell>{c.telefone || "—"}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button size="icon" variant="ghost" onClick={() => { setEditingCliente(c); setClienteDialogOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={async () => {
                            if (!confirm(`Excluir ${c.nome}?`)) return;
                            const { error } = await supabase.from("clientes_gestao").delete().eq("id", c.id);
                            if (error) toast.error("Erro ao excluir"); else { toast.success("Excluído"); loadAll(); }
                          }}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {clientes.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum cliente cadastrado</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* COBRANÇAS */}
          <TabsContent value="cobrancas" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button onClick={() => { setEditingCobranca(null); setCobrancaDialogOpen(true); }} className="bg-[#362c89] hover:bg-[#2d2473]">
                <Plus className="h-4 w-4 mr-2" /> Nova Cobrança
              </Button>
            </div>
            <Card className="rounded-2xl backdrop-blur bg-muted/40">
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Recorrência</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cobrancas.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{clienteNome(c.cliente_id)}</TableCell>
                        <TableCell>{c.descricao}</TableCell>
                        <TableCell>{formatBRL(Number(c.valor))}</TableCell>
                        <TableCell>{formatDate(c.data_vencimento)}</TableCell>
                        <TableCell className="capitalize">{c.recorrencia}</TableCell>
                        <TableCell>{statusBadge(c.status)}</TableCell>
                        <TableCell className="text-right space-x-1">
                          {c.status !== "pago" && (
                            <Button size="sm" variant="outline" onClick={async () => {
                              const today = new Date().toISOString().slice(0, 10);
                              const { error } = await supabase.from("cobrancas_gestao")
                                .update({ status: "pago", data_pagamento: today }).eq("id", c.id);
                              if (error) toast.error("Erro"); else { toast.success("Marcada como paga"); loadAll(); }
                            }}>Pagar</Button>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => { setEditingCobranca(c); setCobrancaDialogOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={async () => {
                            if (!confirm("Excluir cobrança?")) return;
                            const { error } = await supabase.from("cobrancas_gestao").delete().eq("id", c.id);
                            if (error) toast.error("Erro"); else { toast.success("Excluída"); loadAll(); }
                          }}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {cobrancas.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma cobrança</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* NOTAS FISCAIS */}
          <TabsContent value="notas" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button onClick={() => setNfDialogOpen(true)} className="bg-[#362c89] hover:bg-[#2d2473]">
                <Upload className="h-4 w-4 mr-2" /> Anexar Nota Fiscal
              </Button>
            </div>
            <Card className="rounded-2xl backdrop-blur bg-muted/40">
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Arquivo</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Número</TableHead>
                      <TableHead>Emissão</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {notas.map((n) => (
                      <TableRow key={n.id}>
                        <TableCell className="font-medium flex items-center gap-2"><FileText className="h-4 w-4 text-[#362c89]" />{n.arquivo_nome}</TableCell>
                        <TableCell>{n.cliente_id ? clienteNome(n.cliente_id) : "—"}</TableCell>
                        <TableCell>{n.numero || "—"}</TableCell>
                        <TableCell>{formatDate(n.data_emissao)}</TableCell>
                        <TableCell>{n.valor ? formatBRL(Number(n.valor)) : "—"}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button size="icon" variant="ghost" onClick={async () => {
                            const { data, error } = await supabase.storage.from("notas-fiscais").createSignedUrl(n.arquivo_url, 3600);
                            if (error || !data) { toast.error("Erro ao baixar"); return; }
                            window.open(data.signedUrl, "_blank");
                          }}>
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={async () => {
                            if (!confirm("Excluir nota fiscal?")) return;
                            await supabase.storage.from("notas-fiscais").remove([n.arquivo_url]);
                            const { error } = await supabase.from("notas_fiscais_gestao").delete().eq("id", n.id);
                            if (error) toast.error("Erro"); else { toast.success("Excluída"); loadAll(); }
                          }}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {notas.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma nota fiscal anexada</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <ClienteDialog open={clienteDialogOpen} onOpenChange={setClienteDialogOpen} cliente={editingCliente} userId={user.id} onSaved={loadAll} />
      <CobrancaDialog open={cobrancaDialogOpen} onOpenChange={setCobrancaDialogOpen} cobranca={editingCobranca} clientes={clientes} userId={user.id} onSaved={loadAll} />
      <NotaFiscalDialog open={nfDialogOpen} onOpenChange={setNfDialogOpen} clientes={clientes} cobrancas={cobrancas} userId={user.id} onSaved={loadAll} />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <Card className="rounded-2xl backdrop-blur bg-muted/40 overflow-hidden">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="text-2xl font-bold mt-1 text-[#362c89]">{value}</div>
          </div>
          <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white shadow-lg`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- DIALOGS ---------------- */

function ClienteDialog({ open, onOpenChange, cliente, userId, onSaved }: any) {
  const [form, setForm] = useState<Partial<Cliente>>({});
  useEffect(() => { setForm(cliente || { tipo_documento: "CPF", ativo: true }); }, [cliente, open]);

  const save = async () => {
    if (!form.nome) { toast.error("Nome é obrigatório"); return; }
    const payload = { ...form, created_by: userId };
    const op = cliente?.id
      ? supabase.from("clientes_gestao").update(payload).eq("id", cliente.id)
      : supabase.from("clientes_gestao").insert(payload as any);
    const { error } = await op;
    if (error) { toast.error(error.message); return; }
    toast.success(cliente?.id ? "Atualizado" : "Cliente criado");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{cliente?.id ? "Editar Cliente" : "Novo Cliente"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Nome *</Label>
            <Input value={form.nome || ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={form.tipo_documento || "CPF"} onValueChange={(v) => setForm({ ...form, tipo_documento: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="CPF">CPF</SelectItem><SelectItem value="CNPJ">CNPJ</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label>Documento</Label>
            <Input value={form.documento || ""} onChange={(e) => setForm({ ...form, documento: e.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={form.telefone || ""} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label>Endereço</Label>
            <Input value={form.endereco || ""} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
          </div>
          <div>
            <Label>Cidade</Label>
            <Input value={form.cidade || ""} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>UF</Label><Input maxLength={2} value={form.estado || ""} onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })} /></div>
            <div><Label>CEP</Label><Input value={form.cep || ""} onChange={(e) => setForm({ ...form, cep: e.target.value })} /></div>
          </div>
          <div className="md:col-span-2">
            <Label>Observações</Label>
            <Textarea rows={2} value={form.observacoes || ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} className="bg-[#362c89] hover:bg-[#2d2473]">Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CobrancaDialog({ open, onOpenChange, cobranca, clientes, userId, onSaved }: any) {
  const [form, setForm] = useState<Partial<Cobranca>>({});
  const [gerarRecorrencias, setGerarRecorrencias] = useState(0);

  useEffect(() => {
    setForm(cobranca || { status: "pendente", recorrencia: "unica", valor: 0 });
    setGerarRecorrencias(0);
  }, [cobranca, open]);

  const save = async () => {
    if (!form.cliente_id || !form.descricao || !form.data_vencimento || !form.valor) {
      toast.error("Cliente, descrição, valor e vencimento são obrigatórios"); return;
    }
    const payload = { ...form, created_by: userId, valor: Number(form.valor) };
    if (cobranca?.id) {
      const { error } = await supabase.from("cobrancas_gestao").update(payload).eq("id", cobranca.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { data, error } = await supabase.from("cobrancas_gestao").insert(payload as any).select().single();
      if (error) { toast.error(error.message); return; }
      // Gerar futuras se recorrente
      if (gerarRecorrencias > 0 && form.recorrencia && form.recorrencia !== "unica" && data) {
        const months = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 }[form.recorrencia] || 0;
        const baseDate = parseISO(form.data_vencimento as string);
        const futuras = Array.from({ length: gerarRecorrencias }, (_, i) => ({
          ...payload,
          data_vencimento: format(addMonths(baseDate, months * (i + 1)), "yyyy-MM-dd"),
          recorrencia_pai_id: data.id,
          status: "pendente" as const,
        }));
        await supabase.from("cobrancas_gestao").insert(futuras as any);
      }
    }
    toast.success(cobranca?.id ? "Atualizada" : "Cobrança criada");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{cobranca?.id ? "Editar Cobrança" : "Nova Cobrança"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Cliente *</Label>
            <Select value={form.cliente_id || ""} onValueChange={(v) => setForm({ ...form, cliente_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{clientes.map((c: Cliente) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Descrição *</Label><Input value={form.descricao || ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Valor (R$) *</Label><Input type="number" step="0.01" value={form.valor || ""} onChange={(e) => setForm({ ...form, valor: parseFloat(e.target.value) })} /></div>
            <div><Label>Vencimento *</Label><Input type="date" value={form.data_vencimento || ""} onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Recorrência</Label>
              <Select value={form.recorrencia || "unica"} onValueChange={(v: any) => setForm({ ...form, recorrencia: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unica">Única</SelectItem>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="trimestral">Trimestral</SelectItem>
                  <SelectItem value="semestral">Semestral</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status || "pendente"} onValueChange={(v: any) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="vencido">Vencido</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {!cobranca?.id && form.recorrencia && form.recorrencia !== "unica" && (
            <div>
              <Label>Gerar quantas parcelas futuras? (0 = só esta)</Label>
              <Input type="number" min={0} max={60} value={gerarRecorrencias} onChange={(e) => setGerarRecorrencias(parseInt(e.target.value) || 0)} />
              <p className="text-xs text-muted-foreground mt-1">Cria cobranças futuras automaticamente baseadas na recorrência.</p>
            </div>
          )}
          <div><Label>Link de pagamento (opcional)</Label><Input value={form.link_pagamento || ""} onChange={(e) => setForm({ ...form, link_pagamento: e.target.value })} placeholder="https://..." /></div>
          <div><Label>Observações</Label><Textarea rows={2} value={form.observacoes || ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} className="bg-[#362c89] hover:bg-[#2d2473]">Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NotaFiscalDialog({ open, onOpenChange, clientes, cobrancas, userId, onSaved }: any) {
  const [form, setForm] = useState<any>({});
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { setForm({}); setFile(null); }, [open]);

  const save = async () => {
    if (!file) { toast.error("Selecione um arquivo"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("notas-fiscais").upload(path, file);
      if (upErr) throw upErr;
      const payload = {
        cliente_id: form.cliente_id || null,
        cobranca_id: form.cobranca_id || null,
        numero: form.numero || null,
        data_emissao: form.data_emissao || null,
        valor: form.valor ? Number(form.valor) : null,
        arquivo_url: path,
        arquivo_nome: file.name,
        arquivo_tipo: file.type,
        observacoes: form.observacoes || null,
        created_by: userId,
      };
      const { error } = await supabase.from("notas_fiscais_gestao").insert(payload as any);
      if (error) throw error;
      toast.success("Nota fiscal anexada");
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Anexar Nota Fiscal</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Arquivo (PDF, XML, imagem) *</Label>
            <Input type="file" accept=".pdf,.xml,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Cliente</Label>
              <Select value={form.cliente_id || ""} onValueChange={(v) => setForm({ ...form, cliente_id: v })}>
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>{clientes.map((c: Cliente) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cobrança</Label>
              <Select value={form.cobranca_id || ""} onValueChange={(v) => setForm({ ...form, cobranca_id: v })}>
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>{cobrancas.slice(0, 50).map((c: Cobranca) => <SelectItem key={c.id} value={c.id}>{c.descricao} — {formatBRL(Number(c.valor))}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><Label>Número NF</Label><Input value={form.numero || ""} onChange={(e) => setForm({ ...form, numero: e.target.value })} /></div>
            <div><Label>Emissão</Label><Input type="date" value={form.data_emissao || ""} onChange={(e) => setForm({ ...form, data_emissao: e.target.value })} /></div>
            <div><Label>Valor (R$)</Label><Input type="number" step="0.01" value={form.valor || ""} onChange={(e) => setForm({ ...form, valor: e.target.value })} /></div>
          </div>
          <div><Label>Observações</Label><Textarea rows={2} value={form.observacoes || ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={uploading} className="bg-[#362c89] hover:bg-[#2d2473]">
            {uploading ? "Enviando..." : "Anexar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}