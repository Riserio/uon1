import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/components/ui/responsive-dialog";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Pencil, Search, X, Plus, UserPlus, Loader2, Mail, MessageSquare, CheckCircle2 } from "lucide-react";

// Convert UTC ISO string to local datetime-local input value (YYYY-MM-DDTHH:mm)
function formatDateTimeLocal(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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

interface RsvpStatus {
  email: string;
  nome: string | null;
  resposta: string | null;
  respondido_em: string | null;
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
    agendado_para: room.agendado_para ? formatDateTimeLocal(room.agendado_para) : "",
    duracao_minutos: "60",
  });
  const [convidados, setConvidados] = useState<Convidado[]>((room.convidados as Convidado[]) || []);
  const [originalEmails, setOriginalEmails] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Contato[]>([]);
  const [searching, setSearching] = useState(false);
  const [novoConvidado, setNovoConvidado] = useState({ nome: "", email: "", telefone: "" });
  const [showAddNew, setShowAddNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enviarEmailNovos, setEnviarEmailNovos] = useState(true);
  const [enviarWhatsAppNovos, setEnviarWhatsAppNovos] = useState(false);
  const [rsvpStatuses, setRsvpStatuses] = useState<RsvpStatus[]>([]);

  useEffect(() => {
    setForm({
      nome: room.nome,
      descricao: room.descricao || "",
      tipo: room.tipo,
      agendado_para: room.agendado_para ? formatDateTimeLocal(room.agendado_para) : "",
      duracao_minutos: "60",
    });
    const existing = (room.convidados as Convidado[]) || [];
    setConvidados(existing);
    setOriginalEmails(new Set(existing.map(c => c.email).filter(Boolean)));
    loadRsvpStatuses();
  }, [room]);

  const loadRsvpStatuses = async () => {
    try {
      const { data } = await supabase
        .from("meeting_rsvp")
        .select("email, nome, resposta, respondido_em")
        .eq("room_id", room.id);
      setRsvpStatuses((data as RsvpStatus[]) || []);
    } catch {}
  };

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

  const getRsvpBadge = (email: string) => {
    const rsvp = rsvpStatuses.find(r => r.email === email);
    if (!rsvp || !rsvp.resposta) return null;
    const map: Record<string, { label: string; className: string }> = {
      sim: { label: "Confirmado", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
      talvez: { label: "Talvez", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
      nao: { label: "Recusou", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
    };
    const info = map[rsvp.resposta];
    return info ? <Badge className={`text-[10px] ${info.className}`}>{info.label}</Badge> : null;
  };

  const newConvidados = convidados.filter(c => c.email && !originalEmails.has(c.email));

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error("Informe o nome da reunião"); return; }
    setSaving(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("Não autenticado");

      console.log("[EditarReuniao] Saving room", room.id, "with", convidados.length, "guests, newGuests:", newConvidados.length);

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
            agendado_para: form.agendado_para ? new Date(form.agendado_para).toISOString() : null,
            duracao_minutos: parseInt(form.duracao_minutos) || 60,
            convidados,
          }),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        console.error("[EditarReuniao] updateRoom HTTP error:", res.status, errText);
        throw new Error(`Erro ao atualizar (HTTP ${res.status})`);
      }

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      console.log("[EditarReuniao] Room updated successfully");

      // Send notifications to NEW participants only
      if (newConvidados.length > 0 && (enviarEmailNovos || enviarWhatsAppNovos)) {
        console.log("[EditarReuniao] Sending notifications to", newConvidados.length, "new guests");
        try {
          // Fetch email template (like CriarReuniaoDialog)
          let templateCorpo: string | null = null;
          let templateAssunto: string | null = null;
          if (enviarEmailNovos) {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (authUser) {
              const { data: tmpl } = await supabase
                .from('email_templates')
                .select('corpo, assunto')
                .eq('user_id', authUser.id)
                .eq('tipo', 'convite_reuniao')
                .eq('ativo', true)
                .limit(1)
                .single();
              if (tmpl) {
                templateCorpo = tmpl.corpo;
                templateAssunto = tmpl.assunto;
              }
            }
          }

          const meetingLink = `${window.location.origin}/video/${room.id}`;
          const notifyRes = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=notifyMeeting`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                roomId: room.id,
                roomName: form.nome,
                agendadoPara: form.agendado_para ? new Date(form.agendado_para).toISOString() : null,
                descricao: form.descricao || null,
                meetingLink,
                convidados: newConvidados,
                enviarEmail: enviarEmailNovos,
                enviarWhatsApp: enviarWhatsAppNovos,
                duracaoMinutos: parseInt(form.duracao_minutos) || 60,
                templateCorpo,
                templateAssunto,
              }),
            }
          );

          if (!notifyRes.ok) {
            const errText = await notifyRes.text();
            console.error("[EditarReuniao] notifyMeeting HTTP error:", notifyRes.status, errText);
            toast.warning("Reunião salva, mas houve erro ao enviar notificações");
          } else {
            const notifyData = await notifyRes.json();
            console.log("[EditarReuniao] notifyMeeting result:", notifyData);
            if (notifyData.error) {
              console.error("[EditarReuniao] notifyMeeting error:", notifyData.error);
              toast.warning("Reunião salva, mas houve erro ao enviar notificações: " + notifyData.error);
            } else {
              const enviados = notifyData.results?.filter((r: any) => r.status === "enviado").length || 0;
              const erros = notifyData.results?.filter((r: any) => r.status === "erro") || [];
              if (enviados > 0) {
                toast.success(`${enviados} convite(s) enviado(s) aos novos participantes!`);
              }
              if (erros.length > 0) {
                console.error("[EditarReuniao] Notification errors:", erros);
                toast.warning(`${erros.length} convite(s) com erro de envio`);
              }
            }
          }
        } catch (notifErr) {
          console.error("[EditarReuniao] Notification error:", notifErr);
          toast.warning("Reunião salva, mas houve erro ao enviar notificações");
        }
      }

      toast.success("Reunião atualizada!");
      onOpenChange(false);
      onUpdated();
    } catch (e: any) {
      console.error("[EditarReuniao] Save error:", e);
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
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="font-medium truncate">{c.nome || "Sem nome"}</span>
                      {c.email && <span className="text-muted-foreground truncate">• {c.email}</span>}
                      {c.telefone && <span className="text-muted-foreground truncate">• {c.telefone}</span>}
                      {c.email && !originalEmails.has(c.email) && <Badge variant="outline" className="text-[10px] border-primary text-primary">Novo</Badge>}
                      {c.email && getRsvpBadge(c.email)}
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeConvidado(i)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notification for new participants */}
          {newConvidados.length > 0 && (
            <div className="space-y-2 p-3 border rounded-lg bg-muted/20">
              <Label className="text-sm font-semibold">Enviar convite para {newConvidados.length} novo(s) participante(s):</Label>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={enviarEmailNovos} onCheckedChange={(v) => setEnviarEmailNovos(!!v)} />
                  <Mail className="h-4 w-4 text-muted-foreground" /> Email
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={enviarWhatsAppNovos} onCheckedChange={(v) => setEnviarWhatsAppNovos(!!v)} />
                  <MessageSquare className="h-4 w-4 text-muted-foreground" /> WhatsApp
                </label>
              </div>
            </div>
          )}

          {/* RSVP Summary */}
          {rsvpStatuses.length > 0 && (
            <div className="p-3 border rounded-lg bg-muted/20">
              <Label className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                <CheckCircle2 className="h-4 w-4" /> Respostas (RSVP)
              </Label>
              <div className="flex gap-4 text-sm">
                <span className="text-green-600 font-medium">✓ {rsvpStatuses.filter(r => r.resposta === 'sim').length} confirmado(s)</span>
                <span className="text-amber-600 font-medium">🤔 {rsvpStatuses.filter(r => r.resposta === 'talvez').length} talvez</span>
                <span className="text-red-600 font-medium">✕ {rsvpStatuses.filter(r => r.resposta === 'nao').length} recusou</span>
                <span className="text-muted-foreground">{rsvpStatuses.filter(r => !r.resposta).length} pendente(s)</span>
              </div>
            </div>
          )}

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
