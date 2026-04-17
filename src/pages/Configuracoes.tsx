import { useState, useEffect } from "react";
import { useAppConfig } from "@/hooks/useAppConfig";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { 
  Palette, Image as ImageIcon, Settings, Shield, Bell, 
  Monitor, Moon, Sun, Upload, RotateCcw, Save, Eye,
  Globe, Lock, Mail, Smartphone, Users
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import Usuarios from "@/pages/Usuarios";

interface ConfigColors {
  primary: string;
  statusNovo: string;
  statusAndamento: string;
  statusAguardo: string;
  statusConcluido: string;
  priorityAlta: string;
  priorityMedia: string;
  priorityBaixa: string;
  sidebarBackground?: string;
  sidebarForeground?: string;
  sidebarAccent?: string;
}

interface ImageUploadState {
  logo: string;
  login: string;
}

const defaultColors: ConfigColors = {
  primary: "#3b82f6",
  statusNovo: "#3b82f6",
  statusAndamento: "#f59e0b",
  statusAguardo: "#a855f7",
  statusConcluido: "#22c55e",
  priorityAlta: "#ef4444",
  priorityMedia: "#f59e0b",
  priorityBaixa: "#22c55e",
  sidebarBackground: "#fafafa",
  sidebarForeground: "#1e293b",
  sidebarAccent: "#f1f5f9",
};

const COLOR_GROUPS = [
  {
    title: "Geral",
    items: [
      { key: "primary", label: "Cor Primária", description: "Botões, links e destaques" },
    ],
  },
  {
    title: "Status dos Atendimentos",
    items: [
      { key: "statusNovo", label: "Novo", description: "Tickets recém-criados" },
      { key: "statusAndamento", label: "Em Andamento", description: "Tickets em progresso" },
      { key: "statusAguardo", label: "Aguardando", description: "Tickets em espera" },
      { key: "statusConcluido", label: "Concluído", description: "Tickets finalizados" },
    ],
  },
  {
    title: "Prioridades",
    items: [
      { key: "priorityAlta", label: "Alta", description: "Urgência máxima" },
      { key: "priorityMedia", label: "Média", description: "Urgência moderada" },
      { key: "priorityBaixa", label: "Baixa", description: "Sem urgência" },
    ],
  },
];

export default function Configuracoes() {
  const { config, saveConfig, applyColors } = useAppConfig();
  const { user } = useAuth();
  const [tempColors, setTempColors] = useState<ConfigColors>(config.colors);
  const [imageUrls, setImageUrls] = useState<ImageUploadState>({ logo: config.logo_url || "", login: "" });
  const [activeSection, setActiveSection] = useState("aparencia");

  useEffect(() => {
    setTempColors(config.colors);
    loadImages();
  }, [config]);

  const loadImages = async () => {
    if (!user) return;
    try {
      const { data: configData } = await supabase
        .from("app_config")
        .select("login_image_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (configData?.login_image_url) {
        setImageUrls((prev) => ({ ...prev, login: configData.login_image_url }));
      }
    } catch (error) { console.error("Error loading images:", error); }
  };

  const handleImageUpload = async (file: File, type: "logo" | "login") => {
    if (!user) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Arquivo muito grande. Máximo 2MB."); return; }
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}-${type}-${Date.now()}.${fileExt}`;
      const filePath = `${type}/${fileName}`;
      const { error: uploadError } = await supabase.storage.from("app-config").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("app-config").getPublicUrl(filePath);
      if (type === "logo") {
        await saveConfig({ logo_url: publicUrl });
        setImageUrls((prev) => ({ ...prev, logo: publicUrl }));
      } else {
        await saveConfig({ login_image_url: publicUrl });
        setImageUrls((prev) => ({ ...prev, login: publicUrl }));
      }
      toast.success("Imagem atualizada!");
    } catch (error) { toast.error("Erro ao fazer upload."); }
  };

  const handleSaveColors = async () => {
    try {
      await saveConfig({ colors: tempColors });
      toast.success("Cores salvas!");
    } catch (error) { toast.error("Erro ao salvar cores."); }
  };

  const handleResetColors = () => {
    setTempColors(defaultColors);
    applyColors(defaultColors);
    toast.success("Cores resetadas!");
  };

  const { userRole } = useAuth();
  const canManageUsers = userRole === "admin" || userRole === "administrativo" || userRole === "superintendente";

  const sections = [
    { id: "aparencia", label: "Aparência", icon: Palette, description: "Cores e personalização visual" },
    { id: "imagens", label: "Imagens", icon: ImageIcon, description: "Logo e imagem de login" },
    ...(canManageUsers ? [{ id: "usuarios", label: "Usuários", icon: Users, description: "Gerenciar usuários e permissões" }] : []),
    { id: "seguranca", label: "Segurança", icon: Shield, description: "Configurações de acesso" },
    { id: "notificacoes", label: "Notificações", icon: Bell, description: "Alertas e avisos" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        <PageHeader
          icon={Settings}
          title="Configurações"
          subtitle="Personalize e controle o sistema"
        />

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Sidebar Navigation */}
          <div className="space-y-1.5">
            {sections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    isActive
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                    isActive ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{section.label}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{section.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="space-y-6">
            {/* APARÊNCIA */}
            {activeSection === "aparencia" && (
              <>
                <div className="rounded-2xl border border-border/50 bg-card p-5 sm:p-6 space-y-6">
                  <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Palette className="h-5 w-5 text-primary" />
                      Personalização de Cores
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">Ajuste as cores do sistema</p>
                  </div>

                  {COLOR_GROUPS.map((group) => (
                    <div key={group.title} className="space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.title}</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {group.items.map((item) => (
                          <div key={item.key} className="flex items-center gap-3 rounded-xl border border-border/50 p-3 bg-muted/10 hover:bg-muted/20 transition-colors">
                            <div className="relative">
                              <input
                                type="color"
                                value={(tempColors as any)[item.key] || "#3b82f6"}
                                onChange={(e) => setTempColors({ ...tempColors, [item.key]: e.target.value })}
                                className="h-10 w-10 rounded-lg border-2 border-border cursor-pointer appearance-none bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-0"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{item.label}</p>
                              <p className="text-[11px] text-muted-foreground">{item.description}</p>
                            </div>
                            <Input
                              type="text"
                              value={(tempColors as any)[item.key] || ""}
                              onChange={(e) => setTempColors({ ...tempColors, [item.key]: e.target.value })}
                              className="w-24 h-8 text-xs font-mono rounded-lg"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="flex gap-3 pt-2">
                    <Button onClick={handleSaveColors} className="flex-1 rounded-xl gap-2">
                      <Save className="h-4 w-4" />
                      Salvar Cores
                    </Button>
                    <Button onClick={handleResetColors} variant="outline" className="rounded-xl gap-2">
                      <RotateCcw className="h-4 w-4" />
                      Resetar
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* IMAGENS */}
            {activeSection === "imagens" && (
              <div className="space-y-4">
                {/* Logo */}
                <div className="rounded-2xl border border-border/50 bg-card p-5 sm:p-6 space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Monitor className="h-5 w-5 text-primary" />
                      Logo do Sistema
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">Exibida no menu lateral e cabeçalhos</p>
                  </div>
                  {imageUrls.logo && (
                    <div className="flex justify-center p-6 bg-muted/20 rounded-xl border border-dashed border-border/50">
                      <img src={imageUrls.logo} alt="Logo" className="max-h-20 object-contain" />
                    </div>
                  )}
                  <Label htmlFor="logo-upload" className="cursor-pointer block">
                    <div className="border-2 border-dashed border-border/50 rounded-xl p-6 hover:border-primary/50 transition-colors text-center group">
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground group-hover:text-primary transition-colors" />
                      <p className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">Clique para enviar nova logo</p>
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG até 2MB</p>
                    </div>
                  </Label>
                  <Input id="logo-upload" type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageUpload(file, "logo"); }} />
                </div>

                {/* Login Image */}
                <div className="rounded-2xl border border-border/50 bg-card p-5 sm:p-6 space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <ImageIcon className="h-5 w-5 text-primary" />
                      Imagem de Login
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">Fundo da tela de autenticação</p>
                  </div>
                  {imageUrls.login && (
                    <div className="flex justify-center p-4 bg-muted/20 rounded-xl border border-dashed border-border/50">
                      <img src={imageUrls.login} alt="Login" className="max-h-40 object-contain rounded-lg" />
                    </div>
                  )}
                  <Label htmlFor="login-upload" className="cursor-pointer block">
                    <div className="border-2 border-dashed border-border/50 rounded-xl p-6 hover:border-primary/50 transition-colors text-center group">
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground group-hover:text-primary transition-colors" />
                      <p className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">Clique para enviar nova imagem</p>
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG até 2MB</p>
                    </div>
                  </Label>
                  <Input id="login-upload" type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageUpload(file, "login"); }} />
                </div>
              </div>
            )}

            {/* SEGURANÇA */}
            {activeSection === "seguranca" && (
              <div className="rounded-2xl border border-border/50 bg-card p-5 sm:p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Segurança e Acesso
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">Controle políticas de segurança</p>
                </div>

                <div className="space-y-3">
                  {[
                    { icon: Lock, title: "Autenticação de dois fatores", desc: "Requer verificação adicional no login", defaultOn: false },
                    { icon: Globe, title: "Sessão única por usuário", desc: "Desconectar sessões anteriores ao fazer login", defaultOn: true },
                    { icon: Smartphone, title: "Acesso mobile", desc: "Permitir login em dispositivos móveis", defaultOn: true },
                    { icon: Mail, title: "Notificar login suspeito", desc: "Enviar email ao detectar acesso de novo dispositivo", defaultOn: false },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-4 bg-muted/10 hover:bg-muted/20 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <item.icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{item.title}</p>
                          <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                        </div>
                      </div>
                      <Switch defaultChecked={item.defaultOn} onCheckedChange={() => toast.info("Configuração de segurança atualizada")} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* NOTIFICAÇÕES */}
            {activeSection === "notificacoes" && (
              <div className="rounded-2xl border border-border/50 bg-card p-5 sm:p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Bell className="h-5 w-5 text-primary" />
                    Notificações
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">Gerencie alertas e avisos do sistema</p>
                </div>

                <div className="space-y-3">
                  {[
                    { title: "Notificações por email", desc: "Receber alertas no email cadastrado", defaultOn: true },
                    { title: "Notificações push", desc: "Alertas no navegador em tempo real", defaultOn: true },
                    { title: "Resumo diário", desc: "Enviar resumo de atividades ao final do dia", defaultOn: false },
                    { title: "Alertas de vencimento", desc: "Notificar sobre boletos e prazos próximos", defaultOn: true },
                    { title: "Novos atendimentos", desc: "Alerta ao receber novo atendimento", defaultOn: true },
                    { title: "Mensagens WhatsApp", desc: "Notificar novas mensagens recebidas", defaultOn: true },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-4 bg-muted/10 hover:bg-muted/20 transition-colors">
                      <div>
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                      </div>
                      <Switch defaultChecked={item.defaultOn} onCheckedChange={() => toast.info("Preferência de notificação atualizada")} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
