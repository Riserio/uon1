import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { CalendarClock, Plus, Send, Trash2, Pencil, Power } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatPhone } from '@/lib/validators';

interface Props { corretoraId: string }

type Frequency = 'daily' | 'weekly' | 'monthly';
type DataSource = 'resumo_eventos' | 'resumo_cobranca' | 'resumo_mgf';

interface Schedule {
  id?: string;
  corretora_id: string;
  name: string;
  template_name: string;
  template_language: string;
  data_source: DataSource;
  recipients: string[];
  frequency: Frequency;
  day_of_week: number | null;
  day_of_month: number | null;
  send_time: string;
  ativo: boolean;
  next_run_at?: string | null;
  last_run_at?: string | null;
  last_status?: string | null;
  last_error?: string | null;
}

const SOURCE_LABEL: Record<DataSource, string> = {
  resumo_eventos: 'Resumo de Eventos (BI Eventos)',
  resumo_cobranca: 'Resumo de Cobrança (BI Cobrança)',
  resumo_mgf: 'Resumo de MGF (BI Atendimentos)',
};

const SOURCE_PATTERN: Record<DataSource, RegExp> = {
  resumo_eventos: /event|sga|sinistr/i,
  resumo_cobranca: /cobranca|cobranç|billing|inadimp/i,
  resumo_mgf: /mgf|atendiment|servic/i,
};

const WEEKDAYS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

const emptySchedule = (corretora_id: string): Schedule => ({
  corretora_id,
  name: '',
  template_name: '',
  template_language: 'pt_BR',
  data_source: 'resumo_eventos',
  recipients: [''],
  frequency: 'daily',
  day_of_week: 1,
  day_of_month: 1,
  send_time: '08:00',
  ativo: true,
});

