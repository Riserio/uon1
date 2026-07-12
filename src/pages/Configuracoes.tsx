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
  Palette, Image as ImageIcon, Settings, Shield, Bell, BellOff,
  Monitor, Moon, Sun, Upload, RotateCcw, Save, Eye,
  Globe, Lock, Mail, Smartphone, Users, Share2, Blocks
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import Usuarios from "@/pages/Usuarios";
import { BrandingCompartilhamento } from "@/components/configuracoes/BrandingCompartilhamento";
import { GestaoModulosConfig } from "@/components/configuracoes/GestaoModulosConfig";
import { SegurancaAcessoConfig } from "@/components/configuracoes/SegurancaAcessoConfig";
import { generatePwaIconsFromFile, RECOMMENDED_ICON_SIZE_LABEL } from "@/lib/pwaIconGenerator";

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

interface AppIconUrls {
  icon192?: string;
  icon512?: string;
  icon512Maskable?: string;
  apple?: string;
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
  const [appIconUrls, setAppIconUrls] = useState<AppIconUrls>({});
  const [appIconLoading, setAppIconLoading] = useState(false);
  const [activeSection, setActiveSection] = useState("aparencia");

  // ---- Notificações push (OneSignal) — usuários internos ----
  // O useOneSignalInterno (rodando no AppLayout) já inicializa o SDK e tenta
  // o pedido automático (slidedown) uma vez por navegador. Esse automático
  // tem cooldown do próprio OneSignal e não reaparece a cada visita, então
  // esse botão manual aqui existe pra sempre poder pedir/alternar a
  // permissão sob demanda — mesmo padrão já usado no Portal do Parceiro
  // (PortalMobileSettingsSheet.tsx).
  const [pushDisponivel, setPushDisponivel] = useState(false);
  const [pushAtivado, setPushAtivado] = useState(false);
  const [pushBloqueado, setPushBloqueado] = useState(false);
  const [pushOcupado, setPushOcupado] = useState(false);

  useEffect(() => {
    // deno-lint-ignore no-explicit-any
    const osd = (window as any).OneSignalDeferred;
    if (!osd) return;
    // deno-lint-ignore no-explicit-any
    osd.push(async (OneSignal: any) => {
      try {
        setPushDisponivel(true);
        setPushAtivado(!!OneSignal.User?.PushSubscription?.optedIn);
        setPushBloqueado(typeof Notification !== "undefined" && Notification.permission === "denied");
      } catch { /* opcional */ }
    });
  }, [activeSection]);

