import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  CheckCircle2, Clock, XCircle, Copy, User, MessageCircle, Download, Mail, 
  FileText, History, Users, Calendar, DollarSign, MapPin, Globe, Hash
} from "lucide-react";
import { toast } from "sonner";
import { downloadContratoPDF } from "./utils/downloadContratoPDF";
import { openWhatsApp } from "@/utils/whatsapp";

interface VisualizarContratoDialogProps {
  contrato: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  pendente: {
    label: "Pendente",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500/10",
    icon: <Clock className="h-4 w-4" />,
  },
  assinado: {
    label: "Assinado",
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-500/10",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  recusado: {
    label: "Recusado",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-500/10",
    icon: <XCircle className="h-4 w-4" />,
  },
};

const contratoStatusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  rascunho: { label: "Rascunho", color: "text-muted-foreground", bgColor: "bg-muted" },
  aguardando_assinatura: { label: "Aguardando Assinatura", color: "text-amber-600", bgColor: "bg-amber-500/10" },
  assinado: { label: "Assinado", color: "text-emerald-600", bgColor: "bg-emerald-500/10" },
  cancelado: { label: "Cancelado", color: "text-red-600", bgColor: "bg-red-500/10" },
  expirado: { label: "Expirado", color: "text-gray-600", bgColor: "bg-gray-500/10" },
};