export function WhatsAppTemplateSchedules({ corretoraId }: Props) {
  const [items, setItems] = useState<Schedule[]>([]);
  const [templates, setTemplates] = useState<{ name: string; language: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (corretoraId) load();
    loadTemplates();
  }, [corretoraId]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('whatsapp_template_schedules')
      .select('*')
      .eq('corretora_id', corretoraId)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) { toast.error('Erro ao carregar agendamentos'); return; }
    setItems((data || []) as any);
  };

  const loadTemplates = async () => {
    try {
      const { data } = await supabase.functions.invoke('listar-templates-whatsapp');
      const list = (data?.templates || []).filter((t: any) => t.status === 'APPROVED');
      setTemplates(list.map((t: any) => ({ name: t.name, language: t.language })));
    } catch { /* ignore */ }
  };

  const findTemplateForSource = (source: DataSource) => {
    return templates.find(t => SOURCE_PATTERN[source].test(t.name));
  };

  const openNew = () => { setEditing(emptySchedule(corretoraId)); setOpenDialog(true); };
  const openEdit = (s: Schedule) => {
    setEditing({ ...s, recipients: s.recipients?.length ? s.recipients : [''] });
    setOpenDialog(true);
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) return toast.error('Dê um nome ao agendamento');
    if (!editing.template_name) return toast.error('Selecione um template');
    const recipients = editing.recipients.map(r => r.trim()).filter(Boolean);
    if (recipients.length === 0) return toast.error('Informe pelo menos um destinatário');

    setSaving(true);
    const payload: any = {
      corretora_id: corretoraId,
      name: editing.name,
      template_name: editing.template_name,
      template_language: editing.template_language || 'pt_BR',
      data_source: editing.data_source,
      recipients,
      frequency: editing.frequency,
      day_of_week: editing.frequency === 'weekly' ? editing.day_of_week : null,
      day_of_month: editing.frequency === 'monthly' ? editing.day_of_month : null,
      send_time: editing.send_time,
      ativo: editing.ativo,
      next_run_at: null, // recompute via runner
    };
    let res;
    if (editing.id) {
      res = await supabase.from('whatsapp_template_schedules').update(payload).eq('id', editing.id);
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      res = await supabase.from('whatsapp_template_schedules').insert({ ...payload, created_by: user?.id });
    }
    setSaving(false);
    if (res.error) { toast.error('Erro ao salvar: ' + res.error.message); return; }
    toast.success('Agendamento salvo');
    setOpenDialog(false);
    setEditing(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir este agendamento?')) return;
    const { error } = await supabase.from('whatsapp_template_schedules').delete().eq('id', id);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success('Excluído'); load(); }
  };

  const toggleAtivo = async (s: Schedule) => {
    const { error } = await supabase.from('whatsapp_template_schedules')
      .update({ ativo: !s.ativo, next_run_at: null }).eq('id', s.id!);
    if (error) toast.error('Erro: ' + error.message);
    else load();
  };

  const runNow = async (id: string) => {
    toast.loading('Enviando agora...', { id: 'runnow' });
    const { error } = await supabase.functions.invoke('whatsapp-template-schedule-runner', {
      body: { schedule_id: id },
    });
    toast.dismiss('runnow');
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success('Disparado'); load(); }
  };

  const updRecipient = (i: number, v: string) => {
    if (!editing) return;
    const r = [...editing.recipients]; r[i] = formatPhone(v);
    setEditing({ ...editing, recipients: r });
  };
  const addRecipient = () => editing && setEditing({ ...editing, recipients: [...editing.recipients, ''] });
  const rmRecipient = (i: number) => editing && setEditing({
    ...editing,
    recipients: editing.recipients.length > 1 ? editing.recipients.filter((_, idx) => idx !== i) : editing.recipients,
  });

  const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
  const freqLabel = (s: Schedule) => {
    if (s.frequency === 'daily') return `Diário às ${s.send_time}`;
    if (s.frequency === 'weekly') return `Semanal (${WEEKDAYS[s.day_of_week ?? 1]}) às ${s.send_time}`;
    return `Mensal (dia ${s.day_of_month ?? 1}) às ${s.send_time}`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-green-600" />
              Envios Automáticos por Template
            </CardTitle>
            <CardDescription>
              Agende envios diários, semanais ou mensais usando templates Meta aprovados — sem precisar da janela de 24h. As variáveis são preenchidas automaticamente com os dados do BI da associação.
            </CardDescription>
          </div>
          <Button onClick={openNew} disabled={!corretoraId}><Plus className="h-4 w-4 mr-1" />Novo agendamento</Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum agendamento criado para esta associação.</p>
        ) : (
          <div className="space-y-3">
            {items.map((s) => (
              <div key={s.id} className="rounded-lg border p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{s.name}</span>
                    <Badge variant={s.ativo ? 'default' : 'secondary'}>{s.ativo ? 'Ativo' : 'Pausado'}</Badge>
                    <Badge variant="outline">{s.template_name}</Badge>
                    <Badge variant="outline">{SOURCE_LABEL[s.data_source]}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {freqLabel(s)} · Destinatários: {s.recipients?.length || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Próximo: {fmtDate(s.next_run_at)} · Último: {fmtDate(s.last_run_at)}{s.last_error ? ` · Erro: ${s.last_error}` : ''}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => runNow(s.id!)} title="Enviar agora"><Send className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleAtivo(s)} title={s.ativo ? 'Pausar' : 'Ativar'}><Power className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(s)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(s.id!)} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar agendamento' : 'Novo agendamento'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ex: Resumo diário gestor" />
              </div>

              <div>
                <Label>Origem dos dados</Label>
                <Select
                  value={editing.data_source}
                  onValueChange={(v) => {
                    const ds = v as DataSource;
                    const match = findTemplateForSource(ds);
                    setEditing({
                      ...editing,
                      data_source: ds,
                      ...(match ? { template_name: match.name, template_language: match.language } : {}),
                    });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SOURCE_LABEL) as DataSource[]).map(k => (
                      <SelectItem key={k} value={k}>{SOURCE_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  O template aprovado é selecionado automaticamente pela origem. Você pode trocar abaixo se quiser.
                </p>
              </div>

              <div>
                <Label>Template aprovado (Meta)</Label>
                <Select
                  value={editing.template_name}
                  onValueChange={(v) => {
                    const tpl = templates.find(t => t.name === v);
                    setEditing({ ...editing, template_name: v, template_language: tpl?.language || 'pt_BR' });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={templates.length === 0 ? 'Nenhum template aprovado disponível' : 'Selecionar template...'} />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(t => <SelectItem key={t.name} value={t.name}>{t.name} ({t.language})</SelectItem>)}
                  </SelectContent>
                </Select>
                {templates.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Cadastre e aprove templates na aba Templates (Meta WhatsApp Business).
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Frequência</Label>
                  <Select value={editing.frequency} onValueChange={(v) => setEditing({ ...editing, frequency: v as Frequency })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Diário</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="monthly">Mensal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Horário (Brasília)</Label>
                  <Input type="time" value={editing.send_time} onChange={(e) => setEditing({ ...editing, send_time: e.target.value })} />
                </div>
              </div>

              {editing.frequency === 'weekly' && (
                <div>
                  <Label>Dia da semana</Label>
                  <Select value={String(editing.day_of_week ?? 1)} onValueChange={(v) => setEditing({ ...editing, day_of_week: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {editing.frequency === 'monthly' && (
                <div>
                  <Label>Dia do mês (1–31)</Label>
                  <Input type="number" min={1} max={31} value={editing.day_of_month ?? 1}
                    onChange={(e) => setEditing({ ...editing, day_of_month: Math.max(1, Math.min(31, Number(e.target.value) || 1)) })} />
                  <p className="text-xs text-muted-foreground mt-1">Se o mês não tiver esse dia, será usado o último dia do mês.</p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Destinatários (WhatsApp)</Label>
                  <Button size="sm" variant="outline" onClick={addRecipient}><Plus className="h-3.5 w-3.5 mr-1" />Adicionar</Button>
                </div>
                <div className="space-y-2">
                  {editing.recipients.map((r, i) => (
                    <div key={i} className="flex gap-2">
                      <Input placeholder="(XX) XXXXX-XXXX" value={r} onChange={(e) => updRecipient(i, e.target.value)} maxLength={16} />
                      {editing.recipients.length > 1 && (
                        <Button size="icon" variant="ghost" onClick={() => rmRecipient(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={editing.ativo} onCheckedChange={(v) => setEditing({ ...editing, ativo: v })} />
                <Label>Ativo</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenDialog(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}