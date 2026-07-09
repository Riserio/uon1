import LogoUon1 from "@/assets/uon1-logo.png";
import LoginBackgroundDefault from "@/assets/login-background-default.png";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAppConfig } from "@/hooks/useAppConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { signInSchema, signUpSchema } from "@/lib/validationSchemas";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceFingerprint, getClientIp } from "@/lib/deviceFingerprint";
import { ShieldCheck, ArrowLeft, QrCode, Eye, EyeOff, KeyRound, Smartphone, Loader2, ShieldAlert } from "lucide-react";


type Step = "CREDENTIALS" | "TOTP" | "TOTP_SETUP" | "PALAVRA_CHAVE" | "DISPOSITIVO_AGUARDANDO";
type LoginPhase = "idle" | "credentials" | "totp";
type MetodoVerificacao = "totp" | "palavra_chave" | "dispositivo" | "nenhum";

type MinimalUser = {
  id: string;
  email?: string | null;
};

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  const [step, setStep] = useState<Step>("CREDENTIALS");
  const [totpCode, setTotpCode] = useState("");
  const [qrCodeUri, setQrCodeUri] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loginPhase, setLoginPhase] = useState<LoginPhase>("idle");
  const [showPassword, setShowPassword] = useState(false);

  // Palavra-chave (método alternativo de verificação em duas etapas)
  const [palavraChave, setPalavraChave] = useState("");

  // Aprovação por dispositivo (método alternativo de verificação em duas etapas).
  // "blocked" = dispositivo já aprovado antes, mas com trava de IP ativa e o
  // IP atual não bate com o aprovado (mesmo padrão do módulo Ponto).
  const [deviceRequestId, setDeviceRequestId] = useState<string | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<"pending" | "approved" | "denied" | "expired" | "blocked">("pending");
  const [deviceMessage, setDeviceMessage] = useState<string>("");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const { config } = useAppConfig();
  const navigate = useNavigate();

  const loginBackground = config.login_image_url || LoginBackgroundDefault;

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const checkTOTPStatus = async (currentUser?: MinimalUser) => {
    const effectiveUser: MinimalUser | undefined =
      currentUser ??
      (user
        ? {
            id: user.id,
            email: user.email,
          }
        : undefined);

    if (!effectiveUser) return;

    try {
      const { data: totpData, error } = await supabase
        .from("user_totp")
        .select("enabled")
        .eq("user_id", effectiveUser.id)
        .maybeSingle();

      if (error) {
        console.error("Error checking TOTP status:", error);
        toast.error("Erro ao verificar autenticação");
        return;
      }

      // Fetch QR code (will reuse existing secret if already configured)
      await setupTOTP(effectiveUser, false);

      if (totpData?.enabled) {
        // User already has TOTP configured - go directly to verification
        setStep("TOTP");
      } else {
        // User needs to set up TOTP for the first time
        setStep("TOTP_SETUP");
      }
    } catch (error) {
      console.error("Error checking TOTP status:", error);
      toast.error("Erro ao verificar autenticação");
    }
  };

  const setupTOTP = async (currentUser?: MinimalUser, forceReset = false) => {
    const effectiveUser: MinimalUser | undefined =
      currentUser ??
      (user
        ? {
            id: user.id,
            email: user.email,
          }
        : undefined);

    if (!effectiveUser?.email) return;

    try {
      const { data, error } = await supabase.functions.invoke("verify-totp/setup", {
        body: {
          email: effectiveUser.email,
          forceReset,
        },
      });

      if (error) {
        console.error("Edge function error:", error);
        toast.error("Erro ao configurar autenticação");
        return;
      }

      // Validate response structure
      if (!data || !data.success || !data.qrCodeUri) {
        console.error("Invalid response from verify-totp/setup:", data);
        toast.error("Erro ao configurar autenticação: resposta inválida");
        return;
      }

      setQrCodeUri(data.qrCodeUri);

      if (forceReset) {
        toast.success("Novo QR Code gerado! Escaneie novamente.");
        setStep("TOTP_SETUP");
      }
    } catch (error: any) {
      console.error("Error setting up TOTP:", error);
      toast.error("Erro ao configurar autenticação");
    }
  };

  const handleResetTOTP = async () => {
    if (!user?.email) return;
    setSubmitting(true);
    await setupTOTP({ id: user.id, email: user.email }, true);
    setTotpCode("");
    setSubmitting(false);
  };

  // Consulta em verify-metodo-seguranca qual método a associação deste
  // usuário usa (totp / palavra_chave / dispositivo) e direciona o fluxo.
  // Em caso de qualquer falha na consulta, cai no padrão histórico (TOTP)
  // para nunca travar o login de ninguém.
  const resolverMetodoEDirecionar = async (currentUser: MinimalUser) => {
    try {
      const { data, error } = await supabase.functions.invoke("verify-metodo-seguranca", {
        body: { action: "metodo", email: currentUser.email },
      });

      const metodo: MetodoVerificacao = !error && data?.metodo ? data.metodo : "totp";

      if (metodo === "nenhum") {
        toast.success("Login realizado com sucesso!");
        navigate("/portal", { replace: true });
      } else if (metodo === "palavra_chave") {
        setStep("PALAVRA_CHAVE");
      } else if (metodo === "dispositivo") {
        await solicitarAprovacaoDispositivo(currentUser);
      } else {
        await checkTOTPStatus(currentUser);
      }
    } catch (error) {
      console.error("Erro ao resolver método de verificação:", error);
      await checkTOTPStatus(currentUser);
    }
  };

  const handleVerifyPalavraChave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!palavraChave.trim()) return;
    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("verify-metodo-seguranca", {
        body: { action: "palavra-chave", email: user?.email, palavra: palavraChave },
      });

      if (error) {
        console.error("Edge function error:", error);
        toast.error("Erro ao validar palavra-chave. Tente novamente.");
        setSubmitting(false);
        return;
      }

      if (!data?.valid) {
        toast.error(data?.error || "Palavra-chave incorreta. Tente novamente.");
        setSubmitting(false);
        return;
      }

      toast.success("Acesso confirmado com sucesso!");
      navigate("/portal", { replace: true });
    } catch (err) {
      console.error(err);
      toast.error("Erro ao validar palavra-chave. Tente novamente.");
    }

    setSubmitting(false);
  };

  // Aprovação por dispositivo: agora persistente (identificado por
  // fingerprint) e reaproveitada entre logins — mesmo padrão do módulo
  // Ponto. Se o dispositivo já foi aprovado antes, o login segue direto
  // (sem tela de espera), a não ser que a associação exija o mesmo IP e o
  // IP atual tenha mudado — nesse caso fica bloqueado até nova aprovação.
  const solicitarAprovacaoDispositivo = async (currentUser: MinimalUser) => {
    setStep("DISPOSITIVO_AGUARDANDO");
    setDeviceStatus("pending");
    setDeviceMessage("");

    try {
      const { fingerprint, userAgent, plataforma, navegador } = await getDeviceFingerprint();
      const ip = await getClientIp();

      const { data, error } = await supabase.functions.invoke("verify-metodo-seguranca", {
        body: {
          action: "dispositivo-solicitar",
          email: currentUser.email,
          deviceInfo: `${navegador} em ${plataforma} — ${userAgent}`,
          fingerprint,
          ip,
        },
      });

      if (error) {
        console.error("Erro ao solicitar aprovação de dispositivo:", error);
        toast.error("Erro ao solicitar aprovação. Tente novamente.");
        setStep("CREDENTIALS");
        return;
      }

      // Dispositivo já aprovado antes (e sem bloqueio de IP) — entra direto,
      // sem precisar esperar aprovação de novo.
      if (data?.status === "approved") {
        setDeviceStatus("approved");
        toast.success("Dispositivo reconhecido! Entrando...");
        navigate("/portal", { replace: true });
        return;
      }

      if (data?.status === "blocked") {
        setDeviceStatus("blocked");
        setDeviceMessage(data?.message || "Este dispositivo está bloqueado.");
        return;
      }

      if (!data?.requestId) {
        toast.error("Erro ao solicitar aprovação. Tente novamente.");
        setStep("CREDENTIALS");
        return;
      }

      setDeviceRequestId(data.requestId);

      // Faz polling do status a cada 3s até ser aprovado, negado, ou expirar.
      pollingRef.current = setInterval(async () => {
        const { data: statusData } = await supabase.functions.invoke("verify-metodo-seguranca", {
          body: { action: "dispositivo-status", email: currentUser.email, requestId: data.requestId },
        });

        const status = statusData?.status || "expired";
        if (status === "approved") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setDeviceStatus("approved");
          toast.success("Dispositivo aprovado! Redirecionando...");
          navigate("/portal", { replace: true });
        } else if (status === "denied" || status === "expired" || status === "blocked") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setDeviceStatus(status);
          toast.error(
            status === "denied"
              ? "Acesso negado por um administrador."
              : status === "blocked"
                ? "Este dispositivo foi bloqueado."
                : "Solicitação expirou."
          );
        }
      }, 3000);
    } catch (error) {
      console.error("Erro ao solicitar aprovação de dispositivo:", error);
      toast.error("Erro ao solicitar aprovação. Tente novamente.");
      setStep("CREDENTIALS");
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setLoginPhase("credentials");

    try {
      const validated = signInSchema.parse({
        email,
        password,
      });

      const result = await signIn(validated.email, validated.password);

      if (result.error) {
        const msg = String(result.error.message || "");
        const isNetworkError = /failed to fetch|networkerror|load failed|fetch/i.test(msg);
        const isPreview = /id-preview--.*\.lovable\.app$/i.test(window.location.hostname);

        if (isNetworkError) {
          // Stale/corrupt refresh token in localStorage can cause background
          // refresh loops that look like network failures. Purge and reload.
          try {
            Object.keys(localStorage)
              .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
              .forEach((k) => localStorage.removeItem(k));
          } catch {}
          if (isPreview) {
            toast.error(
              "Falha de rede no ambiente de Preview. Acesse pelo endereço publicado (ex: https://uon1.lovable.app) ou domínio próprio.",
              { duration: 10000 }
            );
          } else {
            toast.error(
              "Falha de conexão detectada. Limpamos a sessão local — tente entrar novamente. Se persistir, verifique sua internet/VPN.",
              { duration: 8000 }
            );
          }
        } else {
          toast.error(msg || "Erro ao fazer login");
        }
        setSubmitting(false);
        setLoginPhase("idle");
        return;
      }

      if (result.forcePasswordChange) {
        toast.info("Por favor, atualize sua senha antes de continuar.");
        navigate("/change-password", { replace: true });
      } else if (result.isParceiro) {
        toast.success("Credenciais válidas! Verificando autenticação...");

        // Session is already established, get user from it directly
        const session = (await supabase.auth.getSession()).data.session;
        if (!session?.user) {
          toast.error("Erro ao carregar seus dados. Tente novamente.");
          setSubmitting(false);
          setLoginPhase("idle");
          return;
        }

        const currentUser: MinimalUser = {
          id: session.user.id,
          email: session.user.email,
        };

        setLoginPhase("totp");
        await resolverMetodoEDirecionar(currentUser);
      } else {
        toast.success("Login realizado com sucesso!");
        navigate(redirectTo, { replace: true });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        console.error(error);
        toast.error("Erro ao fazer login");
      }
    }

    setSubmitting(false);
    setLoginPhase("idle");
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const validated = signUpSchema.parse({
        nome,
        email,
        password,
      });

      await signUp(validated.email, validated.password, validated.nome);
      toast.success("Conta criada! Aguarde aprovação de um administrador para fazer login.");
      setEmail("");
      setPassword("");
      setNome("");
      setIsSignUp(false);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
    }

    setSubmitting(false);
  };

  const handleVerifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("verify-totp", {
        body: {
          code: totpCode,
          email: user?.email,
        },
      });

      if (error) {
        console.error("Edge function error:", error);
        toast.error("Erro ao validar código. Tente novamente.");
        setSubmitting(false);
        return;
      }

      // Validate response structure
      if (!data || !data.success) {
        console.error("Invalid response from verify-totp:", data);
        toast.error("Erro ao validar código: resposta inválida");
        setSubmitting(false);
        return;
      }

      if (!data.valid) {
        toast.error("Código inválido. Tente novamente.");
      } else {
        toast.success("Acesso confirmado com sucesso!");
        navigate("/portal", {
          replace: true,
        });
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao validar código. Tente novamente.");
    }

    setSubmitting(false);
  };

  const handleSetupTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode || totpCode.length !== 6) return;

    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("verify-totp", {
        body: {
          email: user?.email,
          code: totpCode,
        },
      });

      if (error) {
        console.error("Edge function error:", error);
        toast.error("Erro ao configurar autenticação");
        setSubmitting(false);
        return;
      }

      // Validate response structure
      if (!data || !data.success) {
        console.error("Invalid response from verify-totp:", data);
        toast.error("Erro ao configurar autenticação: resposta inválida");
        setSubmitting(false);
        return;
      }

      if (data.valid) {
        await supabase
          .from("user_totp")
          .update({
            enabled: true,
          })
          .eq("user_id", user?.id);

        toast.success("Google Authenticator configurado com sucesso!");
        navigate("/portal", {
          replace: true,
        });
      } else {
        toast.error("Código inválido. Verifique e tente novamente.");
      }
    } catch (error: any) {
      console.error("TOTP setup error:", error);
      toast.error(error.message || "Erro ao configurar autenticação");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 via-blue-500 to-blue-700">
        <div className="flex flex-col items-center gap-4 text-white">
          <div className="w-10 h-10 border-4 border-white/60 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm opacity-90">Carregando seu acesso com segurança...</p>
        </div>
      </div>
    );
  }

  const showCredentialsStep = step === "CREDENTIALS";

  const stepTitle =
    step === "TOTP_SETUP"
      ? "Configure Google Authenticator"
      : step === "TOTP"
        ? "Validação em duas etapas"
        : step === "PALAVRA_CHAVE"
          ? "Validação em duas etapas"
          : step === "DISPOSITIVO_AGUARDANDO"
            ? "Aprovação de dispositivo"
            : "";

  const stepDescription =
    step === "TOTP_SETUP"
      ? "Escaneie o QR code e digite o código gerado"
      : step === "TOTP"
        ? "Digite o código do Google Authenticator para concluir o login"
        : step === "PALAVRA_CHAVE"
          ? "Digite a palavra-chave da sua associação para concluir o login"
          : step === "DISPOSITIVO_AGUARDANDO"
            ? "Aguarde a aprovação de um administrador para concluir o login"
            : "";

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        backgroundImage: `url(${loginBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Overlay escuro para melhor contraste */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Texto lateral */}
      <div className="hidden lg:block absolute left-24 top-1/2 -translate-y-1/2 text-white z-10">
        <div className="space-y-4">
          <h1 className="text-6xl font-bold tracking-tight">Seja bem-vindo à Uon1</h1>
          <p className="text-xl opacity-90">
            {showCredentialsStep ? "Tudo começa no 1!" : "Confirme seu acesso seguro"}
          </p>
          {showCredentialsStep && (
            <div className="mt-6">
              <img src={LogoUon1} alt="UON1 Logo" className="w-48 h-auto opacity-90" />
            </div>
          )}
        </div>
      </div>

      {/* Card */}
      <Card className="w-full max-w-md mx-4 lg:ml-auto lg:mr-32 bg-white shadow-2xl border-0 relative z-20">
        {/* Logo para telas menores - no topo do card */}
        {showCredentialsStep && (
          <div className="lg:hidden flex justify-center pt-6 pb-2">
            <img src={LogoUon1} alt="UON1 Logo" className="w-32 h-auto opacity-80" />
          </div>
        )}

        <CardHeader className="space-y-2 pb-6">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-semibold">
                {showCredentialsStep
                  ? isSignUp
                    ? "Cadastrar"
                    : "Entrar"
                  : stepTitle}
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                {showCredentialsStep
                  ? isSignUp
                    ? "Crie sua conta para começar."
                    : "Insira suas credenciais para continuar."
                  : stepDescription}
              </CardDescription>
            </div>

            {!showCredentialsStep &&
              (step === "TOTP_SETUP" ? (
                <QrCode className="w-8 h-8 text-blue-600" />
              ) : step === "PALAVRA_CHAVE" ? (
                <KeyRound className="w-8 h-8 text-blue-600" />
              ) : step === "DISPOSITIVO_AGUARDANDO" ? (
                <Smartphone className="w-8 h-8 text-blue-600" />
              ) : (
                <ShieldCheck className="w-8 h-8 text-blue-600" />
              ))}
          </div>
        </CardHeader>

        <CardContent>
          {showCredentialsStep ? (
            <>
            <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="space-y-4">
              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="nome" className="text-sm font-medium">
                    Nome Completo
                  </Label>
                  <Input
                    id="nome"
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    required
                    placeholder="Seu nome completo"
                    className="h-11"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="example@email.com"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-[#362c89] hover:bg-[#362c89]/90 text-white font-medium transition-colors"
                disabled={submitting}
              >
                {submitting ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {isSignUp
                      ? "Criando conta..."
                      : loginPhase === "credentials"
                        ? "Validando credenciais..."
                        : "Validando autenticação..."}
                  </div>
                ) : isSignUp ? (
                  "Criar Conta"
                ) : (
                  "Entrar"
                )}
              </Button>

              {!isSignUp && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => navigate("/reset-password")}
                    className="text-sm text-[#362c89] hover:underline font-medium"
                  >
                    Esqueci minha senha
                  </button>
                </div>
              )}
            </form>

            </>
          ) : step === "TOTP_SETUP" ? (
            <form onSubmit={handleSetupTotp} className="space-y-4">
              <div className="flex flex-col items-center space-y-4">
                <div className="p-4 bg-white rounded-lg border-2 border-border">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeUri)}`}
                    alt="QR Code TOTP"
                    className="w-48 h-48"
                  />
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  1. Abra o Google Authenticator no seu celular
                  <br />
                  2. Escaneie este código QR
                  <br />
                  3. Digite o código de 6 dígitos gerado abaixo
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="totp-setup" className="text-sm font-medium">
                  Código do Google Authenticator
                </Label>
                <Input
                  id="totp-setup"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  required
                  placeholder="000000"
                  className="h-11 tracking-[0.4em] text-center text-lg"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-[#362c89] hover:bg-[#362c89]/90 text-white font-medium transition-colors"
                disabled={submitting || totpCode.length !== 6}
              >
                {submitting ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Verificando...
                  </div>
                ) : (
                  "Confirmar e Ativar"
                )}
              </Button>
            </form>
          ) : step === "PALAVRA_CHAVE" ? (
            <form onSubmit={handleVerifyPalavraChave} className="space-y-4">
              <div className="flex flex-col items-center space-y-3 pb-2">
                <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center">
                  <KeyRound className="w-8 h-8 text-blue-600" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="palavra-chave" className="text-sm font-medium">
                  Palavra-chave
                </Label>
                <Input
                  id="palavra-chave"
                  type="text"
                  value={palavraChave}
                  onChange={(e) => setPalavraChave(e.target.value)}
                  required
                  placeholder="Digite a palavra-chave"
                  className="h-11 text-center"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Palavra combinada com a sua associação. Fale com um administrador se não souber.
                </p>
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-[#362c89] hover:bg-[#362c89]/90 text-white font-medium transition-colors"
                disabled={submitting || !palavraChave.trim()}
              >
                {submitting ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Validando...
                  </div>
                ) : (
                  "Confirmar acesso"
                )}
              </Button>
            </form>
          ) : step === "DISPOSITIVO_AGUARDANDO" ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center space-y-4 py-4 text-center">
                {deviceStatus === "pending" ? (
                  <>
                    <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Enviamos uma solicitação de aprovação para um administrador.
                      <br />
                      Assim que for aceita, você entrará automaticamente.
                    </p>
                  </>
                ) : deviceStatus === "blocked" ? (
                  <>
                    <div className="h-16 w-16 rounded-full bg-amber-50 flex items-center justify-center">
                      <ShieldAlert className="w-8 h-8 text-amber-600" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {deviceMessage || "Este dispositivo está bloqueado para o IP atual."}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center">
                      <Smartphone className="w-8 h-8 text-red-500" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {deviceStatus === "denied"
                        ? "Sua solicitação de acesso foi negada."
                        : "Sua solicitação expirou."}
                    </p>
                  </>
                )}
              </div>

              {deviceStatus !== "pending" && (
                <Button
                  type="button"
                  className="w-full h-11 bg-[#362c89] hover:bg-[#362c89]/90 text-white font-medium transition-colors"
                  onClick={() => user && solicitarAprovacaoDispositivo({ id: user.id, email: user.email })}
                >
                  Tentar novamente
                </Button>
              )}
            </div>
          ) : (
            <form onSubmit={handleVerifyTotp} className="space-y-4">
              {qrCodeUri && (
                <div className="flex flex-col items-center space-y-4 pb-4">
                  <div className="p-4 bg-white rounded-lg border-2 border-border">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeUri)}`}
                      alt="QR Code TOTP"
                      className="w-48 h-48"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    Escaneie este código com o Google Authenticator se necessário
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="totp" className="text-sm font-medium">
                  Código de verificação
                </Label>
                <Input
                  id="totp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  required
                  placeholder="000000"
                  className="h-11 tracking-[0.4em] text-center text-lg"
                />
                <p className="text-xs text-muted-foreground">
                  Digite o código de 6 dígitos gerado no app Google Authenticator.
                </p>
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-[#362c89] hover:bg-[#362c89]/90 text-white font-medium transition-colors"
                disabled={submitting}
              >
                {submitting ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Validando código...
                  </div>
                ) : (
                  "Confirmar acesso"
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleResetTOTP}
                disabled={submitting}
              >
                <QrCode className="w-4 h-4 mr-2" />
                Gerar novo QR Code
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="flex flex-col space-y-4">
          {showCredentialsStep ? null : (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() => {
                  if (pollingRef.current) clearInterval(pollingRef.current);
                  setStep("CREDENTIALS");
                  setTotpCode("");
                  setPassword("");
                  setQrCodeUri("");
                  setPalavraChave("");
                  setDeviceRequestId(null);
                  setDeviceStatus("pending");
                  setDeviceMessage("");
                }}
                className="flex items-center gap-1 text-[#362c89] hover:text-[#362c89]/80 font-medium"
              >
                <ArrowLeft className="w-3 h-3" />
                Trocar usuário
              </button>
              <span>Seu acesso está protegido com autenticação em duas etapas.</span>
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
