import LogoUon1 from "@/assets/logo-uon1.png";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { signInSchema, signUpSchema } from "@/lib/validationSchemas";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, ArrowLeft, QrCode } from "lucide-react";

type Step = "CREDENTIALS" | "TOTP" | "TOTP_SETUP";
type LoginPhase = "idle" | "credentials" | "totp";

type MinimalUser = {
  id: string;
  email?: string | null;
};

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);

  const [step, setStep] = useState<Step>("CREDENTIALS");
  const [totpCode, setTotpCode] = useState("");
  const [qrCodeUri, setQrCodeUri] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loginPhase, setLoginPhase] = useState<LoginPhase>("idle");

  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

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

      if (!totpData || !totpData.enabled) {
        await setupTOTP(effectiveUser);
      } else {
        setStep("TOTP");
      }
    } catch (error) {
      console.error("Error checking TOTP status:", error);
      toast.error("Erro ao verificar autenticação");
    }
  };

  const setupTOTP = async (currentUser?: MinimalUser) => {
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
        },
      });

      if (error) throw error;

      if (data?.qrCodeUri) {
        setQrCodeUri(data.qrCodeUri);
        setStep("TOTP_SETUP");
      }
    } catch (error: any) {
      console.error("Error setting up TOTP:", error);
      toast.error("Erro ao configurar autenticação");
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setLoginPhase("credentials");

    try {
      const validated = signInSchema.parse({
        email,
        senha,
      });

      const result = await signIn(validated.email, validated.password);

      if (result.error) {
        toast.error(result.error.message || "Erro ao fazer login");
        setSubmitting(false);
        setLoginPhase("idle");
        return;
      }

      if (result.isParceiro) {
        toast.success("Credenciais válidas! Verificando autenticação...");

        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
          console.error("Erro ao obter usuário após login:", userError);
          toast.error("Erro ao carregar seus dados. Tente novamente.");
          setSubmitting(false);
          setLoginPhase("idle");
          return;
        }

        const currentUser: MinimalUser = {
          id: userData.user.id,
          email: userData.user.email,
        };

        setLoginPhase("totp");
        await checkTOTPStatus(currentUser);
      } else {
        toast.success("Login realizado com sucesso!");
        navigate("/dashboard", {
          replace: true,
        });
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
        senha,
      });

      const { error } = await signUp(validated.email, validated.password, validated.nome);
      if (error) {
        toast.error(error.message || "Erro ao criar conta");
      } else {
        toast.success("Conta criada! Aguarde aprovação de um administrador para fazer login.");
        setEmail("");
        setPassword("");
        setNome("");
      }
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

      if (error || !data?.valid) {
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

      if (error) throw error;

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

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-[#362c89] via-[#4a3cc1] to-[#221a66]">
      {/* Decor */}
      <div className="absolute top-20 left-20 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-20 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/4 w-72 h-72 bg-blue-400/20 rounded-full blur-2xl" />

      {/* Texto lateral */}
      <div className="hidden lg:block absolute left-24 top-1/2 -translate-y-1/2 text-white z-10">
        <div className="space-y-4">
          <h1 className="text-6xl font-bold tracking-tight">Seja bem-vindo à Uon1</h1>
          <p className="text-xl opacity-90">
            {showCredentialsStep ? "Tudo começa no 1!" : "Confirme seu acesso seguro"}
          </p>
        </div>
      </div>

      {/* Card */}
      <Card className="w-full max-w-md mx-4 lg:ml-auto lg:mr-32 bg-white shadow-2xl border-0 relative z-20">
        <CardHeader className="space-y-2 pb-6">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-semibold">
                {showCredentialsStep
                  ? isSignUp
                    ? "Cadastrar"
                    : "Entrar"
                  : step === "TOTP_SETUP"
                    ? "Configure Google Authenticator"
                    : "Validação em duas etapas"}
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                {showCredentialsStep
                  ? isSignUp
                    ? "Crie sua conta para começar."
                    : "Insira suas credenciais para continuar."
                  : step === "TOTP_SETUP"
                    ? "Escaneie o QR code e digite o código gerado"
                    : "Digite o código do Google Authenticator para concluir o login"}
              </CardDescription>
            </div>

            {!showCredentialsStep &&
              (step === "TOTP_SETUP" ? (
                <QrCode className="w-8 h-8 text-blue-600" />
              ) : (
                <ShieldCheck className="w-8 h-8 text-blue-600" />
              ))}
          </div>
        </CardHeader>

        <CardContent>
          {showCredentialsStep ? (
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
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="h-11"
                />
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
                        : "Validando autenticação por TOTP..."}
                  </div>
                ) : isSignUp ? (
                  "Criar Conta"
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>
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
          ) : (
            <form onSubmit={handleVerifyTotp} className="space-y-4">
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
                  Abra o app Google Authenticator e digite o código de 6 dígitos gerado para a sua conta.
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
            </form>
          )}
        </CardContent>

        <CardFooter className="flex flex-col space-y-4">
          {showCredentialsStep ? (
            <div className="text-sm text-center text-muted-foreground">
              {isSignUp ? "Já tem uma conta?" : "Não tem uma conta?"}
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="ml-2 text-[#362c89] hover:text-[#362c89]/80 font-medium"
              >
                {isSignUp ? "Fazer login" : "Sign up"}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() => {
                  setStep("CREDENTIALS");
                  setTotpCode("");
                  setPassword("");
                  setQrCodeUri("");
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
