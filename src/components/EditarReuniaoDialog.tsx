import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/components/ui/responsive-dialog";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Pencil, Search, X, Plus, UserPlus, Loader2 } from "lucide-react";

interface Contato {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  whatsapp: string | null;
}

interface Convidado {
  nome: string;
  email: string;
  telefone: string;
  fromContato?: boolean;
}

interface MeetingRoom {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: string;
  status: string;
  host_id: string;
  agendado_para: string | null;
  convidados: any[] | null;
}

interface Props {
  room: MeetingRoom;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export default function EditarReuniaoDialog({ room, open, onOpenChange, onUpdated }: Props) {
  const [form, setForm] = useState({
    nome: room.nome,
    descricao: room.descricao || "",
    tipo: room.tipo,
    agendado_para: room.agendado_para ? new Date(room.agendado_para).toISOString().slice(0, 16) : "",
    duracao_minutos: "60",
  });
  const [convidados, setConvidados] = useState<Convidado[]>((room.convidados as Convidado[]) || []);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Contato[]>([]);
  const [searching, setSearching] = useState(false);
  const [novoConvidado, setNovoConvidado] = useState({ nome: "", email: "", telefone: "" });
  const [showAddNew, setShowAddNew] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      nome: room.nome,
      descricao: room.descricao || "",
      tipo: room.tipo,
      agendado_para: room.agendado_para ? new Date(room.agendado_para).toISOString().slice(0, 16) : "",
      duracao_minutos: "60",
    });
    setConvidados((room.convidados as Convidado[]) || []);
  }, [room]);

  const searchContatos = useCallback(async (term: string) => {
    if (term.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from("contatos")
      .select("id, nome, email, telefone, whatsapp")
      .or(`nome.ilike.%${term}%,email.ilike.%${term}%`)
      .limit(10);
    setSearchResults(data || []);
    setSearching(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchContatos(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm, searchContatos]);

  const addContatoFromSearch = (contato: Contato) => {
    if (convidados.some((c) => c.email === contato.email)) {
      toast.info("Contato já adicionado");
      return;
    }
    setConvidados((prev) => [...prev, {
      nome: contato.nome,
      email: contato.email || "",
      telefone: contato.whatsapp || contato.telefone || "",
      fromContato: true,
    }]);
    setSearchTerm("");
    setSearchResults([]);
  };

  const addNovoConvidado = () => {
    if (!novoConvidado.email && !novoConvidado.telefone) {
      toast.error("Informe email ou telefone");
      return;
    }
    setConvidados((prev) => [...prev, { ...novoConvidado }]);
    setNovoConvidado({ nome: "", email: "", telefone: "" });
    setShowAddNew(false);
  };

  const removeConvidado = (index: number) => {
    setConvidados((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error("Informe o nome da reunião"); return; }
    setSaving(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("Não autenticado");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=updateRoom`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roomId: room.id,
            nome: form.nome,
            descricao: form.descricao || null,
            tipo: form.tipo,
            agendado_para: form.agendado_para || null,
            duracao_minutos: parseInt(form.duracao_minutos) || 60,
            convidados,
          }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      toast.success("Reunião atualizada!");
      onOpenChange(false);
      onUpdated();
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar");
    }
    setSaving(false);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" /> Editar Reunião
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label>Nome da Reunião *</Label>
              <Input value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} />
            </div>
            <div>
              <Label>Data e Hora</Label>
              <Input type="datetime-local" value={form.agendado_para} onChange={(e) => setForm((p) => ({ ...p, agendado_para: e.target.value }))} />
            </div>
            <div>
              <Label>Duração</Label>
              <Select value={form.duracao_minutos} onValueChange={(v) => setForm((p) => ({ ...p, duracao_minutos: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 min</SelectItem>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="60">1 hora</SelectItem>
                  <SelectItem value="90">1h30</SelectItem>
                  <SelectItem value="120">2 horas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Descrição / Pauta</Label>
              <Textarea value={form.descricao} onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} rows={2} />
            </div>
          </div>

          {/* Convidados */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Convidados</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar contato..." className="pl-9" />
              {searching && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>

            {searchResults.length > 0 && (
              <div className="border rounded-md max-h-40 overflow-y-auto">
                {searchResults.map((c) => (
                  <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center justify-between text-sm border-b last:border-0" onClick={() => addContatoFromSearch(c)}>
                    <div>
                      <span className="font-medium">{c.nome}</span>
                      {c.email && <span className="text-muted-foreground ml-2">• {c.email}</span>}
                    </div>
                    <Plus className="h-4 w-4 text-primary" />
                  </button>
                ))}
              </div>
            )}

            {!showAddNew ? (
              <Button variant="outline" size="sm" onClick={() => setShowAddNew(true)} className="gap-1.5">
                <UserPlus className="h-3.5 w-3.5" /> Adicionar novo
              </Button>
            ) : (
              <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder="Nome" value={novoConvidado.nome} onChange={(e) => setNovoConvidado((p) => ({ ...p, nome: e.target.value }))} />
                  <Input placeholder="Email" value={novoConvidado.email} onChange={(e) => setNovoConvidado((p) => ({ ...p, email: e.target.value }))} />
                  <Input placeholder="WhatsApp" value={novoConvidado.telefone} onChange={(e) => setNovoConvidado((p) => ({ ...p, telefone: e.target.value }))} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={addNovoConvidado}>Adicionar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddNew(false)}>Cancelar</Button>
                </div>
              </div>
            )}

            {convidados.length > 0 && (
              <div className="space-y-1.5">
                {convidados.map((c, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-muted/40 rounded-md text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate">{c.nome || "Sem nome"}</span>
                      {c.email && <span className="text-muted-foreground truncate">• {c.email}</span>}
                      {c.telefone && <span className="text-muted-foreground truncate">• {c.telefone}</span>}
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeConvidado(i)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar Alterações
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
