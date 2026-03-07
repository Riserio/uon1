import { useState, useEffect } from "react";
import { useWhatsAppUnread } from "@/hooks/useWhatsAppUnread";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Mail,
  Plus,
  Trash2,
  Save,
  FileText,
  History,
  Settings,
  Target,
  AlertTriangle,
  BarChart3,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  MessageCircle,
  Headset,
  Bot,
  Eye,
} from "lucide-react";
import CentralAtendimento from "@/pages/CentralAtendimento";
import WhatsAppFlows from "@/pages/WhatsAppFlows";
import { useAuth } from "@/hooks/useAuth";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import DOMPurify from 'dompurify';
import { WhatsAppConfig } from "@/components/whatsapp/WhatsAppConfig";
import { WhatsAppNotificacaoGlobal } from "@/components/whatsapp/WhatsAppNotificacaoGlobal";
import { WhatsAppTemplates } from "@/components/whatsapp/WhatsAppTemplates";
import { WhatsAppEnvioManual } from "@/components/whatsapp/WhatsAppEnvioManual";
import { WhatsAppHistorico } from "@/components/whatsapp/WhatsAppHistorico";
import WhatsAppDashboard from "@/components/whatsapp/WhatsAppDashboard";

interface ResendConfig {
  from_email: string;
  from_name: string;
}

interface SMTPConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  from_email: string;
  from_name: string;
}

type TemplateTipo = "atendimento" | "alerta_performance" | "recuperacao" | "boas_vindas" | "relatorio" | "convite_reuniao" | "ouvidoria" | "ouvidoria_finalizado";
type TemplateFrequencia = "manual" | "diario" | "semanal" | "mensal";

interface EmailTemplate {
  id: string;
  nome: string;
  assunto: string;
  corpo: string;
  status: string[];
  ativo: boolean;
  tipo: TemplateTipo;
  categoria: string;
  frequencia: TemplateFrequencia;
  ultima_execucao: string | null;
  proxima_execucao: string | null;
}

interface EmailAutoConfig {
  enabled: boolean;
}

