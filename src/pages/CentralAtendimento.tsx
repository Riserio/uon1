import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Search, Send, Check, CheckCheck, Clock, XCircle, User, Bot,
  UserCheck, MessageCircle, Phone, MoreVertical, RefreshCw, Plus, Archive, ArchiveRestore,
  MicOff, Mic, Image, FileAudio, FileVideo, File, Timer
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

  // Load contacts (only those with messages)
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

    // Realtime contacts
    const contactChannel = supabase
      .channel('wa-contacts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_contacts' }, () => {
        loadContacts();
      })
      .subscribe();

    return () => { supabase.removeChannel(contactChannel); };
  }, [loadContacts]);

  // Load messages when contact selected
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

    // Mark as read — optimistic local update FIRST, then persist
    if (selectedContact.unread_count > 0) {
      // Optimistic: zero locally immediately
      setContacts(prev => prev.map(c => 
        c.id === selectedContact.id ? { ...c, unread_count: 0 } : c
      ));
      setSelectedContact(prev => prev ? { ...prev, unread_count: 0 } : prev);
      
      // Persist to backend
      supabase
        .from('whatsapp_contacts')
        .update({ unread_count: 0 })
        .eq('id', selectedContact.id)
        .then(({ error }) => {
          if (error) {
            console.error('Failed to zero unread_count:', error);
            // Rollback on error
            loadContacts();
          }
        });
    }

    // Realtime messages — incremental updates to avoid flickering
    const msgChannel = supabase
      .channel(`wa-messages-${selectedContact.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'whatsapp_messages',
        filter: `contact_id=eq.${selectedContact.id}`,
      }, (payload) => {
        const newMsg = payload.new as Message;
        setMessages(prev => {
          // Avoid duplicates
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'whatsapp_messages',
        filter: `contact_id=eq.${selectedContact.id}`,
      }, (payload) => {
        const updated = payload.new as Message;
        setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
      })
      .subscribe();

    return () => { supabase.removeChannel(msgChannel); };
  }, [selectedContact, loadMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedContact || sending) return;
    const text = messageText.trim();
    setMessageText('');
    setSending(true);

    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/whatsapp-send-message`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ contact_id: selectedContact.id, message: text }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error || 'Erro ao enviar mensagem');
      }
    } catch (err) {
      toast.error('Erro ao enviar mensagem');
    } finally {
      setSending(false);
    }
  };

  const toggleHumanMode = async (contact: Contact) => {
    const newMode = !contact.human_mode;
    await supabase
      .from('whatsapp_contacts')
      .update({
        human_mode: newMode,
        human_mode_by: newMode ? user?.id : null,
        human_mode_at: newMode ? new Date().toISOString() : null,
      })
      .eq('id', contact.id);
    toast.success(newMode ? 'Modo humano ativado' : 'Automação reativada');
    loadContacts();
    if (selectedContact?.id === contact.id) {
      setSelectedContact({ ...contact, human_mode: newMode });
    }
  };

  // Create new contact (upsert: update name if phone exists)
  const handleCreateContact = async () => {
    if (!newContactPhone.trim()) {
      toast.error('Informe o número do WhatsApp');
      return;
    }
    setCreatingContact(true);
    try {
      const cleanPhone = newContactPhone.replace(/\D/g, '');
      const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      // Phone without country code for contatos table (DDD + number)
      const phoneWithoutCountry = formattedPhone.startsWith('55') ? formattedPhone.slice(2) : formattedPhone;
      const nameValue = newContactName.trim() || null;

      // Check if contact already exists in whatsapp_contacts
      const { data: existing } = await supabase
        .from('whatsapp_contacts')
        .select('id, name')
        .eq('phone', formattedPhone)
        .maybeSingle();

      if (existing) {
        // Update name if provided
        if (nameValue) {
          await supabase
            .from('whatsapp_contacts')
            .update({ name: nameValue, profile_name: nameValue })
            .eq('id', existing.id);
          toast.success('Contato atualizado com sucesso');
        } else {
          toast.info('Contato já cadastrado com este número');
        }
      } else {
        // Create new whatsapp contact
        const { error } = await supabase
          .from('whatsapp_contacts')
          .insert({
            phone: formattedPhone,
            name: nameValue,
            profile_name: nameValue,
          });
        if (error) throw error;
        toast.success('Contato criado com sucesso');
      }

      // Sync to contatos table with proper phone formatting
      const { data: existingContato } = await supabase
        .from('contatos')
        .select('id')
        .or(`whatsapp.eq.${formattedPhone},whatsapp.eq.${phoneWithoutCountry}`)
        .maybeSingle();

      if (existingContato) {
        // Update name if provided
        if (nameValue) {
          await supabase.from('contatos')
            .update({ nome: nameValue, whatsapp: phoneWithoutCountry, telefone: phoneWithoutCountry })
            .eq('id', existingContato.id);
        }
      } else if (nameValue) {
        await supabase.from('contatos').insert({
          nome: nameValue,
          whatsapp: phoneWithoutCountry,
          telefone: phoneWithoutCountry,
          created_by: user?.id,
        });
      }

      setNewContactName('');
      setNewContactPhone('');
      setShowNewContact(false);
      loadContacts();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao criar contato');
    } finally {
      setCreatingContact(false);
    }
  };

  const filteredContacts = contacts.filter(c => {
    // Filter by archived status
    if (showArchived !== (c.archived || false)) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (c.name?.toLowerCase().includes(q)) ||
      (c.profile_name?.toLowerCase().includes(q)) ||
      c.phone.includes(q);
  });

  const archiveContact = async (contact: Contact) => {
    const newArchived = !contact.archived;
    await supabase
      .from('whatsapp_contacts')
      .update({ archived: newArchived } as any)
      .eq('id', contact.id);
    toast.success(newArchived ? 'Conversa arquivada' : 'Conversa desarquivada');
    if (selectedContact?.id === contact.id) {
      setSelectedContact(null);
    }
    loadContacts();
  };

  const toggleAudioBlocked = async (contact: Contact) => {
    const newBlocked = !contact.audio_blocked;
    await supabase
      .from('whatsapp_contacts')
      .update({ audio_blocked: newBlocked } as any)
      .eq('id', contact.id);
    toast.success(newBlocked ? 'Áudio bloqueado para este contato' : 'Áudio permitido para este contato');
    if (selectedContact?.id === contact.id) {
      setSelectedContact({ ...contact, audio_blocked: newBlocked });
    }
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

  // Load contatos for "Nova Conversa"
  const loadContatosList = async () => {
    const { data } = await supabase
      .from('contatos')
      .select('id, nome, whatsapp, telefone')
      .order('nome');
    setContatosList(data || []);
  };

  const filteredContatosList = contatosList.filter(c => {
    if (!contatosSearch) return true;
    const q = contatosSearch.toLowerCase();
    return c.nome.toLowerCase().includes(q) || c.whatsapp?.includes(q) || c.telefone?.includes(q);
  });

  const handleStartConversation = async (contato: { nome: string; whatsapp: string | null; telefone: string | null }) => {
    const phone = contato.whatsapp || contato.telefone;
    if (!phone) {
      toast.error('Contato sem número de telefone/WhatsApp');
      return;
    }
    setStartingConversation(true);
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

      // Check if whatsapp_contact already exists
      const { data: existing } = await supabase
        .from('whatsapp_contacts')
        .select('*')
        .eq('phone', formattedPhone)
        .maybeSingle();

      if (existing) {
        // Select existing contact
        setSelectedContact(existing as Contact);
      } else {
        // Create whatsapp contact
        const { data: newContact, error } = await supabase
          .from('whatsapp_contacts')
          .insert({
            phone: formattedPhone,
            name: contato.nome,
            profile_name: contato.nome,
          })
          .select()
          .single();
        if (error) throw error;
        setSelectedContact(newContact as Contact);
        loadContacts();
      }
      setShowNewConversation(false);
      setContatosSearch('');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao iniciar conversa');
    } finally {
      setStartingConversation(false);
    }
  };

  const getContactDisplayName = (c: Contact) => c.name || c.profile_name || c.phone;
  const getInitials = (c: Contact) => {
    const name = c.name || c.profile_name || c.phone;
    return name.substring(0, 2).toUpperCase();
  };

  // 24h window countdown
  const get24hWindowInfo = (contact: Contact) => {
    if (!contact.last_message_at) return null;
    // Find last INCOMING message time from messages
    const lastIncoming = [...messages].reverse().find(m => m.direction === 'in');
    if (!lastIncoming) return null;
    const lastInTime = new Date(lastIncoming.created_at).getTime();
    const now = Date.now();
    const windowEnd = lastInTime + 24 * 60 * 60 * 1000;
    const remaining = windowEnd - now;
    if (remaining <= 0) return { expired: true, text: 'Janela expirada', hours: 0, minutes: 0 };
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    return { expired: false, text: `${hours}h ${minutes}m`, hours, minutes };
  };

  // Refresh 24h counter every minute
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex h-[calc(100vh-2rem)] m-4 rounded-xl border bg-card overflow-hidden shadow-lg">
      {/* LEFT: Contact list */}
      <div className="w-80 border-r flex flex-col bg-card">
        {/* Header */}
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              Central WhatsApp
            </h2>
            <div className="flex items-center gap-1">
              {/* Nova Conversa button */}
              <Dialog open={showNewConversation} onOpenChange={(open) => { setShowNewConversation(open); if (open) loadContatosList(); }}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" title="Nova Conversa">
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Nova Conversa</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar contato..."
                        value={contatosSearch}
                        onChange={(e) => setContatosSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <ScrollArea className="h-64">
                      {filteredContatosList.length === 0 ? (
                        <p className="text-center text-sm text-muted-foreground py-4">Nenhum contato encontrado</p>
                      ) : (
                        filteredContatosList.map((contato) => (
                          <div
                            key={contato.id}
                            onClick={() => !startingConversation && handleStartConversation(contato)}
                            className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                          >
                            <Avatar className="h-8 w-8 shrink-0">
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {contato.nome.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
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
              {/* Add contact button */}
              <Dialog open={showNewContact} onOpenChange={setShowNewContact}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" title="Novo Contato">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Novo Contato WhatsApp</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label>Nome</Label>
                      <Input
                        placeholder="Nome do contato"
                        value={newContactName}
                        onChange={(e) => setNewContactName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>WhatsApp</Label>
                      <Input
                        placeholder="(00) 00000-0000"
                        value={newContactPhone}
                        onChange={(e) => setNewContactPhone(formatPhone(e.target.value))}
                        maxLength={16}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowNewContact(false)}>Cancelar</Button>
                    <Button onClick={handleCreateContact} disabled={creatingContact}>
                      {creatingContact ? 'Criando...' : 'Criar Contato'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button variant="ghost" size="icon" onClick={loadContacts}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar contato..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant={showArchived ? 'secondary' : 'ghost'}
            size="sm"
            className="w-full justify-start text-xs gap-2"
            onClick={() => setShowArchived(!showArchived)}
          >
            <Archive className="h-3.5 w-3.5" />
            {showArchived ? 'Ver conversas ativas' : 'Ver arquivadas'}
          </Button>
        </div>

        {/* Contact list */}
        <ScrollArea className="flex-1">
          {filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <Phone className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>Nenhum contato encontrado</p>
            </div>
          ) : (
            filteredContacts.map((contact) => (
              <div
                key={contact.id}
                onClick={() => handleSelectContact(contact)}
                className={cn(
                  'flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors border-b border-border/50',
                  selectedContact?.id === contact.id && 'bg-primary/10'
                )}
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {getInitials(contact)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm truncate">
                      {getContactDisplayName(contact)}
                    </span>
                    {contact.last_message_at && (
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                        {format(new Date(contact.last_message_at), 'HH:mm', { locale: ptBR })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-xs text-muted-foreground truncate">
                      {contact.last_message_preview || contact.phone}
                    </span>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      {contact.human_mode && (
                        <UserCheck className="h-3 w-3 text-amber-500" />
                      )}
                      {contact.unread_count > 0 && (
                        <Badge className="bg-primary text-primary-foreground h-5 min-w-5 flex items-center justify-center text-[10px] rounded-full px-1.5">
                          {contact.unread_count}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </ScrollArea>
      </div>

      {/* RIGHT: Conversation */}
      <div className="flex-1 flex flex-col">
        {!selectedContact ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageCircle className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium">Central de Atendimento WhatsApp</p>
              <p className="text-sm mt-1">Selecione um contato para iniciar a conversa</p>
            </div>
          </div>
        ) : (
          <>
            {/* Conversation header */}
            <div className="p-3 border-b flex items-center justify-between bg-card">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {getInitials(selectedContact)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{getContactDisplayName(selectedContact)}</p>
                    {selectedContact.unread_count > 0 && (
                      <Badge className="bg-primary text-primary-foreground h-5 min-w-5 flex items-center justify-center text-[10px] rounded-full px-1.5">
                        {selectedContact.unread_count}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {selectedContact.phone}
                    {selectedContact.human_mode && (
                      <Badge variant="outline" className="ml-2 text-[10px] py-0 h-4 border-amber-400 text-amber-600">
                        <UserCheck className="h-2.5 w-2.5 mr-0.5" /> Humano
                      </Badge>
                    )}
                    {(() => {
                      const windowInfo = get24hWindowInfo(selectedContact);
                      if (!windowInfo) return null;
                      return (
                        <Badge
                          variant="outline"
                          className={cn(
                            "ml-2 text-[10px] py-0 h-4 gap-0.5",
                            windowInfo.expired
                              ? "border-destructive/50 text-destructive"
                              : windowInfo.hours < 2
                                ? "border-amber-400 text-amber-600"
                                : "border-emerald-400 text-emerald-600"
                          )}
                        >
                          <Timer className="h-2.5 w-2.5" />
                          {windowInfo.text}
                        </Badge>
                      );
                    })()}
                  </p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => toggleHumanMode(selectedContact)}>
                    {selectedContact.human_mode ? (
                      <><Bot className="h-4 w-4 mr-2" /> Reativar automação</>
                    ) : (
                      <><UserCheck className="h-4 w-4 mr-2" /> Modo humano</>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => archiveContact(selectedContact)}>
                    {selectedContact.archived ? (
                      <><ArchiveRestore className="h-4 w-4 mr-2" /> Desarquivar</>
                    ) : (
                      <><Archive className="h-4 w-4 mr-2" /> Arquivar conversa</>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => toggleAudioBlocked(selectedContact)}>
                    {selectedContact.audio_blocked ? (
                      <><Mic className="h-4 w-4 mr-2" /> Permitir áudio</>
                    ) : (
                      <><MicOff className="h-4 w-4 mr-2" /> Bloquear áudio</>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Messages */}
            <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
              <div className="space-y-2 max-w-3xl mx-auto">
                {loadingMessages ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma mensagem</div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex',
                        msg.direction === 'out' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[70%] rounded-2xl px-4 py-2 shadow-sm',
                          msg.direction === 'out'
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : 'bg-muted rounded-bl-md'
                        )}
                      >
                        {msg.type !== 'text' && msg.type !== 'template' && (
                          <Badge variant="secondary" className="text-[10px] mb-1">
                            {msg.type}
                          </Badge>
                        )}
                        {/* Media rendering */}
                        {msg.type === 'image' && msg.media_url && (
                          <img
                            src={msg.media_url}
                            alt="Imagem"
                            className="max-w-full rounded-lg mb-1 cursor-pointer"
                            onClick={() => window.open(msg.media_url!, '_blank')}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        {msg.type === 'video' && msg.media_url && (
                          <video
                            src={msg.media_url}
                            controls
                            className="max-w-full rounded-lg mb-1"
                            onError={(e) => { (e.target as HTMLVideoElement).style.display = 'none'; }}
                          />
                        )}
                        {msg.type === 'audio' && msg.media_url && (
                          <audio
                            src={msg.media_url}
                            controls
                            className="w-full mb-1"
                            onError={(e) => { (e.target as HTMLAudioElement).style.display = 'none'; }}
                          />
                        )}
                        {msg.type === 'sticker' && msg.media_url && (
                          <img
                            src={msg.media_url}
                            alt="Sticker"
                            className="max-w-[150px] mb-1"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        {msg.type === 'document' && msg.media_url && (
                          <a
                            href={msg.media_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-xs underline mb-1"
                          >
                            <File className="h-4 w-4" /> Abrir documento
                          </a>
                        )}
                        {msg.body && msg.body !== `[${msg.type}]` && (
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                        )}
                        {(!msg.body || msg.body === `[${msg.type}]`) && !msg.media_url && (
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.body || ''}</p>
                        )}
                        <div className={cn(
                          'flex items-center justify-end gap-1 mt-1',
                          msg.direction === 'out' ? 'text-primary-foreground/60' : 'text-muted-foreground'
                        )}>
                          <span className="text-[10px]">
                            {format(new Date(msg.created_at), 'HH:mm')}
                          </span>
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
            <div className="p-3 border-t bg-card">
              <form
                onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                className="flex items-center gap-2 max-w-3xl mx-auto"
              >
                <Input
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Digite uma mensagem..."
                  className="flex-1"
                  disabled={sending}
                />
                <Button type="submit" size="icon" disabled={!messageText.trim() || sending}>
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
