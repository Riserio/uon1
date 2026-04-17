import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Search, Send, Check, CheckCheck, Clock, XCircle, Bot,
  UserCheck, MessageCircle, Phone, MoreVertical, RefreshCw, Plus, Archive, ArchiveRestore,
  MicOff, Mic, File, Timer
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { formatPhone } from '@/lib/validators';
import { useAppConfig } from '@/hooks/useAppConfig';

interface Contact {
  id: string;
  phone: string;
  name: string | null;
  profile_name: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  human_mode: boolean;
  archived: boolean;
  audio_blocked: boolean;
  tags: string[];
}

interface Message {
  id: string;
  contact_id: string;
  direction: 'in' | 'out';
  body: string | null;
  type: string;
  status: string | null;
  meta_message_id: string | null;
  media_url: string | null;
  media_mime_type: string | null;
  created_at: string;
  sent_by: string | null;
}

export default function CentralAtendimento({ embedded }: { embedded?: boolean }) {
  const { user } = useAuth();
  const { config } = useAppConfig();
  const headerLogo = config.header_logo_url || "/images/logo-vg.png";
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [showNewContact, setShowNewContact] = useState(false);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [creatingContact, setCreatingContact] = useState(false);
  const [contatosList, setContatosList] = useState<{ id: string; nome: string; whatsapp: string | null; telefone: string | null }[]>([]);
  const [contatosSearch, setContatosSearch] = useState('');
  const [startingConversation, setStartingConversation] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [, setTick] = useState(0);

  const loadContacts = useCallback(async () => {
    const { data } = await supabase
      .from('whatsapp_contacts')
      .select('*')
      .not('last_message_at', 'is', null)
      .order('last_message_at', { ascending: false, nullsFirst: false });
    if (data) setContacts(data as Contact[]);
  }, []);

  useEffect(() => {
    loadContacts();
    const contactChannel = supabase
      .channel('wa-contacts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_contacts' }, () => loadContacts())
      .subscribe();
    return () => { supabase.removeChannel(contactChannel); };
  }, [loadContacts]);

  const loadMessages = useCallback(async (contactId: string) => {
    setLoadingMessages(true);
    const { data } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (data) setMessages(data as Message[]);
    setLoadingMessages(false);
  }, []);

  useEffect(() => {
    if (!selectedContact) return;
    loadMessages(selectedContact.id);

    if (selectedContact.unread_count > 0) {
      setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, unread_count: 0 } : c));
      setSelectedContact(prev => prev ? { ...prev, unread_count: 0 } : prev);
      supabase.from('whatsapp_contacts').update({ unread_count: 0 }).eq('id', selectedContact.id).then(({ error }) => {
        if (error) loadContacts();
      });
    }

    const msgChannel = supabase
      .channel(`wa-messages-${selectedContact.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `contact_id=eq.${selectedContact.id}` }, (payload) => {
        const newMsg = payload.new as Message;
        setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_messages', filter: `contact_id=eq.${selectedContact.id}` }, (payload) => {
        const updated = payload.new as Message;
        setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
      })
      .subscribe();

    return () => { supabase.removeChannel(msgChannel); };
  }, [selectedContact, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectContact = (contact: Contact) => setSelectedContact(contact);

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedContact || sending) return;
    const text = messageText.trim();
    setMessageText('');
    setSending(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/whatsapp-send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ contact_id: selectedContact.id, message: text }),
      });
      const result = await response.json();
      if (!response.ok) toast.error(result.error || 'Erro ao enviar');
    } catch { toast.error('Erro ao enviar mensagem'); }
    finally { setSending(false); }
  };

  const toggleHumanMode = async (contact: Contact) => {
    const newMode = !contact.human_mode;
    await supabase.from('whatsapp_contacts').update({ human_mode: newMode, human_mode_by: newMode ? user?.id : null, human_mode_at: newMode ? new Date().toISOString() : null }).eq('id', contact.id);
    toast.success(newMode ? 'Modo humano ativado' : 'Automação reativada');
    loadContacts();
    if (selectedContact?.id === contact.id) setSelectedContact({ ...contact, human_mode: newMode });
  };

  const handleCreateContact = async () => {
    if (!newContactPhone.trim()) { toast.error('Informe o número'); return; }
    setCreatingContact(true);
    try {
      const cleanPhone = newContactPhone.replace(/\D/g, '');
      const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      const phoneWithoutCountry = formattedPhone.startsWith('55') ? formattedPhone.slice(2) : formattedPhone;
      const nameValue = newContactName.trim() || null;

      const { data: existing } = await supabase.from('whatsapp_contacts').select('id, name').eq('phone', formattedPhone).maybeSingle();
      if (existing) {
        if (nameValue) { await supabase.from('whatsapp_contacts').update({ name: nameValue, profile_name: nameValue }).eq('id', existing.id); toast.success('Contato atualizado'); }
        else toast.info('Contato já cadastrado');
      } else {
        const { error } = await supabase.from('whatsapp_contacts').insert({ phone: formattedPhone, name: nameValue, profile_name: nameValue });
        if (error) throw error;
        toast.success('Contato criado');
      }

      const { data: existingContato } = await supabase.from('contatos').select('id').or(`whatsapp.eq.${formattedPhone},whatsapp.eq.${phoneWithoutCountry}`).maybeSingle();
      if (existingContato) {
        if (nameValue) await supabase.from('contatos').update({ nome: nameValue, whatsapp: phoneWithoutCountry, telefone: phoneWithoutCountry }).eq('id', existingContato.id);
      } else if (nameValue) {
        await supabase.from('contatos').insert({ nome: nameValue, whatsapp: phoneWithoutCountry, telefone: phoneWithoutCountry, created_by: user?.id });
      }

      setNewContactName('');
      setNewContactPhone('');
      setShowNewContact(false);
      loadContacts();
    } catch { toast.error('Erro ao criar contato'); }
    finally { setCreatingContact(false); }
  };

  const filteredContacts = contacts.filter(c => {
    if (showArchived !== (c.archived || false)) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return c.name?.toLowerCase().includes(q) || c.profile_name?.toLowerCase().includes(q) || c.phone.includes(q);
  });

  const archiveContact = async (contact: Contact) => {
    const newArchived = !contact.archived;
    await supabase.from('whatsapp_contacts').update({ archived: newArchived } as any).eq('id', contact.id);
    toast.success(newArchived ? 'Arquivada' : 'Desarquivada');
    if (selectedContact?.id === contact.id) setSelectedContact(null);
    loadContacts();
  };

  const toggleAudioBlocked = async (contact: Contact) => {
    const newBlocked = !contact.audio_blocked;
    await supabase.from('whatsapp_contacts').update({ audio_blocked: newBlocked } as any).eq('id', contact.id);
    toast.success(newBlocked ? 'Áudio bloqueado' : 'Áudio permitido');
    if (selectedContact?.id === contact.id) setSelectedContact({ ...contact, audio_blocked: newBlocked });
    loadContacts();
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case 'sent': return <Check className="h-3 w-3 text-muted-foreground" />;
      case 'delivered': return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
      case 'read': return <CheckCheck className="h-3 w-3 text-blue-500" />;
      case 'failed': return <XCircle className="h-3 w-3 text-destructive" />;
      case 'pending': return <Clock className="h-3 w-3 text-muted-foreground" />;
      default: return null;
    }
  };

  const loadContatosList = async () => {
    const { data } = await supabase.from('contatos').select('id, nome, whatsapp, telefone').order('nome');
    setContatosList(data || []);
  };

  const filteredContatosList = contatosList.filter(c => {
    if (!contatosSearch) return true;
    const q = contatosSearch.toLowerCase();
    return c.nome.toLowerCase().includes(q) || c.whatsapp?.includes(q) || c.telefone?.includes(q);
  });

  const handleStartConversation = async (contato: { nome: string; whatsapp: string | null; telefone: string | null }) => {
    const phone = contato.whatsapp || contato.telefone;
    if (!phone) { toast.error('Sem número'); return; }
    setStartingConversation(true);
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      const { data: existing } = await supabase.from('whatsapp_contacts').select('*').eq('phone', formattedPhone).maybeSingle();
      if (existing) { setSelectedContact(existing as Contact); }
      else {
        const { data: newContact, error } = await supabase.from('whatsapp_contacts').insert({ phone: formattedPhone, name: contato.nome, profile_name: contato.nome }).select().single();
        if (error) throw error;
        setSelectedContact(newContact as Contact);
        loadContacts();
      }
      setShowNewConversation(false);
      setContatosSearch('');
    } catch { toast.error('Erro ao iniciar conversa'); }
    finally { setStartingConversation(false); }
  };

  const getContactDisplayName = (c: Contact) => c.name || c.profile_name || c.phone;
  const getInitials = (c: Contact) => (c.name || c.profile_name || c.phone).substring(0, 2).toUpperCase();

  const get24hWindowInfo = (contact: Contact) => {
    if (!contact.last_message_at) return null;
    const lastIncoming = [...messages].reverse().find(m => m.direction === 'in');
    if (!lastIncoming) return null;
    const lastInTime = new Date(lastIncoming.created_at).getTime();
    const remaining = lastInTime + 24 * 60 * 60 * 1000 - Date.now();
    if (remaining <= 0) return { expired: true, text: 'Expirada', hours: 0, minutes: 0 };
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    return { expired: false, text: `${hours}h ${minutes}m`, hours, minutes };
  };

  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const totalUnread = contacts.filter(c => !c.archived).reduce((s, c) => s + c.unread_count, 0);

  return (
    <div className="flex h-[calc(100vh-2rem)] m-3 sm:m-4 rounded-2xl border border-border/50 bg-card overflow-hidden shadow-lg">
      {/* LEFT: Contact list */}
      <div className={cn(
        "w-full sm:w-80 border-r border-border/50 flex flex-col bg-card",
        selectedContact && "hidden sm:flex"
      )}>
        {/* Header */}
        <div className="p-3 border-b border-border/50 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-xl bg-primary/10">
                <MessageCircle className="h-4 w-4 text-primary" />
              </div>
              <h2 className="font-semibold text-sm truncate">Central WhatsApp</h2>
              {totalUnread > 0 && (
                <Badge className="bg-emerald-500 text-white h-5 min-w-5 text-[10px] rounded-full px-1.5">{totalUnread}</Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <img src={headerLogo} alt="Logo" className="h-6 w-auto opacity-80 object-contain mr-1" />
              <Dialog open={showNewConversation} onOpenChange={(open) => { setShowNewConversation(open); if (open) loadContatosList(); }}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" title="Nova Conversa">
                    <MessageCircle className="h-3.5 w-3.5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>Nova Conversa</DialogTitle></DialogHeader>
                  <div className="space-y-3 py-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Buscar contato..." value={contatosSearch} onChange={(e) => setContatosSearch(e.target.value)} className="pl-9" />
                    </div>
                    <ScrollArea className="h-64">
                      {filteredContatosList.length === 0 ? (
                        <p className="text-center text-sm text-muted-foreground py-4">Nenhum contato</p>
                      ) : (
                        filteredContatosList.map((contato) => (
                          <div key={contato.id} onClick={() => !startingConversation && handleStartConversation(contato)}
                            className="flex items-center gap-3 p-2.5 rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
                            <Avatar className="h-8 w-8 shrink-0">
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">{contato.nome.substring(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{contato.nome}</p>
                              <p className="text-xs text-muted-foreground">{formatPhone(contato.whatsapp || contato.telefone || '')}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </ScrollArea>
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog open={showNewContact} onOpenChange={setShowNewContact}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" title="Novo Contato"><Plus className="h-3.5 w-3.5" /></Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Novo Contato</DialogTitle></DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-2"><Label>Nome</Label><Input placeholder="Nome" value={newContactName} onChange={(e) => setNewContactName(e.target.value)} /></div>
                    <div className="space-y-2"><Label>WhatsApp</Label><Input placeholder="(00) 00000-0000" value={newContactPhone} onChange={(e) => setNewContactPhone(formatPhone(e.target.value))} maxLength={16} /></div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowNewContact(false)}>Cancelar</Button>
                    <Button onClick={handleCreateContact} disabled={creatingContact}>{creatingContact ? 'Criando...' : 'Criar'}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={loadContacts}><RefreshCw className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9 rounded-xl text-sm" />
          </div>
          <Button
            variant={showArchived ? 'secondary' : 'ghost'}
            size="sm"
            className="w-full justify-start text-xs gap-2 rounded-lg h-8"
            onClick={() => setShowArchived(!showArchived)}
          >
            <Archive className="h-3 w-3" />
            {showArchived ? 'Ver ativas' : 'Ver arquivadas'}
          </Button>
        </div>

        {/* Contact list */}
        <ScrollArea className="flex-1">
          {filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <Phone className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p>Nenhum contato</p>
            </div>
          ) : (
            filteredContacts.map((contact) => {
              const hasUnread = contact.unread_count > 0;
              return (
                <div
                  key={contact.id}
                  onClick={() => handleSelectContact(contact)}
                  className={cn(
                    'flex items-center gap-3 p-3 cursor-pointer transition-colors border-b border-border/30',
                    selectedContact?.id === contact.id && 'bg-primary/10',
                    hasUnread && selectedContact?.id !== contact.id && 'bg-primary/5 border-l-2 border-l-primary',
                    !hasUnread && selectedContact?.id !== contact.id && 'hover:bg-muted/50'
                  )}
                >
                  <div className="relative">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className={cn("text-xs", hasUnread ? "bg-primary/20 text-primary font-bold" : "bg-primary/10 text-primary")}>
                        {getInitials(contact)}
                      </AvatarFallback>
                    </Avatar>
                    {hasUnread && <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-card" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={cn("text-sm truncate", hasUnread ? "font-bold" : "font-medium")}>{getContactDisplayName(contact)}</span>
                      {contact.last_message_at && (
                        <span className={cn("text-[10px] whitespace-nowrap ml-2", hasUnread ? "text-primary font-semibold" : "text-muted-foreground")}>
                          {format(new Date(contact.last_message_at), 'HH:mm', { locale: ptBR })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className={cn("text-xs truncate", hasUnread ? "text-foreground/70 font-medium" : "text-muted-foreground")}>
                        {contact.last_message_preview || contact.phone}
                      </span>
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        {contact.human_mode && <UserCheck className="h-3 w-3 text-amber-500" />}
                        {hasUnread && (
                          <Badge className="bg-emerald-500 text-white h-5 min-w-5 flex items-center justify-center text-[10px] rounded-full px-1.5 font-bold shadow-sm">
                            {contact.unread_count}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </ScrollArea>
      </div>

      {/* RIGHT: Conversation */}
      <div className={cn("flex-1 flex flex-col", !selectedContact && "hidden sm:flex")}>
        {!selectedContact ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <div className="p-4 rounded-2xl bg-muted/50 w-fit mx-auto mb-4">
                <MessageCircle className="h-12 w-12 text-muted-foreground/30" />
              </div>
              <p className="text-lg font-semibold">Central de Atendimento</p>
              <p className="text-sm mt-1">Selecione um contato para conversar</p>
            </div>
          </div>
        ) : (
          <>
            {/* Conversation header */}
            <div className="p-3 border-b border-border/50 flex items-center justify-between bg-card/80 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="sm:hidden h-8 w-8 rounded-lg" onClick={() => setSelectedContact(null)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </Button>
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">{getInitials(selectedContact)}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{getContactDisplayName(selectedContact)}</p>
                    {selectedContact.human_mode && (
                      <Badge variant="outline" className="text-[10px] py-0 h-4 border-amber-400 text-amber-600">
                        <UserCheck className="h-2.5 w-2.5 mr-0.5" /> Humano
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Phone className="h-3 w-3" /> {selectedContact.phone}
                    {(() => {
                      const windowInfo = get24hWindowInfo(selectedContact);
                      if (!windowInfo) return null;
                      return (
                        <Badge variant="outline" className={cn("text-[10px] py-0 h-4 gap-0.5",
                          windowInfo.expired ? "border-destructive/50 text-destructive" : windowInfo.hours < 2 ? "border-amber-400 text-amber-600" : "border-emerald-400 text-emerald-600"
                        )}>
                          <Timer className="h-2.5 w-2.5" />{windowInfo.text}
                        </Badge>
                      );
                    })()}
                  </p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => toggleHumanMode(selectedContact)}>
                    {selectedContact.human_mode ? <><Bot className="h-4 w-4 mr-2" /> Reativar automação</> : <><UserCheck className="h-4 w-4 mr-2" /> Modo humano</>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => archiveContact(selectedContact)}>
                    {selectedContact.archived ? <><ArchiveRestore className="h-4 w-4 mr-2" /> Desarquivar</> : <><Archive className="h-4 w-4 mr-2" /> Arquivar</>}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => toggleAudioBlocked(selectedContact)}>
                    {selectedContact.audio_blocked ? <><Mic className="h-4 w-4 mr-2" /> Permitir áudio</> : <><MicOff className="h-4 w-4 mr-2" /> Bloquear áudio</>}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Messages */}
            <ScrollArea ref={scrollAreaRef} className="flex-1 p-4 bg-muted/10">
              <div className="space-y-2 max-w-3xl mx-auto">
                {loadingMessages ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma mensagem</div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className={cn('flex', msg.direction === 'out' ? 'justify-end' : 'justify-start')}>
                      <div className={cn(
                        'max-w-[75%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm',
                        msg.direction === 'out' ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-card border border-border/50 rounded-bl-md'
                      )}>
                        {msg.type !== 'text' && msg.type !== 'template' && <Badge variant="secondary" className="text-[10px] mb-1">{msg.type}</Badge>}
                        {msg.type === 'image' && msg.media_url && (
                          <img src={msg.media_url} alt="Imagem" className="max-w-full rounded-lg mb-1 cursor-pointer" onClick={() => window.open(msg.media_url!, '_blank')} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        )}
                        {msg.type === 'video' && msg.media_url && (
                          <video src={msg.media_url} controls className="max-w-full rounded-lg mb-1" onError={(e) => { (e.target as HTMLVideoElement).style.display = 'none'; }} />
                        )}
                        {msg.type === 'audio' && msg.media_url && (
                          <audio src={msg.media_url} controls className="w-full mb-1" onError={(e) => { (e.target as HTMLAudioElement).style.display = 'none'; }} />
                        )}
                        {msg.type === 'sticker' && msg.media_url && (
                          <img src={msg.media_url} alt="Sticker" className="max-w-[150px] mb-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        )}
                        {msg.type === 'document' && msg.media_url && (
                          <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs underline mb-1"><File className="h-4 w-4" /> Abrir</a>
                        )}
                        {msg.body && msg.body !== `[${msg.type}]` && <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>}
                        {(!msg.body || msg.body === `[${msg.type}]`) && !msg.media_url && <p className="text-sm whitespace-pre-wrap break-words">{msg.body || ''}</p>}
                        <div className={cn('flex items-center justify-end gap-1 mt-1', msg.direction === 'out' ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
                          <span className="text-[10px]">{format(new Date(msg.created_at), 'HH:mm')}</span>
                          {msg.direction === 'out' && getStatusIcon(msg.status)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="p-3 border-t border-border/50 bg-card">
              <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex items-center gap-2 max-w-3xl mx-auto">
                <Input value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Digite uma mensagem..." className="flex-1 rounded-xl" disabled={sending} />
                <Button type="submit" size="icon" className="rounded-xl shrink-0" disabled={!messageText.trim() || sending}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