export default function VisualizarContratoDialog({ contrato, open, onOpenChange }: VisualizarContratoDialogProps) {
  const { data: historico } = useQuery({
    queryKey: ["contrato_historico", contrato?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contrato_historico")
        .select("*")
        .eq("contrato_id", contrato.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open && !!contrato?.id,
  });

  const assinaturas = contrato?.contrato_assinaturas || [];
  const contratoStatus = contratoStatusConfig[contrato?.status] || contratoStatusConfig.rascunho;

  const copyLink = () => {
    if (!contrato.link_token) {
      toast.error("Link ainda não disponível. Envie o contrato para assinatura primeiro.");
      return;
    }
    const link = `${window.location.origin}/contrato/${contrato.link_token}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copiado!");
  };

  const sendWhatsApp = () => {
    if (!contrato.link_token) {
      toast.error("Link ainda não disponível. Envie o contrato para assinatura primeiro.");
      return;
    }
    const link = `${window.location.origin}/contrato/${contrato.link_token}`;
    openWhatsApp({
      phone: contrato.contratante_telefone,
      message: `Olá ${contrato.contratante_nome || ""}!\n\nSegue o link para assinatura do contrato "${contrato.titulo}":\n\n${link}\n\nAtenciosamente.`
    });
  };

  const sendEmail = () => {
    if (!contrato.link_token) {
      toast.error("Link ainda não disponível. Envie o contrato para assinatura primeiro.");
      return;
    }
    const link = `${window.location.origin}/contrato/${contrato.link_token}`;
    const subject = encodeURIComponent(`Contrato para assinatura: ${contrato.titulo}`);
    const body = encodeURIComponent(
      `Olá ${contrato.contratante_nome || ""}!\n\nSegue o link para assinatura do contrato "${contrato.titulo}":\n\n${link}\n\nAtenciosamente.`,
    );
    const mailtoUrl = `mailto:${contrato.contratante_email || ""}?subject=${subject}&body=${body}`;
    window.open(mailtoUrl, "_blank");
  };

  const handleDownloadPDF = () => {
    downloadContratoPDF({ ...contrato, contrato_assinaturas: assinaturas }, contrato?.contrato_templates?.logo_url);
  };

  const hasLink = contrato?.status === "aguardando_assinatura" || contrato?.link_token;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 bg-gradient-to-r from-primary/5 via-primary/3 to-transparent border-b">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold">{contrato?.titulo}</DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="font-mono text-xs">
                  {contrato?.numero}
                </Badge>
                <Badge className={`${contratoStatus.bgColor} ${contratoStatus.color} border-0`}>
                  {contratoStatus.label}
                </Badge>
              </div>
            </div>
          </div>
          
          {/* Quick Actions */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleDownloadPDF} className="h-8">
              <Download className="h-3.5 w-3.5 mr-1.5" /> PDF
            </Button>
            {hasLink && (
              <>
                <Button variant="outline" size="sm" onClick={copyLink} className="h-8">
                  <Copy className="h-3.5 w-3.5 mr-1.5" /> Link
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={sendWhatsApp} 
                  className="h-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                >
                  <MessageCircle className="h-3.5 w-3.5 mr-1.5" /> WhatsApp
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={sendEmail} 
                  className="h-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                >
                  <Mail className="h-3.5 w-3.5 mr-1.5" /> E-mail
                </Button>
              </>
            )}
          </div>
        </DialogHeader>

        {/* Content */}
        <Tabs defaultValue="documento" className="w-full">
          <div className="px-6 pt-4 border-b bg-muted/30">
            <TabsList className="h-10 w-full justify-start bg-transparent p-0 gap-4">
              <TabsTrigger 
                value="documento" 
                className="h-10 px-0 pb-3 pt-0 data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary rounded-none"
              >
                <FileText className="h-4 w-4 mr-2" />
                Documento
              </TabsTrigger>
              <TabsTrigger 
                value="assinaturas"
                className="h-10 px-0 pb-3 pt-0 data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary rounded-none"
              >
                <Users className="h-4 w-4 mr-2" />
                Assinaturas
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                  {assinaturas.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger 
                value="historico"
                className="h-10 px-0 pb-3 pt-0 data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary rounded-none"
              >
                <History className="h-4 w-4 mr-2" />
                Histórico
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="h-[60vh]">
            <TabsContent value="documento" className="m-0 p-6 animate-in fade-in-50 duration-200">
              {/* Info Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <InfoCard 
                  icon={<User className="h-4 w-4" />}
                  label="Contratante"
                  value={contrato?.contratante_nome || "-"}
                />
                <InfoCard 
                  icon={<Mail className="h-4 w-4" />}
                  label="E-mail"
                  value={contrato?.contratante_email || "-"}
                />
                <InfoCard 
                  icon={<Hash className="h-4 w-4" />}
                  label="CPF/CNPJ"
                  value={contrato?.contratante_cpf || contrato?.contratante_cnpj || "-"}
                />
                <InfoCard 
                  icon={<DollarSign className="h-4 w-4" />}
                  label="Valor"
                  value={contrato?.valor_contrato
                    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(contrato.valor_contrato)
                    : "-"
                  }
                />
                <InfoCard 
                  icon={<Calendar className="h-4 w-4" />}
                  label="Início"
                  value={contrato?.data_inicio ? format(new Date(contrato.data_inicio), "dd/MM/yyyy") : "-"}
                />
                <InfoCard 
                  icon={<Calendar className="h-4 w-4" />}
                  label="Fim"
                  value={contrato?.data_fim ? format(new Date(contrato.data_fim), "dd/MM/yyyy") : "-"}
                />
              </div>

              {/* Document Preview */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Prévia do Documento
                </h4>
                <div
                  className="prose prose-sm max-w-none border rounded-xl p-6 bg-white text-black shadow-sm"
                  style={{ background: "#ffffff", color: "#222", fontFamily: "inherit", lineHeight: 1.5 }}
                  dangerouslySetInnerHTML={{ __html: contrato?.conteudo_html || "" }}
                />
              </div>
            </TabsContent>

            <TabsContent value="assinaturas" className="m-0 p-6 animate-in fade-in-50 duration-200">
              {assinaturas.length === 0 ? (
                <EmptyState 
                  icon={<Users className="h-8 w-8" />}
                  title="Nenhum signatário"
                  description="Este contrato ainda não possui signatários cadastrados"
                />
              ) : (
                <div className="space-y-3">
                  {assinaturas.map((assinatura: any, index: number) => {
                    const status = statusConfig[assinatura.status] || statusConfig.pendente;
                    return (
                      <div 
                        key={assinatura.id} 
                        className="group border rounded-xl p-4 hover:shadow-md transition-all duration-200 bg-card"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className={`h-12 w-12 rounded-full ${status.bgColor} flex items-center justify-center shrink-0`}>
                              <span className={status.color}>{status.icon}</span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{assinatura.nome}</span>
                                <Badge variant="outline" className="text-xs capitalize">
                                  {assinatura.tipo}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{assinatura.email}</p>
                              {assinatura.cpf && (
                                <p className="text-xs text-muted-foreground mt-0.5">CPF: {assinatura.cpf}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge className={`${status.bgColor} ${status.color} border-0`}>
                              {status.label}
                            </Badge>
                            {assinatura.assinado_em && (
                              <p className="text-xs text-muted-foreground mt-1.5">
                                {format(new Date(assinatura.assinado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                              </p>
                            )}
                          </div>
                        </div>

                        {assinatura.assinatura_url && (
                          <div className="mt-4 pt-4 border-t">
                            <p className="text-xs font-medium text-muted-foreground mb-2">Assinatura Digital</p>
                            <div className="inline-block bg-white border rounded-lg p-2">
                              <img 
                                src={assinatura.assinatura_url} 
                                alt="Assinatura" 
                                className="max-h-16 object-contain" 
                              />
                            </div>
                          </div>
                        )}

                        {assinatura.status === "assinado" && (
                          <div className="mt-3 pt-3 border-t grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                            {assinatura.ip_assinatura && (
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Globe className="h-3 w-3" />
                                <span>IP: {assinatura.ip_assinatura}</span>
                              </div>
                            )}
                            {assinatura.hash_documento && (
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Hash className="h-3 w-3" />
                                <span className="truncate">Hash: {assinatura.hash_documento.substring(0, 16)}...</span>
                              </div>
                            )}
                            {assinatura.latitude && assinatura.longitude && (
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <MapPin className="h-3 w-3" />
                                <span>{assinatura.latitude.toFixed(4)}, {assinatura.longitude.toFixed(4)}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="historico" className="m-0 p-6 animate-in fade-in-50 duration-200">
              {!historico || historico.length === 0 ? (
                <EmptyState 
                  icon={<History className="h-8 w-8" />}
                  title="Nenhum registro"
                  description="O histórico de ações deste contrato aparecerá aqui"
                />
              ) : (
                <div className="relative">
                  <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />
                  <div className="space-y-4">
                    {historico.map((item: any, index: number) => (
                      <div key={item.id} className="relative pl-10">
                        <div className="absolute left-2 top-1.5 w-3.5 h-3.5 rounded-full bg-primary ring-4 ring-background" />
                        <div className="bg-muted/50 rounded-lg p-4 hover:bg-muted/70 transition-colors">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium capitalize text-sm">{item.acao}</span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(item.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                          {item.descricao && (
                            <p className="text-sm text-muted-foreground">{item.descricao}</p>
                          )}
                          {item.ip && (
                            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                              <Globe className="h-3 w-3" /> {item.ip}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
      <div className="h-8 w-8 rounded-md bg-background flex items-center justify-center shrink-0 text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium text-sm truncate">{value}</p>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground mb-4">
        {icon}
      </div>
      <h3 className="font-medium text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
    </div>
  );
}