  const handleTogglePush = async (ligar: boolean) => {
    setPushOcupado(true);
    // deno-lint-ignore no-explicit-any
    const osd = (window as any).OneSignalDeferred;
    // deno-lint-ignore no-explicit-any
    osd?.push(async (OneSignal: any) => {
      try {
        if (ligar) {
          if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
            await OneSignal.Notifications.requestPermission();
          }
          if (typeof Notification !== "undefined" && Notification.permission === "denied") {
            setPushBloqueado(true);
            toast.error("Notificações bloqueadas no navegador. Libere nas configurações do aparelho.");
            return;
          }
          await OneSignal.User.PushSubscription.optIn();
          setPushAtivado(true);
          toast.success("Notificações ativadas");
        } else {
          await OneSignal.User.PushSubscription.optOut();
          setPushAtivado(false);
          toast.success("Notificações desativadas");
        }
      } catch {
        toast.error("Não foi possível alterar as notificações");
      } finally {
        setPushOcupado(false);
      }
    });
  };

  useEffect(() => {
    setTempColors(config.colors);
    loadImages();
    loadAppIcon();
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

  // Ícone do app (tela inicial ao instalar/adicionar à tela inicial) é
  // global pra toda a plataforma — fica em platform_settings, uma tabela
  // com leitura pública (RLS) já que precisa ser lida mesmo por quem
  // ainda não fez login (a instalação do PWA pode acontecer na tela de
  // login do Portal do Parceiro).
  const loadAppIcon = async () => {
    try {
      const { data } = await (supabase as any)
        .from("platform_settings")
        .select("app_icon_192_url, app_icon_512_url, app_icon_512_maskable_url, app_icon_apple_url")
        .eq("id", "global")
        .maybeSingle();
      if (data) {
        setAppIconUrls({
          icon192: data.app_icon_192_url || undefined,
          icon512: data.app_icon_512_url || undefined,
          icon512Maskable: data.app_icon_512_maskable_url || undefined,
          apple: data.app_icon_apple_url || undefined,
        });
      }
    } catch (error) { console.error("Error loading app icon:", error); }
  };

  const handleAppIconUpload = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Arquivo muito grande. Máximo 5MB."); return; }
    setAppIconLoading(true);
    try {
      const { icon192, icon512, icon512Maskable, appleTouchIcon } = await generatePwaIconsFromFile(file);
      const ts = Date.now();
      const variants: [string, Blob][] = [
        [`app-icon/icon-192-${ts}.png`, icon192],
        [`app-icon/icon-512-${ts}.png`, icon512],
        [`app-icon/icon-512-maskable-${ts}.png`, icon512Maskable],
        [`app-icon/apple-touch-icon-${ts}.png`, appleTouchIcon],
      ];
      const urls: string[] = [];
      for (const [path, blob] of variants) {
        const { error: uploadError } = await supabase.storage
          .from("app-config")
          .upload(path, blob, { upsert: true, contentType: "image/png" });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from("app-config").getPublicUrl(path);
        urls.push(publicUrl);
      }
      const [url192, url512, url512Maskable, urlApple] = urls;
      const { error: upsertError } = await (supabase as any).from("platform_settings").upsert(
        {
          id: "global",
          app_icon_192_url: url192,
          app_icon_512_url: url512,
          app_icon_512_maskable_url: url512Maskable,
          app_icon_apple_url: urlApple,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
      if (upsertError) throw upsertError;
      setAppIconUrls({ icon192: url192, icon512: url512, icon512Maskable: url512Maskable, apple: urlApple });
      toast.success("Ícone do app atualizado! Novas instalações já usam o ícone novo.");
    } catch (error) {
      console.error("Error updating app icon:", error);
      toast.error("Erro ao atualizar ícone do app.");
    } finally {
      setAppIconLoading(false);
    }
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
    { id: "compartilhamento", label: "Compartilhamento", icon: Share2, description: "Preview de links (logo da administradora)" },
    ...(canManageUsers ? [{ id: "usuarios", label: "Usuários", icon: Users, description: "Gerenciar usuários e permissões" }] : []),
    ...(canManageUsers ? [{ id: "modulos", label: "Módulos", icon: Blocks, description: "Habilitar/desabilitar módulos do sistema" }] : []),
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

        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-6">
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
          <div className="space-y-6 min-w-0">
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

                {/* Ícone do App (tela inicial) */}
                <div className="rounded-2xl border border-border/50 bg-card p-5 sm:p-6 space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Smartphone className="h-5 w-5 text-primary" />
                      Ícone do App
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Usado quando o usuário adiciona o app à tela inicial do celular (Portal do Parceiro).
                      Não altera o ícone da aba do navegador.
                    </p>
                  </div>
                  {(appIconUrls.icon512 || appIconUrls.apple) && (
                    <div className="flex justify-center gap-4 p-6 bg-muted/20 rounded-xl border border-dashed border-border/50">
                      {appIconUrls.icon512 && (
                        <img src={appIconUrls.icon512} alt="Ícone do app" className="h-16 w-16 rounded-2xl object-cover" />
                      )}
                      {appIconUrls.apple && (
                        <img src={appIconUrls.apple} alt="Ícone do app (iOS)" className="h-16 w-16 rounded-2xl object-cover border border-border/30" />
                      )}
                    </div>
                  )}
                  {canManageUsers ? (
                    <>
                      <Label htmlFor="app-icon-upload" className="cursor-pointer block">
                        <div className="border-2 border-dashed border-border/50 rounded-xl p-6 hover:border-primary/50 transition-colors text-center group">
                          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground group-hover:text-primary transition-colors" />
                          <p className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                            {appIconLoading ? "Gerando tamanhos e enviando..." : "Clique para enviar o ícone do app"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Tamanho recomendado: {RECOMMENDED_ICON_SIZE_LABEL} · PNG ou JPG, até 5MB
                          </p>
                          <p className="text-[11px] text-muted-foreground/80 mt-1">
                            A imagem preenche 100% do ícone (sem bordas). Se não for quadrada, as bordas mais
                            longas são cortadas automaticamente — envie já quadrada para controlar o enquadramento.
                          </p>
                        </div>
                      </Label>
                      <Input id="app-icon-upload" type="file" accept="image/*" className="hidden" disabled={appIconLoading}
                        onChange={(e) => { const file = e.target.files?.[0]; if (file) handleAppIconUpload(file); e.target.value = ""; }} />
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Apenas administradores podem alterar o ícone do app.</p>
                  )}
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

            {/* USUÁRIOS */}
            {activeSection === "usuarios" && canManageUsers && (
              <div className="rounded-2xl border border-border/50 bg-card p-2 sm:p-3 min-w-0 overflow-x-hidden">
                <Usuarios />
              </div>
            )}

            {/* COMPARTILHAMENTO */}
            {activeSection === "compartilhamento" && <BrandingCompartilhamento />}

            {activeSection === "modulos" && canManageUsers && <GestaoModulosConfig />}

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

                <SegurancaAcessoConfig readOnly={!canManageUsers} />

                <div className="space-y-3">
                  {[
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

                {/* Push (OneSignal) — controle real, não decorativo. As
                    demais opções abaixo ainda são preferências ilustrativas
                    (não persistem nem afetam nenhum envio de verdade). */}
                {pushDisponivel && (
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-4 bg-muted/10">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        {pushAtivado ? (
                          <Bell className="h-4 w-4 text-primary" />
                        ) : (
                          <BellOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">Notificações push (navegador)</p>
                        <p className="text-[11px] text-muted-foreground">
                          {pushBloqueado
                            ? "Bloqueadas no navegador — libere nas configurações do aparelho/site"
                            : "Avisos em tempo real neste navegador/dispositivo"}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={pushAtivado}
                      disabled={pushOcupado || pushBloqueado}
                      onCheckedChange={handleTogglePush}
                      aria-label="Ativar ou desativar notificações push"
                    />
                  </div>
                )}

                <div className="space-y-3">
                  {[
                    { title: "Notificações por email", desc: "Receber alertas no email cadastrado", defaultOn: true },
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
