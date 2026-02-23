import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/components/ui/responsive-dialog";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus, Search, X, Mail, MessageSquare, UserPlus, Calendar, Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export default function CriarReuniaoDialog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    nome: "",
    descricao: "",
    tipo: "privada",
    agendado_para: "",
    duracao_minutos: "60",
  });
  const [convidados, setConvidados] = useState<Convidado[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Contato[]>([]);
  const [searching, setSearching] = useState(false);
  const [novoConvidado, setNovoConvidado] = useState({ nome: "", email: "", telefone: "" });
  const [showAddNew, setShowAddNew] = useState(false);
  const [enviarEmail, setEnviarEmail] = useState(true);
  const [enviarWhatsApp, setEnviarWhatsApp] = useState(false);
  const [creating, setCreating] = useState(false);

  const searchContatos = useCallback(async (term: string) => {
    if (term.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from("contatos")
      .select("id, nome, email, telefone, whatsapp")
      .or(`nome.ilike.%${term}%,email.ilike.%${term}%,telefone.ilike.%${term}%`)
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
    setConvidados((prev) => [
      ...prev,
      {
        nome: contato.nome,
        email: contato.email || "",
        telefone: contato.whatsapp || contato.telefone || "",
        fromContato: true,
      },
    ]);
    setSearchTerm("");
    setSearchResults([]);
  };

  const addNovoConvidado = async () => {
    if (!novoConvidado.email && !novoConvidado.telefone) {
      toast.error("Informe email ou telefone");
      return;
    }

    // Check if email already exists in contatos
    if (novoConvidado.email) {
      const { data: existing } = await supabase
        .from("contatos")
        .select("id, nome, email, telefone, whatsapp")
        .eq("email", novoConvidado.email)
        .limit(1);

      if (existing && existing.length > 0) {
        toast.info(`Contato "${existing[0].nome}" já existe com esse email. Adicionado automaticamente.`);
        addContatoFromSearch(existing[0]);
        setNovoConvidado({ nome: "", email: "", telefone: "" });
        setShowAddNew(false);
        return;
      }
    }

    if (convidados.some((c) => c.email === novoConvidado.email && novoConvidado.email)) {
      toast.info("Email já adicionado");
      return;
    }

    setConvidados((prev) => [...prev, { ...novoConvidado }]);
    setNovoConvidado({ nome: "", email: "", telefone: "" });
    setShowAddNew(false);
  };

  const removeConvidado = (index: number) => {
    setConvidados((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!form.nome.trim()) { toast.error("Informe o nome da reunião"); return; }
    setCreating(true);

    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("Não autenticado");

      // 1. Create the room
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=createRoom`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...form,
            agendado_para: form.agendado_para || null,
            duracao_minutos: parseInt(form.duracao_minutos) || 60,
            convidados,
          }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const roomId = data.room.id;
      const meetingLink = `${window.location.origin}/video/${roomId}`;

      // 2. Send notifications
      if (convidados.length > 0 && (enviarEmail || enviarWhatsApp)) {
        try {
          await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=notifyMeeting`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                roomId,
                roomName: form.nome,
                agendadoPara: form.agendado_para || null,
                descricao: form.descricao || null,
                meetingLink,
                convidados,
                enviarEmail,
                enviarWhatsApp,
              }),
            }
          );
        } catch (notifErr) {
          console.error("Notification error:", notifErr);
          toast.warning("Sala criada, mas houve erro ao enviar notificações");
        }
      }

      // 3. Save as evento in agenda
      if (form.agendado_para) {
        try {
          const duracaoMs = (parseInt(form.duracao_minutos) || 60) * 60 * 1000;
          const dataInicio = new Date(form.agendado_para);
          const dataFim = new Date(dataInicio.getTime() + duracaoMs);

          await supabase.from("eventos").insert({
            user_id: user?.id,
            titulo: `📹 ${form.nome}`,
            descricao: form.descricao || `Reunião - ${convidados.length} convidado(s)`,
            data_inicio: dataInicio.toISOString(),
            data_fim: dataFim.toISOString(),
            tipo: "reuniao",
            cor: "#7c3aed",
          });
        } catch (evErr) {
          console.error("Erro ao salvar na agenda:", evErr);
        }
      }

      toast.success("Reunião criada com sucesso!");
      onOpenChange(false);
      resetForm();
      onCreated();
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar reunião");
    }
    setCreating(false);
  };

  const resetForm = () => {
    setForm({ nome: "", descricao: "", tipo: "privada", agendado_para: "", duracao_minutos: "60" });
    setConvidados([]);
    setSearchTerm("");
    setShowAddNew(false);
    setEnviarEmail(true);
    setEnviarWhatsApp(false);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" /> Nova Reunião
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label>Nome da Reunião *</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                placeholder="Ex: Reunião de alinhamento"
              />
            </div>
            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={form.agendado_para ? form.agendado_para.split("T")[0] : ""}
                onChange={(e) => {
                  const time = form.agendado_para ? form.agendado_para.split("T")[1] || "09:00" : "09:00";
                  setForm((p) => ({ ...p, agendado_para: e.target.value ? `${e.target.value}T${time}` : "" }));
                }}
              />
            </div>
            <div>
              <Label>Horário</Label>
              <Select
                value={form.agendado_para ? form.agendado_para.split("T")[1]?.substring(0, 5) || "09:00" : "09:00"}
                onValueChange={(v) => {
                  const date = form.agendado_para ? form.agendado_para.split("T")[0] : new Date().toISOString().split("T")[0];
                  setForm((p) => ({ ...p, agendado_para: `${date}T${v}` }));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {Array.from({ length: 48 }, (_, i) => {
                    const h = String(Math.floor(i / 2)).padStart(2, "0");
                    const m = i % 2 === 0 ? "00" : "30";
                    return <SelectItem key={`${h}:${m}`} value={`${h}:${m}`}>{`${h}:${m}`}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Duração</Label>
              <Select value={form.duracao_minutos} onValueChange={(v) => setForm((p) => ({ ...p, duracao_minutos: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 min</SelectItem>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="45">45 min</SelectItem>
                  <SelectItem value="60">1 hora</SelectItem>
                  <SelectItem value="90">1h30</SelectItem>
                  <SelectItem value="120">2 horas</SelectItem>
                  <SelectItem value="180">3 horas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm((p) => ({ ...p, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="privada">Privada</SelectItem>
                  <SelectItem value="publica">Pública</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Descrição / Pauta</Label>
              <Textarea
                value={form.descricao}
                onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                placeholder="Pauta da reunião..."
                rows={2}
              />
            </div>
          </div>

          {/* Convidados */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Convidados</Label>

            {/* Search existing contacts */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar contato por nome, email ou telefone..."
                className="pl-9"
              />
              {searching && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>

            {searchResults.length > 0 && (
              <div className="border rounded-md max-h-40 overflow-y-auto">
                {searchResults.map((c) => (
                  <button
                    key={c.id}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center justify-between text-sm border-b last:border-0"
                    onClick={() => addContatoFromSearch(c)}
                  >
                    <div>
                      <span className="font-medium">{c.nome}</span>
                      {c.email && <span className="text-muted-foreground ml-2">• {c.email}</span>}
                    </div>
                    <Plus className="h-4 w-4 text-primary" />
                  </button>
                ))}
              </div>
            )}

            {/* Add new contact inline */}
            {!showAddNew ? (
              <Button variant="outline" size="sm" onClick={() => setShowAddNew(true)} className="gap-1.5">
                <UserPlus className="h-3.5 w-3.5" /> Adicionar novo convidado
              </Button>
            ) : (
              <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="Nome"
                    value={novoConvidado.nome}
                    onChange={(e) => setNovoConvidado((p) => ({ ...p, nome: e.target.value }))}
                  />
                  <Input
                    placeholder="Email"
                    type="email"
                    value={novoConvidado.email}
                    onChange={(e) => setNovoConvidado((p) => ({ ...p, email: e.target.value }))}
                  />
                  <Input
                    placeholder="WhatsApp (com DDD)"
                    value={novoConvidado.telefone}
                    onChange={(e) => setNovoConvidado((p) => ({ ...p, telefone: e.target.value }))}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={addNovoConvidado}>Adicionar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddNew(false)}>Cancelar</Button>
                </div>
              </div>
            )}

            {/* Convidados list */}
            {convidados.length > 0 && (
              <div className="space-y-1.5">
                {convidados.map((c, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-muted/40 rounded-md text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate">{c.nome || "Sem nome"}</span>
                      {c.email && <span className="text-muted-foreground truncate">• {c.email}</span>}
                      {c.telefone && <span className="text-muted-foreground truncate">• {c.telefone}</span>}
                      {c.fromContato && <Badge variant="outline" className="text-[10px]">Contato</Badge>}
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeConvidado(i)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notification options */}
          {convidados.length > 0 && (
            <div className="space-y-2 p-3 border rounded-lg bg-muted/20">
              <Label className="text-sm font-semibold">Enviar convite por:</Label>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={enviarEmail} onCheckedChange={(v) => setEnviarEmail(!!v)} />
                  <Mail className="h-4 w-4 text-muted-foreground" /> Email (SMTP)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={enviarWhatsApp} onCheckedChange={(v) => setEnviarWhatsApp(!!v)} />
                  <MessageSquare className="h-4 w-4 text-muted-foreground" /> WhatsApp (API)
                </label>
              </div>
              {enviarEmail && !convidados.some((c) => c.email) && (
                <p className="text-xs text-destructive">Nenhum convidado tem email cadastrado</p>
              )}
              {enviarWhatsApp && !convidados.some((c) => c.telefone) && (
                <p className="text-xs text-destructive">Nenhum convidado tem WhatsApp cadastrado</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating} className="gap-2">
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar Reunião
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