export default function Emails() {
  const { user } = useAuth();
  const totalUnread = useWhatsAppUnread();
  const [resendConfig, setResendConfig] = useState<ResendConfig>({
    from_email: "",
    from_name: "",
  });
  const [smtpConfig, setSmtpConfig] = useState<SMTPConfig>({
    smtp_host: "",
    smtp_port: 587,
    smtp_user: "",
    smtp_password: "",
    from_email: "",
    from_name: "",
  });
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [novoTemplate, setNovoTemplate] = useState({
    nome: "",
    assunto: "",
    corpo: "",
    status: [] as string[],
    ativo: true,
    tipo: "atendimento" as TemplateTipo,
    categoria: "atendimento",
    frequencia: "manual" as TemplateFrequencia,
  });
  const [editandoTemplate, setEditandoTemplate] = useState<string | null>(null);
  const [historico, setHistorico] = useState<any[]>([]);
  const [emailQueue, setEmailQueue] = useState<any[]>([]);
  const [emailAuto, setEmailAuto] = useState<EmailAutoConfig>({ enabled: false });
  const [stats, setStats] = useState({
    total: 0,
    enviados: 0,
    pendentes: 0,
    falhados: 0,
    taxaSucesso: 0,
  });
  const [resendUsage, setResendUsage] = useState<{
    domains: any[];
    monthly: { sending: number; failed: number; limit: number };
    daily: { sending: number; failed: number; limit: number };
  } | null>(null);
  const [processandoFila, setProcessandoFila] = useState(false);
  const [availableStatus, setAvailableStatus] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState('');

  useEffect(() => {
    if (user) {
      loadResendConfig();
      loadSMTPConfig();
      loadTemplates();
      loadHistorico();
      loadEmailQueue();
      loadEmailAutoConfig();
      loadStats();
      loadAvailableStatus();
      loadResendUsage();
    }

    // Subscribe to realtime changes for status_config
    const channel = supabase
      .channel("email_status_config_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "status_config",
        },
        () => {
          loadAvailableStatus();
        },
      )
      .subscribe();

    // Subscribe to realtime changes for email_historico so dashboard updates
    const emailHistChannel = supabase
      .channel("email_historico_realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "email_historico",
        },
        () => {
          loadHistorico();
          loadStats();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(emailHistChannel);
    };
  }, [user]);

  const loadResendConfig = async () => {
    const { data } = await supabase.from("resend_config").select("*").eq("user_id", user!.id).single();

    if (data) {
      setResendConfig(data);
    }
  };

  const loadSMTPConfig = async () => {
    const { data } = await supabase.from("email_config").select("*").eq("user_id", user!.id).single();

    if (data) {
      setSmtpConfig(data);
    }
  };

  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from("email_templates")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading templates:", error);
      toast.error("Erro ao carregar templates");
      return;
    }

    if (data) {
      setTemplates(data as EmailTemplate[]);
    }
  };

  const loadEmailAutoConfig = async () => {
    const { data } = await supabase.from("email_auto_config").select("*").eq("user_id", user!.id).single();

    if (data) {
      setEmailAuto({ enabled: data.enabled });
    }
  };

  const loadAvailableStatus = async () => {
    const { data, error } = await supabase.from("status_config").select("nome").eq("ativo", true).order("ordem");

    if (error) {
      console.error("Error loading status:", error);
      return;
    }

    if (data) {
      setAvailableStatus(data.map((s) => s.nome));
    }
  };

  const handleToggleEmailAuto = async (checked: boolean) => {
    try {
      const { data: existing } = await supabase.from("email_auto_config").select("id").eq("user_id", user!.id).single();

      if (existing) {
        await supabase.from("email_auto_config").update({ enabled: checked }).eq("user_id", user!.id);
      } else {
        await supabase.from("email_auto_config").insert({ user_id: user!.id, enabled: checked });
      }

      setEmailAuto({ enabled: checked });
      toast.success(checked ? "Envio automático ativado" : "Envio automático desativado");
    } catch (error) {
      console.error("Error toggling email auto:", error);
      toast.error("Erro ao atualizar configuração");
    }
  };

  const loadHistorico = async () => {
    const { data, error } = await supabase
      .from("email_historico")
      .select(
        `
        *,
        atendimentos!email_historico_atendimento_id_fkey (
          assunto
        )
      `,
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Erro ao carregar histórico:", error);
      // Fallback: try without join
      const { data: fallbackData } = await supabase
        .from("email_historico")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (fallbackData) setHistorico(fallbackData);
    } else if (data) {
      setHistorico(data);
    }
  };

  const loadEmailQueue = async () => {
    const { data, error } = await supabase
      .from("email_queue")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Erro ao carregar fila de emails:", error);
    } else if (data) {
      setEmailQueue(data);
    }
  };

  const handleSaveResendConfig = async () => {
    if (!resendConfig.from_email || !resendConfig.from_name) {
      toast.error("Preencha todos os campos");
      return;
    }

    try {
      const { data: existing } = await supabase.from("resend_config").select("id").eq("user_id", user!.id).single();

      if (existing) {
        await supabase.from("resend_config").update(resendConfig).eq("user_id", user!.id);
      } else {
        await supabase.from("resend_config").insert({ ...resendConfig, user_id: user!.id });
      }

      toast.success("Configuração salva com sucesso");
    } catch (error) {
      console.error("Erro ao salvar configuração:", error);
      toast.error("Erro ao salvar configuração");
    }
  };

  const handleSaveSMTPConfig = async () => {
    if (
      !smtpConfig.smtp_host ||
      !smtpConfig.smtp_user ||
      !smtpConfig.smtp_password ||
      !smtpConfig.from_email ||
      !smtpConfig.from_name
    ) {
      toast.error("Preencha todos os campos");
      return;
    }

    try {
      const { data: existing } = await supabase.from("email_config").select("id").eq("user_id", user!.id).single();

      if (existing) {
        await supabase.from("email_config").update(smtpConfig).eq("user_id", user!.id);
      } else {
        await supabase.from("email_config").insert({ ...smtpConfig, user_id: user!.id });
      }

      toast.success("Configuração SMTP salva!");
    } catch (error) {
      console.error("Error saving SMTP config:", error);
      toast.error("Erro ao salvar configuração");
    }
  };

  const handleSaveTemplate = async () => {
    if (!novoTemplate.nome || !novoTemplate.assunto || !novoTemplate.corpo) {
      toast.error("Preencha todos os campos do template");
      return;
    }

    try {
      if (editandoTemplate) {
        const { error } = await supabase.from("email_templates").update(novoTemplate).eq("id", editandoTemplate);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("email_templates").insert({ ...novoTemplate, user_id: user!.id });

        if (error) throw error;
      }

      toast.success("Template salvo com sucesso");
      loadTemplates();
      setNovoTemplate({
        nome: "",
        assunto: "",
        corpo: "",
        status: [] as string[],
        ativo: true,
        tipo: "atendimento",
        categoria: "atendimento",
        frequencia: "manual",
      });
      setEditandoTemplate(null);
    } catch (error) {
      console.error("Erro ao salvar template:", error);
      toast.error("Erro ao salvar template");
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await supabase.from("email_templates").delete().eq("id", id);
      toast.success("Template excluído");
      loadTemplates();
    } catch (error) {
      console.error("Erro ao excluir template:", error);
      toast.error("Erro ao excluir template");
    }
  };

  const handleEditTemplate = (template: EmailTemplate) => {
    setNovoTemplate({
      nome: template.nome,
      assunto: template.assunto,
      corpo: template.corpo,
      status: template.status || [],
      ativo: template.ativo,
      tipo: (template.tipo || "atendimento") as TemplateTipo,
      categoria: template.categoria || "atendimento",
      frequencia: (template.frequencia || "manual") as TemplateFrequencia,
    });
    setEditandoTemplate(template.id);
  };

  const toggleStatus = (status: string) => {
    if (novoTemplate.status.includes(status)) {
      setNovoTemplate({
        ...novoTemplate,
        status: novoTemplate.status.filter((s) => s !== status),
      });
    } else {
      setNovoTemplate({
        ...novoTemplate,
        status: [...novoTemplate.status, status],
      });
    }
  };

  const EMAIL_SAMPLE_DATA: Record<string, string> = {
    '{assunto}': 'Revisão de contrato #1234',
    '{status}': 'Em análise',
    '{corretora}': 'Corretora Exemplo',
    '{nome_usuario}': 'João Silva',
    '{nome_corretora}': 'Corretora Exemplo',
    '{link_portal}': 'https://portal.exemplo.com',
    '{periodo}': 'Janeiro/2026',
    '{total_atendimentos}': '150',
    '{taxa_conclusao}': '87%',
    '{nome_convidado}': 'Maria Oliveira',
    '{nome_reuniao}': 'Reunião de Alinhamento',
    '{data_reuniao}': '25/02/2026 às 14:00',
    '{link_reuniao}': 'https://app.exemplo.com/video/abc123',
    '{organizador}': 'João Silva',
    '{descricao}': 'Pauta: revisar metas do trimestre',
    '{duracao}': '60 min',
    '{rsvp_sim}': '#',
    '{rsvp_talvez}': '#',
    '{rsvp_nao}': '#',
    '{google_calendar_url}': '#',
    '{nome_responsavel}': 'Carlos Mendes',
    '{tipo_alerta}': 'SLA Crítico',
    '{valor_atual}': '65%',
    '{meta}': '90%',
    '{link_recuperacao}': 'https://app.exemplo.com/reset',
  };

  const openEmailPreview = (corpo: string) => {
    let rendered = corpo;
    for (const [tag, value] of Object.entries(EMAIL_SAMPLE_DATA)) {
      rendered = rendered.split(tag).join(value);
    }
    setPreviewContent(rendered);
    setPreviewOpen(true);
  };

  const loadStats = async () => {
    try {
      // Get ALL emails from history (system-wide, not filtered by user)
      const { data: historicoData } = await supabase.from("email_historico").select("status");

      const enviados = historicoData?.filter((e) => e.status === "enviado").length || 0;
      const falhados = historicoData?.filter((e) => e.status === "erro").length || 0;
      const total = historicoData?.length || 0;

      // Get ALL pending from queue (system-wide)
      const { count: pendentes } = await supabase
        .from("email_queue")
        .select("*", { count: "exact", head: true })
        .eq("status", "pendente");

      const taxaSucesso = total > 0 ? Math.round((enviados / total) * 100) : 0;

      setStats({
        total,
        enviados,
        pendentes: pendentes || 0,
        falhados,
        taxaSucesso,
      });
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const loadResendUsage = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const response = await supabase.functions.invoke('resend-stats', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.error) throw response.error;
      
      setResendUsage(response.data);
    } catch (error) {
      console.error("Error loading Resend usage:", error);
    }
  };

  const handleProcessarFila = async () => {
    setProcessandoFila(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Sessão expirada");
        return;
      }

      const response = await supabase.functions.invoke("processar-fila-emails", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) {
        throw response.error;
      }

      const result = response.data;
      toast.success(`${result.succeeded} email(s) enviado(s) com sucesso`);

      // Reload stats, history and queue
      loadStats();
      loadHistorico();
      loadEmailQueue();
    } catch (error: any) {
      console.error("Erro ao processar fila:", error);
      toast.error(error.message || "Erro ao processar fila");
    } finally {
      setProcessandoFila(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Email Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Prévia do Template
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto border rounded-lg bg-background">
            <div 
              className="p-6"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewContent) }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            * As variáveis foram substituídas por dados de exemplo para visualização
          </p>
        </DialogContent>
      </Dialog>
      <div className="container mx-auto p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
            <Headset className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Central de Atendimento</h1>
            <p className="text-sm text-muted-foreground">Gerencie conversas, automações e comunicações</p>
          </div>
        </div>

        {/* Top-level tabs — modern pill style */}
        <Tabs defaultValue="central" className="space-y-6">
          <TabsList>
            <TabsTrigger value="central" className="gap-2 relative">
              <Headset className="h-4 w-4" />
              Central
              {totalUnread > 0 && (
                <Badge className="bg-primary text-primary-foreground h-5 min-w-5 flex items-center justify-center text-[10px] rounded-full px-1.5 ml-1">
                  {totalUnread}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="gap-2">
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-2">
              <Mail className="h-4 w-4" />
              E-mail
            </TabsTrigger>
          </TabsList>

          {/* =================== CENTRAL TAB =================== */}
          <TabsContent value="central">
            <CentralAtendimento embedded />
          </TabsContent>

          {/* =================== WHATSAPP TAB (unified) =================== */}
          <TabsContent value="whatsapp" className="space-y-6">
            <Tabs defaultValue="dashboard" className="space-y-4">
              <TabsList>
                <TabsTrigger value="dashboard" className="gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Dashboard
                </TabsTrigger>
                <TabsTrigger value="config" className="gap-1.5">
                  <Settings className="h-3.5 w-3.5" />
                  Config
                </TabsTrigger>
                <TabsTrigger value="templates" className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Templates
                </TabsTrigger>
                <TabsTrigger value="envio" className="gap-1.5">
                  <Send className="h-3.5 w-3.5" />
                  Envio
                </TabsTrigger>
                <TabsTrigger value="automacoes" className="gap-1.5">
                  <Bot className="h-3.5 w-3.5" />
                  Automações
                </TabsTrigger>
                <TabsTrigger value="historico" className="gap-1.5">
                  <History className="h-3.5 w-3.5" />
                  Histórico
                </TabsTrigger>
              </TabsList>

              <TabsContent value="dashboard">
                <WhatsAppDashboard />
              </TabsContent>

              <TabsContent value="config">
                <div className="space-y-6">
                  <WhatsAppNotificacaoGlobal />
                  <WhatsAppConfig />
                </div>
              </TabsContent>
              <TabsContent value="templates">
                <WhatsAppTemplates />
              </TabsContent>
              <TabsContent value="envio">
                <WhatsAppEnvioManual />
              </TabsContent>
              <TabsContent value="automacoes">
                <WhatsAppFlows embedded />
              </TabsContent>
              <TabsContent value="historico">
                <WhatsAppHistorico />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* =================== E-MAIL TAB =================== */}
          <TabsContent value="email" className="space-y-6">
            <Tabs defaultValue="dashboard" className="space-y-4">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                <TabsList>
                  <TabsTrigger value="dashboard" className="gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5" />
                    Dashboard
                  </TabsTrigger>
                  <TabsTrigger value="resend" className="gap-1.5">
                    <Settings className="h-3.5 w-3.5" />
                    Resend
                  </TabsTrigger>
                  <TabsTrigger value="smtp" className="gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    SMTP
                  </TabsTrigger>
                  <TabsTrigger value="templates" className="gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    Templates
                  </TabsTrigger>
                  <TabsTrigger value="regras" className="gap-1.5">
                    <Target className="h-3.5 w-3.5" />
                    Regras
                  </TabsTrigger>
                </TabsList>
                <div className="flex items-center gap-3 bg-muted/50 px-4 py-2.5 rounded-lg border shrink-0">
                  <Label className="text-sm font-medium cursor-pointer whitespace-nowrap" htmlFor="email-auto-toggle">
                    Envio Automático
                  </Label>
                  <Checkbox
                    id="email-auto-toggle"
                    checked={emailAuto.enabled}
                    onCheckedChange={handleToggleEmailAuto}
                  />
                </div>
              </div>

              <TabsContent value="dashboard">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium">Total Enviados</CardTitle>
                        <Send className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{stats.total}</div>
                      <p className="text-xs text-muted-foreground">Histórico completo</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium">Com Sucesso</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-600">{stats.enviados}</div>
                      <p className="text-xs text-muted-foreground">Emails entregues</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium">Na Fila</CardTitle>
                        <Clock className="h-4 w-4 text-yellow-600" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-yellow-600">{stats.pendentes}</div>
                      <p className="text-xs text-muted-foreground">Aguardando envio</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium">Falhados</CardTitle>
                        <XCircle className="h-4 w-4 text-red-600" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-red-600">{stats.falhados}</div>
                      <p className="text-xs text-muted-foreground">Erros de envio</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Taxa de Sucesso</CardTitle>
                      <CardDescription>Porcentagem de emails enviados com sucesso</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Taxa de entrega</span>
                        <span className="text-2xl font-bold">{stats.taxaSucesso}%</span>
                      </div>
                      <Progress value={stats.taxaSucesso} className="h-2" />
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                        <div>
                          <p className="text-sm text-muted-foreground">Enviados</p>
                          <p className="text-xl font-semibold text-green-600">{stats.enviados}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Falhados</p>
                          <p className="text-xl font-semibold text-red-600">{stats.falhados}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Controle da Fila</CardTitle>
                      <CardDescription>Gerencie emails pendentes de envio</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Alert>
                        <Clock className="h-4 w-4" />
                        <AlertDescription>
                          Existem <strong>{stats.pendentes}</strong> email(s) aguardando processamento na fila.
                        </AlertDescription>
                      </Alert>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-background flex items-center justify-center">
                              <Mail className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">Processamento Automático</p>
                              <p className="text-xs text-muted-foreground">A cada 5 minutos</p>
                            </div>
                          </div>
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            Ativo
                          </Badge>
                        </div>

                        <Button
                          onClick={handleProcessarFila}
                          disabled={processandoFila || stats.pendentes === 0}
                          className="w-full"
                        >
                          {processandoFila ? (
                            <>
                              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                              Processando...
                            </>
                          ) : (
                            <>
                              <Send className="mr-2 h-4 w-4" />
                              Processar Fila Agora
                            </>
                          )}
                        </Button>
                      </div>

                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          <strong>Importante:</strong> Certifique-se de ter configurado corretamente o SMTP (Hostinger)
                          ou Resend antes de processar a fila.
                        </AlertDescription>
                      </Alert>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                  {/* Resend Monthly Limit */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base">Limite Mensal</CardTitle>
                          <CardDescription>Free — 3.000 emails/mês</CardDescription>
                        </div>
                        <Badge variant="outline">Free</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Monthly limit</span>
                        <span className="text-lg font-bold">
                          {resendUsage?.monthly?.sending ?? stats.enviados} / {resendUsage?.monthly?.limit ?? 3000}
                        </span>
                      </div>
                      <Progress
                        value={((resendUsage?.monthly?.sending ?? stats.enviados) / (resendUsage?.monthly?.limit ?? 3000)) * 100}
                        className="h-2"
                      />
                      <div className="space-y-2 pt-2 border-t">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Sending</span>
                          <span className="font-medium">{resendUsage?.monthly?.sending ?? stats.enviados}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Falhados</span>
                          <span className="font-medium text-destructive">{resendUsage?.monthly?.failed ?? stats.falhados}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Resend Daily Limit */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base">Limite Diário</CardTitle>
                          <CardDescription>Free — 100 emails/dia</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => { loadResendUsage(); loadStats(); }}>
                          <RefreshCw className="h-3.5 w-3.5 mr-1" />
                          Atualizar
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Daily limit</span>
                        <span className="text-lg font-bold">
                          {resendUsage?.daily?.sending ?? 0} / {resendUsage?.daily?.limit ?? 100}
                        </span>
                      </div>
                      <Progress
                        value={((resendUsage?.daily?.sending ?? 0) / (resendUsage?.daily?.limit ?? 100)) * 100}
                        className="h-2"
                      />
                      <div className="space-y-2 pt-2 border-t">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Sending</span>
                          <span className="font-medium">{resendUsage?.daily?.sending ?? 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Falhados</span>
                          <span className="font-medium text-destructive">{resendUsage?.daily?.failed ?? 0}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Informações do Sistema */}
                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle>Informações do Sistema</CardTitle>
                    <CardDescription>Status e configurações de envio</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="flex items-start gap-3 p-4 border rounded-lg">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Mail className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">Método Principal</p>
                          <p className="text-xs text-muted-foreground mt-1">Resend API (Primário)</p>
                          <p className="text-xs text-muted-foreground">Fallback: SMTP</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-4 border rounded-lg">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Target className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">Envio Automático</p>
                          <Badge variant={emailAuto.enabled ? "default" : "secondary"} className="mt-1">
                            {emailAuto.enabled ? "Ativo" : "Inativo"}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1">
                            {emailAuto.enabled ? "Dispara ao mudar status" : "Desabilitado"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-4 border rounded-lg">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">Templates Ativos</p>
                          <p className="text-2xl font-bold text-primary mt-1">
                            {templates.filter((t) => t.ativo).length}
                          </p>
                          <p className="text-xs text-muted-foreground">de {templates.length} total</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Fila de Emails */}
                {emailQueue.length > 0 && (
                  <Card className="mt-6">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>Fila de Emails</CardTitle>
                          <CardDescription>Emails aguardando processamento</CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                          {emailQueue.filter((e) => e.status === "pendente").length} pendente(s)
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 max-h-[400px] overflow-y-auto">
                        {emailQueue.slice(0, 20).map((email) => (
                          <div key={email.id} className="flex items-start gap-3 p-3 border rounded-lg">
                            <div
                              className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                email.status === "pendente"
                                  ? "bg-yellow-100"
                                  : email.status === "enviado"
                                    ? "bg-green-100"
                                    : "bg-red-100"
                              }`}
                            >
                              {email.status === "pendente" ? (
                                <Clock className="h-4 w-4 text-yellow-600" />
                              ) : email.status === "enviado" ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-600" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm truncate">{email.assunto}</p>
                                <Badge variant="outline" className="text-xs shrink-0">
                                  {email.tipo}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">Para: {email.destinatario}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(email.created_at).toLocaleString("pt-BR")}
                                {email.tentativas > 0 && ` • ${email.tentativas} tentativa(s)`}
                              </p>
                              {email.erro_mensagem && (
                                <p className="text-xs text-red-600 mt-1">{email.erro_mensagem}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Últimos Emails Enviados */}
                <Card className="mt-6">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Últimos Emails Enviados</CardTitle>
                        <CardDescription>Histórico recente de envios do sistema</CardDescription>
                      </div>
                      <Badge variant="outline">{historico.length} registro(s)</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {historico.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Nenhum email enviado ainda</p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[500px] overflow-y-auto">
                        {historico.slice(0, 30).map((email) => (
                          <div key={email.id} className="flex items-start gap-3 p-3 border rounded-lg">
                            <div
                              className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                email.status === "enviado" ? "bg-green-100" : "bg-red-100"
                              }`}
                            >
                              {email.status === "enviado" ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-600" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm truncate">{email.assunto}</p>
                                <Badge
                                  variant={email.status === "enviado" ? "default" : "destructive"}
                                  className="text-xs shrink-0"
                                >
                                  {email.status === "enviado" ? "Enviado" : "Erro"}
                                </Badge>
                                {email.corpo?.startsWith("[Resend]") && (
                                  <Badge variant="outline" className="text-xs shrink-0">Resend</Badge>
                                )}
                                {email.corpo?.startsWith("[SMTP]") && (
                                  <Badge variant="outline" className="text-xs shrink-0">SMTP</Badge>
                                )}
                                {!email.atendimento_id && (
                                  <Badge variant="secondary" className="text-xs shrink-0">Sistema</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">Para: {email.destinatario}</p>
                              <p className="text-xs text-muted-foreground">
                                {email.enviado_em
                                  ? new Date(email.enviado_em).toLocaleString("pt-BR")
                                  : new Date(email.created_at).toLocaleString("pt-BR")}
                                {email.atendimentos?.assunto && ` • ${email.atendimentos.assunto}`}
                              </p>
                              {email.erro_mensagem && (
                                <p className="text-xs text-red-600 mt-1">{email.erro_mensagem}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="resend">
                <Card>
                  <CardHeader>
                    <CardTitle>Configuração do Resend</CardTitle>
                    <CardDescription>
                      Configure o domínio e nome do remetente para envios automáticos (via Resend API)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Alert>
                      <AlertDescription>
                        <strong>Importante:</strong> Você precisa de uma API key válida do Resend. Configure em Settings
                        → Secrets com o nome <code className="bg-muted px-1 py-0.5 rounded">RESEND_API_KEY</code>
                      </AlertDescription>
                    </Alert>

                    <div className="space-y-2">
                      <Label>E-mail do remetente *</Label>
                      <Input
                        type="email"
                        placeholder="noreply@seudominio.com"
                        value={resendConfig.from_email}
                        onChange={(e) => setResendConfig({ ...resendConfig, from_email: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">Use um domínio verificado no Resend</p>
                    </div>

                    <div className="space-y-2">
                      <Label>Nome do remetente *</Label>
                      <Input
                        placeholder="Atendimentos - Sua Empresa"
                        value={resendConfig.from_name}
                        onChange={(e) => setResendConfig({ ...resendConfig, from_name: e.target.value })}
                      />
                    </div>

                    <Button onClick={handleSaveResendConfig} className="w-full gap-2">
                      <Save className="h-4 w-4" />
                      Salvar Configuração
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="smtp">
                <Card>
                  <CardHeader>
                    <CardTitle>Configuração SMTP</CardTitle>
                    <CardDescription>
                      Configure seu servidor SMTP para envios manuais de emails (Gmail, Outlook, Hostinger, etc.)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Alert>
                      <AlertDescription>
                        <strong>Dica de Configuração:</strong>
                        <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                          <li>
                            <strong>Gmail:</strong> smtp.gmail.com (porta 587 TLS) + senha de aplicativo
                          </li>
                          <li>
                            <strong>Outlook/Hotmail:</strong> smtp-mail.outlook.com (porta 587 TLS)
                          </li>
                          <li>
                            <strong>Hostinger:</strong> smtp.hostinger.com (porta 465 SSL ou 587 TLS)
                          </li>
                        </ul>
                      </AlertDescription>
                    </Alert>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Servidor SMTP *</Label>
                        <Input
                          placeholder="smtp.gmail.com"
                          value={smtpConfig.smtp_host}
                          onChange={(e) => setSmtpConfig({ ...smtpConfig, smtp_host: e.target.value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Porta *</Label>
                        <Input
                          type="number"
                          placeholder="587"
                          value={smtpConfig.smtp_port}
                          onChange={(e) => setSmtpConfig({ ...smtpConfig, smtp_port: parseInt(e.target.value) || 587 })}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Usuário / Email *</Label>
                      <Input
                        type="email"
                        placeholder="seu@email.com"
                        value={smtpConfig.smtp_user}
                        onChange={(e) => setSmtpConfig({ ...smtpConfig, smtp_user: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Senha / Senha de App *</Label>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        value={smtpConfig.smtp_password}
                        onChange={(e) => setSmtpConfig({ ...smtpConfig, smtp_password: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>E-mail do remetente *</Label>
                      <Input
                        type="email"
                        placeholder="seu@email.com"
                        value={smtpConfig.from_email}
                        onChange={(e) => setSmtpConfig({ ...smtpConfig, from_email: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Nome do remetente *</Label>
                      <Input
                        placeholder="Sua Empresa"
                        value={smtpConfig.from_name}
                        onChange={(e) => setSmtpConfig({ ...smtpConfig, from_name: e.target.value })}
                      />
                    </div>

                    <Button onClick={handleSaveSMTPConfig} className="w-full gap-2">
                      <Save className="h-4 w-4" />
                      Salvar Configuração SMTP
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="templates" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>{editandoTemplate ? "Editar" : "Novo"} Template</CardTitle>
                    <CardDescription>Crie templates de e-mail para diferentes status</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Tipo de Template *</Label>
                        <select
                          className="w-full border rounded-md p-2 bg-background text-foreground"
                          value={novoTemplate.tipo}
                          onChange={(e) =>
                            setNovoTemplate({
                              ...novoTemplate,
                              tipo: e.target.value as TemplateTipo,
                              categoria: e.target.value,
                            })
                          }
                        >
                          <option value="atendimento">Atendimento</option>
                          <option value="boas_vindas">Boas-vindas Portal</option>
                          <option value="relatorio">Relatório</option>
                          <option value="convite_reuniao">Convite de Reunião</option>
                          <option value="alerta_performance">Alerta de Performance</option>
                          <option value="recuperacao">Recuperação de Senha</option>
                          <option value="ouvidoria">Ouvidoria - Recebimento</option>
                          <option value="ouvidoria_finalizado">Ouvidoria - Finalizado</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label>Frequência de Envio</Label>
                        <select
                          className="w-full border rounded-md p-2 bg-background text-foreground"
                          value={novoTemplate.frequencia}
                          onChange={(e) =>
                            setNovoTemplate({
                              ...novoTemplate,
                              frequencia: e.target.value as TemplateFrequencia,
                            })
                          }
                        >
                          <option value="manual">Manual</option>
                          <option value="diario">Diário</option>
                          <option value="semanal">Semanal</option>
                          <option value="mensal">Mensal</option>
                        </select>
                        <p className="text-xs text-muted-foreground">
                          {novoTemplate.frequencia === "manual" && "Enviado apenas manualmente ou por trigger"}
                          {novoTemplate.frequencia === "diario" && "Enviado automaticamente todos os dias"}
                          {novoTemplate.frequencia === "semanal" && "Enviado automaticamente toda semana"}
                          {novoTemplate.frequencia === "mensal" && "Enviado automaticamente todo mês"}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Nome do Template *</Label>
                      <Input
                        placeholder="Ex: Atendimento Concluído"
                        value={novoTemplate.nome}
                        onChange={(e) => setNovoTemplate({ ...novoTemplate, nome: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Assunto do E-mail *</Label>
                      <Input
                        placeholder="Ex: Seu atendimento foi concluído"
                        value={novoTemplate.assunto}
                        onChange={(e) => setNovoTemplate({ ...novoTemplate, assunto: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Mensagem *</Label>
                      <Textarea
                        rows={6}
                        placeholder="Digite a mensagem do template..."
                        value={novoTemplate.corpo}
                        onChange={(e) => setNovoTemplate({ ...novoTemplate, corpo: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Variáveis disponíveis: 
                        {novoTemplate.tipo === "atendimento" && " {assunto}, {status}, {corretora}"}
                        {novoTemplate.tipo === "boas_vindas" && " {nome_usuario}, {nome_corretora}, {link_portal}"}
                        {novoTemplate.tipo === "relatorio" && " {periodo}, {total_atendimentos}, {taxa_conclusao}, {nome_corretora}"}
                        {novoTemplate.tipo === "convite_reuniao" && " {nome_convidado}, {nome_reuniao}, {data_reuniao}, {link_reuniao}, {organizador}, {descricao}, {duracao}, {rsvp_sim}, {rsvp_talvez}, {rsvp_nao}, {google_calendar_url}"}
                        {novoTemplate.tipo === "alerta_performance" && " {nome_responsavel}, {tipo_alerta}, {valor_atual}, {meta}"}
                        {novoTemplate.tipo === "recuperacao" && " {link_recuperacao}, {nome_usuario}"}
                        {novoTemplate.tipo === "ouvidoria" && " {protocolo}, {nome_cliente}, {nome_associacao}, {tipo}, {data}, {cor_primaria}"}
                        {novoTemplate.tipo === "ouvidoria_finalizado" && " {protocolo}, {nome_cliente}, {nome_associacao}, {tipo}, {status}, {resposta}, {data}, {cor_primaria}"}
                      </p>
                    </div>

                    {novoTemplate.tipo === "atendimento" && (
                      <div className="space-y-2">
                        <Label>Status que usam este template</Label>
                        <div className="grid grid-cols-2 gap-4">
                          {availableStatus.map((status) => (
                            <div key={status} className="flex items-center space-x-2">
                              <Checkbox
                                checked={novoTemplate.status.includes(status)}
                                onCheckedChange={() => toggleStatus(status)}
                              />
                              <Label>{status}</Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button onClick={handleSaveTemplate} className="flex-1">
                        <Save className="mr-2 h-4 w-4" />
                        {editandoTemplate ? "Atualizar" : "Criar"} Template
                      </Button>
                      {novoTemplate.corpo && (
                        <Button variant="outline" onClick={() => openEmailPreview(novoTemplate.corpo)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Prévia
                        </Button>
                      )}
                      {editandoTemplate && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditandoTemplate(null);
                            setNovoTemplate({
                              nome: "",
                              assunto: "",
                              corpo: "",
                              status: [] as string[],
                              ativo: true,
                              tipo: "atendimento",
                              categoria: "atendimento",
                              frequencia: "manual",
                            });
                          }}
                        >
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Templates Salvos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {templates.map((template) => (
                        <div key={template.id} className="border rounded-lg p-4 space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold">{template.nome}</h4>
                                <Badge variant="outline" className="text-xs capitalize">
                                  {template.tipo?.replace(/_/g, ' ') || 'atendimento'}
                                </Badge>
                                {template.frequencia && template.frequencia !== 'manual' && (
                                  <Badge variant="secondary" className="text-xs capitalize">
                                    <Clock className="h-3 w-3 mr-1" />
                                    {template.frequencia}
                                  </Badge>
                                )}
                                {!template.ativo && (
                                  <Badge variant="destructive" className="text-xs">Inativo</Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">{template.assunto}</p>
                              <div className="flex gap-1 mt-2">
                                {template.status?.map((s) => (
                                  <Badge key={s} variant="secondary" className="text-xs">
                                    {s}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openEmailPreview(template.corpo)} title="Prévia">
                                <Eye className="h-4 w-4 text-primary" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleEditTemplate(template)}>
                                Editar
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleDeleteTemplate(template.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {templates.length === 0 && (
                        <p className="text-center text-muted-foreground py-8">Nenhum template criado ainda</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="regras">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      Regras de Disparo Automático
                    </CardTitle>
                    <CardDescription>Configure quando os e-mails devem ser enviados automaticamente</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Alertas de Performance */}
                    <div className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        <h3 className="font-semibold">Alertas de Performance</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">Emails são enviados automaticamente quando:</p>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                          <span>
                            <strong>Volume Baixo:</strong> Quando o número de atendimentos está abaixo da meta mínima
                            estabelecida
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                          <span>
                            <strong>Taxa de Conclusão Baixa:</strong> Quando a taxa de conclusão está abaixo do
                            percentual esperado
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                          <span>
                            <strong>Tempo Médio Alto:</strong> Quando o tempo médio de resolução excede o limite
                            configurado
                          </span>
                        </li>
                      </ul>
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground">
                          <strong>Destinatários:</strong> Responsável, Líder, Administrativo e Superintendentes
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          <strong>Período de Análise:</strong> Últimos 30 dias
                        </p>
                      </div>
                    </div>

                    {/* Mudanças de Status */}
                    <div className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Mail className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold">Mudanças de Status de Atendimento</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">Emails são enviados automaticamente quando:</p>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                          <span>
                            O status de um atendimento é alterado e existe um template ativo configurado para aquele
                            status
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                          <span>O envio automático está ativado na configuração</span>
                        </li>
                      </ul>
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground">
                          <strong>Destinatário:</strong> Email da corretora vinculada ao atendimento
                        </p>
                      </div>
                    </div>

                    <Alert>
                      <AlertDescription>
                        <strong>Dica:</strong> Para configurar as metas de performance que acionam os alertas, acesse o{" "}
                        <strong>Dashboard Analytics → Metas</strong>
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              </TabsContent>

            </Tabs>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
