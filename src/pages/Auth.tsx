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

type Step = "CREDENTIALS" | "TOTP_SETUP" | "TOTP";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);

  const [step, setStep] = useState<Step>("CREDENTIALS");
  const [totpCode, setTotpCode] = useState("");
  const [qrCodeUri, setQrCodeUri] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [totpValidated, setTotpValidated] = useState(false);
  const [checkingRole, setCheckingRole] = useState(false);

  const { signIn, signUp, user, userRole, loading: authLoading, isParceiro } = useAuth();
  const navigate = useNavigate();

  // Redirect logic after authentication
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (checkingRole && !userRole) return;

    if (isParceiro) {
      if (!totpValidated) {
        checkTOTPStatus();
        return;
      }
      navigate("/portal", { replace: true });
      return;
    }

    navigate("/dashboard", { replace: true });
  }, [authLoading, user, userRole, isParceiro, totpValidated, checkingRole, navigate]);

  // 🔍 1. Verifica se TOTP já está configurado
  const checkTOTPStatus = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase.from("user_totp").select("enabled").eq("user_id", user.id).maybeSingle();

      if (error) {
        console.error("TOTP status error:", error);
        toast.error("Erro ao verificar autenticação");
        return;
      }

      if (!data || !data.enabled) {
        setupTOTP();
      } else {
        setStep("TOTP");
      }
    } catch (error) {
      console.error("Error checking TOTP status:", error);
      toast.error("Erro ao verificar autenticação");
    }
  };

  // 📌 2. Setup TOTP → Gera secret + QR Code via Edge Function
  const setupTOTP = async () => {
    if (!user?.email) return;

    try {
      const { data, error } = await supabase.functions.invoke("totp-setup", {
        body: { email: user.email },
      });

      if (error) throw error;

      if (data?.qrCodeUri) {
        setQrCodeUri(data.qrCodeUri);
        setStep("TOTP_SETUP");
      }
    } catch (error) {
      console.error("setupTOTP error:", error);
      toast.error("Erro ao configurar autenticação");
    }
  };

  // 🔐 LOGIN NORMAL
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const validated = signInSchema.parse({ email, password });
      const { error } = await signIn(validated.email, validated.password);

      if (error) {
        toast.error(error.message || "Erro ao fazer login");
        setCheckingRole(false);
      } else {
        setCheckingRole(true);
        toast.success("Credenciais válidas! Validando acesso...");
      }
    } catch (error) {
      if (error instanceof z.ZodError) toast.error(error.errors[0].message);
      setCheckingRole(false);
    }

    setSubmitting(false);
  };

  // ✳ CRIAR CONTA
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const validated = signUpSchema.parse({ nome, email, password });
      const { error } = await signUp(validated.email, validated.password, validated.nome);

      if (error) toast.error(error.message || "Erro ao criar conta");
      else {
        toast.success("Conta criada! Aguarde aprovação.");
        setEmail("");
        setPassword("");
        setNome("");
      }
    } catch (error) {
      if (error instanceof z.ZodError) toast.error(error.errors[0].message);
    }

    setSubmitting(false);
  };

  // ✔ 3. VALIDAR CÓDIGO TOTP (Login parceiro)
  const handleVerifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("verify-totp", {
        body: { email: user?.email, code: totpCode },
      });

      if (error || !data?.valid) {
        toast.error("Código inválido.");
      } else {
        toast.success("Acesso confirmado!");
        setTotpValidated(true);
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao validar código");
    }

    setSubmitting(false);
  };

  // ✔ 4. ATIVAR TOTP PELA PRIMEIRA VEZ
  const handleSetupTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("verify-totp", {
        body: { email: user?.email, code: totpCode },
      });

      if (error || !data?.valid) {
        toast.error("Código inválido");
      } else {
        await supabase.from("user_totp").update({ enabled: true }).eq("user_id", user?.id);
        toast.success("Google Authenticator ativado!");
        setTotpValidated(true);
      }
    } catch (error) {
      console.error("TOTP setup error:", error);
      toast.error("Erro ao configurar autenticação");
    } finally {
      setSubmitting(false);
    }
  };

  // Loading UI
  if (authLoading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-600 text-white">
        <p>Carregando...</p>
      </div>
    );
  }

  const showCredentialsStep = step === "CREDENTIALS";

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-600 relative overflow-hidden">
      <Card className="w-full max-w-md mx-4 bg-white shadow-2xl border-0 relative z-20">
        <CardHeader className="space-y-2 pb-6">
          <CardTitle className="text-2xl font-semibold">
            {showCredentialsStep
              ? isSignUp
                ? "Sign up"
                : "Sign in"
              : step === "TOTP_SETUP"
                ? "Configure Google Authenticator"
                : "Validação em duas etapas"}
          </CardTitle>
          <CardDescription>
            {showCredentialsStep
              ? isSignUp
                ? "Create your account"
                : "Enter your credentials"
              : step === "TOTP_SETUP"
                ? "Escaneie o QR e digite o código"
                : "Digite o código de 6 dígitos"}
          </CardDescription>
        </CardHeader>

        {/* FORMULÁRIOS */}
        <CardContent>
          {showCredentialsStep ? (
            // 👉 LOGIN / SIGNUP
            <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="space-y-4">
              {isSignUp && <Input value={nome} placeholder="Seu nome" onChange={(e) => setNome(e.target.value)} />}

              <Input type="email" value={email} placeholder="email" onChange={(e) => setEmail(e.target.value)} />

              <Input
                type="password"
                value={password}
                placeholder="senha"
                onChange={(e) => setPassword(e.target.value)}
              />

              <Button className="w-full" disabled={submitting || checkingRole}>
                {isSignUp ? "Criar conta" : "Entrar"}
              </Button>
            </form>
          ) : step === "TOTP_SETUP" ? (
            // 👉 SETUP TOTP
            <form onSubmit={handleSetupTotp} className="space-y-4">
              <div className="flex flex-col items-center">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeUri)}`}
                  className="w-48 h-48 border"
                />
              </div>

              <Input
                type="text"
                value={totpCode}
                maxLength={6}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
              />

              <Button className="w-full" disabled={submitting || totpCode.length !== 6}>
                Confirmar e ativar
              </Button>
            </form>
          ) : (
            // 👉 VALIDAR TOTP NORMAL (login)
            <form onSubmit={handleVerifyTotp} className="space-y-4">
              <Input
                type="text"
                value={totpCode}
                maxLength={6}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
              />

              <Button className="w-full" disabled={submitting}>
                Validar acesso
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="flex justify-between text-xs">
          <button type="button" onClick={() => setIsSignUp(!isSignUp)} className="text-blue-600">
            {isSignUp ? "Login" : "Criar conta"}
          </button>

          {!showCredentialsStep && (
            <button
              className="text-blue-600"
              onClick={() => {
                setStep("CREDENTIALS");
                setTotpCode("");
                setQrCodeUri("");
              }}
            >
              Trocar usuário
            </button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
