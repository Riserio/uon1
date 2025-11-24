import { useState, useEffect } from "react";
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

type SimpleUser = { id: string; email: string };

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

  // ⚙️ Verifica status do TOTP usando o usuário já conhecido
  const checkTOTPStatus = async (currentUser?: SimpleUser) => {
    const effectiveUser = currentUser ?? (user ? { id: user.id, email: user.email! } : undefined);
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
        // precisa configurar
        await setupTOTP(effectiveUser);
      } else {
        // já tem TOTP habilitado → vai direto pra tela de código
        setStep("TOTP");
      }
    } catch (error) {
      console.error("Error checking TOTP status:", error);
      toast.error("Erro ao verificar autenticação");
    }
  };

  // 📲 Configuração inicial do TOTP (gera QR)
  const setupTOTP = async (currentUser?: SimpleUser) => {
    const effectiveUser = currentUser ?? (user ? { id: user.id, email: user.email! } : undefined);
    if (!effectiveUser?.email) return;

    try {
      // aqui você já disse que está usando verify-totp/setup e está funcionando
      const { data, error } = await supabase.functions.invoke("verify-totp/setup", {
        body: { email: effectiveUser.email },
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
      const validated = signInSchema.parse({ email, password });

      // IMPORTANTE: signIn precisa retornar { error, user, isParceiro }
      const result = await signIn(validated.email, validated.password);

      if (result.error) {
        toast.error(result.error.message || "Erro ao fazer login");
        setSubmitting(false);
        setLoginPhase("idle");
        return;
      }

      // Se for parceiro, entra no fluxo TOTP
      if (result.isParceiro) {
        toast.success("Credenciais válidas! Verificando autenticação...");
        setLoginPhase("totp"); // muda mensagem do botão
        await checkTOTPStatus({
          id: result.user.id,
          email: result.user.email,
        });
        // daqui em diante a UI muda para TOTP ou TOTP_SETUP
      } else {
        // Usuário normal → direto pro dashboard
        toast.success("Login realizado com sucesso!");
        navigate("/dashboard", { replace: true });
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
      const validated = signUpSchema.parse({ nome, email, password });
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
        body: { code: totpCode, email: user?.email },
      });

      if (error || !data?.valid) {
        toast.error("Código inválido. Tente novamente.");
      } else {
        toast.success("Acesso confirmado com sucesso!");
        navigate("/portal", { replace: true });
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
        await supabase.from("user_totp").update({ enabled: true }).eq("user_id", user?.id);

        toast.success("Google Authenticator configurado com sucesso!");
        navigate("/portal", { replace: true });
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

  // 🔤 Texto dinâmico do botão na tela de credenciais
  const getCredentialsButtonLabel = () => {
    if (!submitting) return isSignUp ? "Criar Conta" : "Entrar";

    if (isSignUp) return "Criando conta...";

    if (loginPhase === "credentials") return "Validando credenciais...";
    if (loginPhase === "totp") return "Validando autenticação por TOTP...";

    return "Processando...";
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-500 to-blue-700">
      {/* ... resto do layout igual ao seu, só mudo o botão principal */}

      <Card className="w-full max-w-md mx-4 lg:ml-auto lg:mr-32 bg-white shadow-2xl border-0 relative z-20">
        <CardHeader className="space-y-2 pb-6">
          {/* cabeçalho igual ao seu */}
          {/* ... */}
        </CardHeader>

        <CardContent>
          {showCredentialsStep ? (
            <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="space-y-4">
              {/* campos nome/email/senha iguais aos seus */}
              {/* ... */}

              <Button
                type="submit"
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                disabled={submitting}
              >
                {submitting && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                )}
                {getCredentialsButtonLabel()}
              </Button>
            </form>
          ) : step === "TOTP_SETUP" ? (
            // ... sua tela de setup TOTP igual
            <form onSubmit={handleSetupTotp} className="space-y-4">
              {/* QR + Input + Botão */}
            </form>
          ) : (
            // ... sua tela de verificação TOTP igual
            <form onSubmit={handleVerifyTotp} className="space-y-4">
              {/* Input + Botão */}
            </form>
          )}
        </CardContent>

        {/* Footer igual ao seu */}
        <CardFooter>...</CardFooter>
      </Card>
    </div>
  );
}
