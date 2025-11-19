import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/ui/responsive-dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  Mail, 
  Send, 
  Paperclip, 
  X, 
  Reply, 
  Download, 
  FileText, 
  MailOpen, 
  MailCheck,
  Search,
  Filter,
  MessageSquare,
  Clock,
  User,
  Trash2
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

interface Anexo {
  nome: string;
  url: string;
  tamanho: number;
}

interface Mensagem {
  id: string;
  remetente_id: string;
  destinatario_id: string;
  assunto: string;
  mensagem: string;
  lida: boolean;
  created_at: string;
  em_resposta_a?: string;
  anexos?: Anexo[];
  remetente?: { nome: string };
  destinatario?: { nome: string };
  respostas?: Mensagem[];
}

interface Profile {
  id: string;
  nome: string;
  ativo: boolean;
}

export default function Mensagens() {
  const { user } = useAuth();
  const [recebidas, setRecebidas] = useState<Mensagem[]>([]);
  const [enviadas, setEnviadas] = useState<Mensagem[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Mensagem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'unread' | 'read'>('all');
  const [formData, setFormData] = useState({
    destinatario_id: '',
    assunto: '',
    mensagem: '',
    em_resposta_a: undefined as string | undefined,
  });
  const [anexos, setAnexos] = useState<File[]>([]);

  useEffect(() => {
    fetchMensagens();
    fetchProfiles();
    
    const channel = supabase
      .channel('mensagens_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mensagens',
          filter: `destinatario_id=eq.${user?.id}`,
        },
        () => {
          fetchMensagens();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchMensagens = async () => {
    if (!user) return;

    const { data: recebData, error: recebError } = await supabase
      .from('mensagens')
      .select('*')
      .eq('destinatario_id', user.id)
      .is('em_resposta_a', null)
      .order('created_at', { ascending: false });

    if (recebError) {
      toast.error('Erro ao carregar mensagens recebidas');
    } else {
      const mensagensComNomes = await Promise.all(
        (recebData || []).map(async (msg) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('nome')
            .eq('id', msg.remetente_id)
            .single();
          
          const { data: respostas } = await supabase
            .from('mensagens')
            .select('*')
            .eq('em_resposta_a', msg.id)
            .order('created_at', { ascending: true });

          return { 
            ...msg, 
            anexos: Array.isArray(msg.anexos) ? msg.anexos as unknown as Anexo[] : [],
            remetente: profile, 
            respostas: (respostas || []).map(r => ({
              ...r,
              anexos: Array.isArray(r.anexos) ? r.anexos as unknown as Anexo[] : []
            }))
          };
        })
      );
      setRecebidas(mensagensComNomes);
    }

    const { data: envData, error: envError } = await supabase
      .from('mensagens')
      .select('*')
      .eq('remetente_id', user.id)
      .is('em_resposta_a', null)
      .order('created_at', { ascending: false });

    if (envError) {
      toast.error('Erro ao carregar mensagens enviadas');
    } else {
      const mensagensComNomes = await Promise.all(
        (envData || []).map(async (msg) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('nome')
            .eq('id', msg.destinatario_id)
            .single();
          
          const { data: respostas } = await supabase
            .from('mensagens')
            .select('*')
            .eq('em_resposta_a', msg.id)
            .order('created_at', { ascending: true });

          return { 
            ...msg, 
            anexos: Array.isArray(msg.anexos) ? msg.anexos as unknown as Anexo[] : [],
            destinatario: profile,
            respostas: (respostas || []).map(r => ({
              ...r,
              anexos: Array.isArray(r.anexos) ? r.anexos as unknown as Anexo[] : []
            }))
          };
        })
      );
      setEnviadas(mensagensComNomes);
    }
  };

  const fetchProfiles = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nome, ativo')
      .eq('ativo', true)
      .order('nome');

    if (error) {
      toast.error('Erro ao carregar usuários');
    } else {
      setProfiles(data || []);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAnexos(Array.from(e.target.files));
    }
  };

  const removeAnexo = (index: number) => {
    setAnexos(anexos.filter((_, i) => i !== index));
  };

  const uploadAnexos = async (): Promise<Anexo[]> => {
    if (anexos.length === 0) return [];

    setUploading(true);
    const anexosUpload: Anexo[] = [];

    for (const file of anexos) {
      const fileName = `${Date.now()}_${file.name}`;
      const { data, error } = await supabase.storage
        .from('documentos')
        .upload(fileName, file);

      if (error) {
        toast.error(`Erro ao fazer upload de ${file.name}`);
        continue;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('documentos')
        .getPublicUrl(fileName);

      anexosUpload.push({
        nome: file.name,
        url: publicUrl,
        tamanho: file.size
      });
    }

    setUploading(false);
    return anexosUpload;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.destinatario_id || !formData.assunto || !formData.mensagem) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      const anexosUpload = await uploadAnexos();

      const { error } = await supabase.from('mensagens').insert([
        {
          remetente_id: user?.id!,
          destinatario_id: formData.destinatario_id,
          assunto: formData.assunto,
          mensagem: formData.mensagem,
          em_resposta_a: formData.em_resposta_a,
          anexos: anexosUpload.length > 0 ? anexosUpload as any : null,
        },
      ]);

      if (error) throw error;

      toast.success('Mensagem enviada!');
      setDialogOpen(false);
      setFormData({
        destinatario_id: '',
        assunto: '',
        mensagem: '',
        em_resposta_a: undefined,
      });
      setAnexos([]);
      fetchMensagens();
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      toast.error('Erro ao enviar mensagem');
    }
  };

  const handleViewMessage = async (msg: Mensagem) => {
    const respostasComNomes = await Promise.all(
      (msg.respostas || []).map(async (resposta) => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('nome')
          .eq('id', resposta.remetente_id)
          .single();
        
        return {
          ...resposta,
          remetente: profile,
        };
      })
    );

    setSelectedMessage({ ...msg, respostas: respostasComNomes as unknown as Mensagem[] });
    setViewDialogOpen(true);

    if (msg.destinatario_id === user?.id && !msg.lida) {
      await supabase
        .from('mensagens')
        .update({ lida: true })
        .eq('id', msg.id);
      
      fetchMensagens();
    }
  };

  const toggleReadStatus = async (msg: Mensagem) => {
    if (msg.destinatario_id !== user?.id) return;

    await supabase
      .from('mensagens')
      .update({ lida: !msg.lida })
      .eq('id', msg.id);
    
    toast.success(msg.lida ? 'Marcada como não lida' : 'Marcada como lida');
    fetchMensagens();
  };

  const handleReply = (msg: Mensagem) => {
    setFormData({
      destinatario_id: msg.remetente_id === user?.id ? msg.destinatario_id : msg.remetente_id,
      assunto: msg.assunto.startsWith('Re: ') ? msg.assunto : `Re: ${msg.assunto}`,
      mensagem: '',
      em_resposta_a: msg.id,
    });
    setViewDialogOpen(false);
    setDialogOpen(true);
  };

  const handleDelete = async (msgId: string) => {
    const { error } = await supabase
      .from('mensagens')
      .delete()
      .eq('id', msgId);

    if (error) {
      toast.error('Erro ao excluir mensagem');
      return;
    }

    toast.success('Mensagem excluída');
    fetchMensagens();
    setViewDialogOpen(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Ontem';
    } else if (days < 7) {
      return `${days} dias atrás`;
    }

    return date.toLocaleDateString('pt-BR');
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const filteredRecebidas = recebidas.filter(msg => {
    const matchesSearch = 
      msg.assunto.toLowerCase().includes(searchTerm.toLowerCase()) ||
      msg.mensagem.toLowerCase().includes(searchTerm.toLowerCase()) ||
      msg.remetente?.nome.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = 
      filterStatus === 'all' || 
      (filterStatus === 'unread' && !msg.lida) ||
      (filterStatus === 'read' && msg.lida);

    return matchesSearch && matchesFilter;
  });

  const filteredEnviadas = enviadas.filter(msg => 
    msg.assunto.toLowerCase().includes(searchTerm.toLowerCase()) ||
    msg.mensagem.toLowerCase().includes(searchTerm.toLowerCase()) ||
    msg.destinatario?.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const unreadCount = recebidas.filter(m => !m.lida).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <MessageSquare className="h-7 w-7 text-primary" />
              </div>
              Mensagens
            </h1>
            <p className="text-muted-foreground mt-1">Comunicação interna entre usuários</p>
          </div>
          
          <Button onClick={() => setDialogOpen(true)} size="lg" className="gap-2">
            <Send className="h-4 w-4" />
            Nova Mensagem
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">Não Lidas</p>
                <div className="p-1.5 rounded-full bg-red-500/10">
                  <Mail className="h-3.5 w-3.5 text-red-500" />
                </div>
              </div>
              <p className="text-xl font-bold">{unreadCount}</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">Recebidas</p>
                <div className="p-1.5 rounded-full bg-blue-500/10">
                  <MailOpen className="h-3.5 w-3.5 text-blue-500" />
                </div>
              </div>
              <p className="text-xl font-bold">{recebidas.length}</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">Enviadas</p>
                <div className="p-1.5 rounded-full bg-green-500/10">
                  <Send className="h-3.5 w-3.5 text-green-500" />
                </div>
              </div>
              <p className="text-xl font-bold">{enviadas.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar mensagens..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="unread">Não lidas</SelectItem>
                  <SelectItem value="read">Lidas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Messages Tabs */}
        <Tabs defaultValue="recebidas" className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-12">
            <TabsTrigger value="recebidas" className="gap-2 text-base">
              <Mail className="h-4 w-4" />
              Recebidas
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ml-1 animate-pulse">
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="enviadas" className="gap-2 text-base">
              <Send className="h-4 w-4" />
              Enviadas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="recebidas" className="mt-6">
            <Card className="shadow-sm">
              <CardContent className="p-0">
                <ScrollArea className="h-[calc(100vh-450px)]">
                  {filteredRecebidas.length === 0 ? (
                    <div className="text-center py-16 px-4">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                        <Mail className="h-8 w-8 text-primary" />
                      </div>
                      <p className="text-lg font-medium mb-1">Nenhuma mensagem</p>
                      <p className="text-sm text-muted-foreground">
                        {searchTerm || filterStatus !== 'all' 
                          ? 'Tente ajustar os filtros de busca' 
                          : 'Você não tem mensagens recebidas'}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {filteredRecebidas.map((msg, index) => (
                        <div
                          key={msg.id}
                          className={`group flex items-start gap-4 p-4 cursor-pointer transition-all hover:bg-accent/50 animate-fade-in ${
                            !msg.lida ? 'bg-primary/5' : ''
                          }`}
                          style={{ animationDelay: `${index * 50}ms` }}
                          onClick={() => handleViewMessage(msg)}
                        >
                          <div className="flex-shrink-0 pt-1">
                            <div className={`p-2 rounded-full ${!msg.lida ? 'bg-primary/10' : 'bg-muted'}`}>
                              {msg.lida ? (
                                <MailOpen className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Mail className="h-4 w-4 text-primary" />
                              )}
                            </div>
                          </div>
                          
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="flex items-center gap-2 text-sm">
                                <User className="h-3 w-3 text-muted-foreground" />
                                <span className={`font-semibold ${!msg.lida ? 'text-foreground' : 'text-muted-foreground'}`}>
                                  {msg.remetente?.nome || 'Desconhecido'}
                                </span>
                              </div>
                              {!msg.lida && (
                                <Badge variant="default" className="text-xs animate-pulse">
                                  Nova
                                </Badge>
                              )}
                              {msg.respostas && msg.respostas.length > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  <Reply className="h-3 w-3 mr-1" />
                                  {msg.respostas.length}
                                </Badge>
                              )}
                            </div>
                            
                            <p className={`font-medium line-clamp-1 ${!msg.lida ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {msg.assunto}
                            </p>
                            
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {msg.mensagem}
                            </p>
                            
                            {msg.anexos && msg.anexos.length > 0 && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
                                <Paperclip className="h-3 w-3" />
                                <span>{msg.anexos.length} anexo(s)</span>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex-shrink-0 flex flex-col items-end gap-2">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              <span>{formatDate(msg.created_at)}</span>
                            </div>
                            
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleReadStatus(msg);
                              }}
                              title={msg.lida ? 'Marcar como não lida' : 'Marcar como lida'}
                            >
                              {msg.lida ? (
                                <Mail className="h-4 w-4" />
                              ) : (
                                <MailCheck className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="enviadas" className="mt-6">
            <Card className="shadow-sm">
              <CardContent className="p-0">
                <ScrollArea className="h-[calc(100vh-450px)]">
                  {filteredEnviadas.length === 0 ? (
                    <div className="text-center py-16 px-4">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                        <Send className="h-8 w-8 text-primary" />
                      </div>
                      <p className="text-lg font-medium mb-1">Nenhuma mensagem enviada</p>
                      <p className="text-sm text-muted-foreground">
                        {searchTerm 
                          ? 'Tente ajustar a busca' 
                          : 'Envie sua primeira mensagem'}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {filteredEnviadas.map((msg, index) => (
                        <div
                          key={msg.id}
                          className="group flex items-start gap-4 p-4 cursor-pointer transition-all hover:bg-accent/50 animate-fade-in"
                          style={{ animationDelay: `${index * 50}ms` }}
                          onClick={() => handleViewMessage(msg)}
                        >
                          <div className="flex-shrink-0 pt-1">
                            <div className="p-2 rounded-full bg-green-500/10">
                              <Send className="h-4 w-4 text-green-500" />
                            </div>
                          </div>
                          
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 text-sm">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span className="font-semibold text-muted-foreground">
                                Para: {msg.destinatario?.nome || 'Desconhecido'}
                              </span>
                              {msg.respostas && msg.respostas.length > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  <Reply className="h-3 w-3 mr-1" />
                                  {msg.respostas.length}
                                </Badge>
                              )}
                            </div>
                            
                            <p className="font-medium text-muted-foreground line-clamp-1">
                              {msg.assunto}
                            </p>
                            
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {msg.mensagem}
                            </p>
                            
                            {msg.anexos && msg.anexos.length > 0 && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
                                <Paperclip className="h-3 w-3" />
                                <span>{msg.anexos.length} anexo(s)</span>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex-shrink-0 flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{formatDate(msg.created_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* New Message Dialog */}
        <ResponsiveDialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Send className="h-5 w-5 text-primary" />
                </div>
                <DialogTitle className="text-xl">
                  {formData.em_resposta_a ? 'Responder Mensagem' : 'Nova Mensagem'}
                </DialogTitle>
              </div>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6 pt-4">
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="destinatario" className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Destinatário *
                  </Label>
                  <Select
                    value={formData.destinatario_id}
                    onValueChange={(value) => setFormData({ ...formData, destinatario_id: value })}
                    disabled={!!formData.em_resposta_a}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Selecione o destinatário" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.filter(p => p.id !== user?.id).map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="assunto" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Assunto *
                  </Label>
                  <Input
                    id="assunto"
                    value={formData.assunto}
                    onChange={(e) => setFormData({ ...formData, assunto: e.target.value })}
                    placeholder="Ex: Reunião de projeto"
                    required
                    className="h-11"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="mensagem" className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Mensagem *
                  </Label>
                  <Textarea
                    id="mensagem"
                    value={formData.mensagem}
                    onChange={(e) => setFormData({ ...formData, mensagem: e.target.value })}
                    rows={6}
                    placeholder="Digite sua mensagem..."
                    required
                    className="resize-none"
                  />
                </div>

                <div className="grid gap-2">
                  <Label className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4" />
                    Anexos
                  </Label>
                  <Input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="h-11"
                  />
                  {anexos.length > 0 && (
                    <div className="space-y-2 mt-2">
                      {anexos.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-muted">
                          <div className="flex items-center gap-2 flex-1">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm truncate">{file.name}</span>
                            <span className="text-xs text-muted-foreground">
                              ({formatFileSize(file.size)})
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => removeAnexo(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDialogOpen(false);
                    setFormData({
                      destinatario_id: '',
                      assunto: '',
                      mensagem: '',
                      em_resposta_a: undefined,
                    });
                    setAnexos([]);
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={uploading} size="lg" className="gap-2">
                  <Send className="h-4 w-4" />
                  {uploading ? 'Enviando...' : 'Enviar Mensagem'}
                </Button>
              </div>
            </form>
          </ResponsiveDialogContent>
        </ResponsiveDialog>

        {/* View Message Dialog */}
        <ResponsiveDialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <ResponsiveDialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            {selectedMessage && (
              <>
                <DialogHeader className="border-b pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Mail className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <DialogTitle className="text-xl">{selectedMessage.assunto}</DialogTitle>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                          <User className="h-3 w-3" />
                          <span>
                            {selectedMessage.remetente_id === user?.id
                              ? `Para: ${selectedMessage.destinatario?.nome}`
                              : `De: ${selectedMessage.remetente?.nome}`}
                          </span>
                          <span>•</span>
                          <Clock className="h-3 w-3" />
                          <span>{formatDate(selectedMessage.created_at)}</span>
                        </div>
                      </div>
                    </div>
                    {selectedMessage.destinatario_id === user?.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(selectedMessage.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </DialogHeader>

                <div className="space-y-6 pt-4">
                  {/* Message Content */}
                  <Card className="bg-muted/50">
                    <CardContent className="p-4">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {selectedMessage.mensagem}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Attachments */}
                  {selectedMessage.anexos && selectedMessage.anexos.length > 0 && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Paperclip className="h-4 w-4" />
                        Anexos ({selectedMessage.anexos.length})
                      </Label>
                      <div className="space-y-2">
                        {selectedMessage.anexos.map((anexo, index) => (
                          <Card key={index} className="hover:shadow-md transition-shadow">
                            <CardContent className="p-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate text-sm">{anexo.nome}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatFileSize(anexo.tamanho)}
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  asChild
                                  className="flex-shrink-0"
                                >
                                  <a href={anexo.url} download={anexo.nome} target="_blank" rel="noopener noreferrer">
                                    <Download className="h-4 w-4" />
                                  </a>
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Replies */}
                  {selectedMessage.respostas && selectedMessage.respostas.length > 0 && (
                    <div className="space-y-3">
                      <Separator />
                      <Label className="flex items-center gap-2">
                        <Reply className="h-4 w-4" />
                        Respostas ({selectedMessage.respostas.length})
                      </Label>
                      <div className="space-y-3">
                        {selectedMessage.respostas.map((resposta) => (
                          <Card key={resposta.id} className="bg-accent/50">
                            <CardContent className="p-4 space-y-2">
                              <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <User className="h-3 w-3" />
                                  <span className="font-medium">{resposta.remetente?.nome}</span>
                                </div>
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  <span className="text-xs">{formatDate(resposta.created_at)}</span>
                                </div>
                              </div>
                              <p className="text-sm whitespace-pre-wrap">{resposta.mensagem}</p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 justify-end pt-4 border-t">
                    <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
                      Fechar
                    </Button>
                    <Button onClick={() => handleReply(selectedMessage)} className="gap-2">
                      <Reply className="h-4 w-4" />
                      Responder
                    </Button>
                  </div>
                </div>
              </>
            )}
          </ResponsiveDialogContent>
        </ResponsiveDialog>
      </div>
    </div>
  );
}
