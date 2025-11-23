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
import { ShieldCheck, ArrowLeft } from "lucide-react";

type Step = "CREDENTIALS" | "TOTP";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);

  const [step, setStep] = useState<Step>("CREDENTIALS");
  const [totpCode, setTotpCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 🔐 controla se já validou o TOTP (só faz sentido pra parceiro)
  const [totpValidated, setTotpValidated] = useState(false);
  // loading pós-login até descobrir o papel
  const [checkingRole, setCheckingRole] = useState(false);

  const { signIn, signUp, user, userRole, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // helper pra identificar parceiro
  const isPartner = userRole === "partner" || userRole === "parceiro" || userRole === "parceiro_externo";

  // 🔐 Decisão central de pra onde mandar o usuário
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    // se ainda estamos checando papel depois do login, só continua quando já tiver role
    if (checkingRole && !userRole) return;

    if (isPartner) {
      // parceiro SEM TOTP validado → fica na tela de TOTP
      if (!totpValidated) {
        setStep("TOTP");
        setCheckingRole(false);
        return;
      }

      // parceiro COM TOTP ok → manda pro PID
      navigate("/pid", { replace: true });
      return;
    }

    // NÃO parceiro → fluxo normal, sem TOTP
    navigate("/dashboard", { replace: true });
  }, [authLoading, user, userRole, isPartner, totpValidated, checkingRole, navigate]);

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
        // credencial ok → agora vamos descobrir o papel
        setCheckingRole(true);
        toast.success("Credenciais válidas! Validando seu acesso...");
        // o useEffect acima vai cuidar de:
        // - se for parceiro → mostrar TOTP
        // - se não for → redirecionar direto
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      setCheckingRole(false);
    }

    setSubmitting(false);
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
      // ✅ Só parceiro cai aqui, por causa do useEffect + isPartner
      const { data, error } = await supabase.functions.invoke("verify-totp", {
        body: { code: totpCode, email },
      });

      if (error || !data?.valid) {
        toast.error("Código inválido. Tente novamente.");
      } else {
        toast.success("Acesso confirmado com sucesso!");
        setTotpValidated(true);
        // o useEffect vai redirecionar para /pid quando totpValidated = true
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao validar código. Tente novamente.");
    }

    setSubmitting(false);
  };

  // carregamento inicial da sessão (antes de saber se está logado ou não)
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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-500 to-blue-700">
      {/* Decor */}
      <div className="absolute top-20 left-20 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-20 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/4 w-72 h-72 bg-blue-400/20 rounded-full blur-2xl" />

      {/* Texto lateral */}
      <div className="hidden lg:block absolute left-24 top-1/2 -translate-y-1/2 text-white z-10">
        <div className="space-y-4">
          <h1 className="text-6xl font-bold tracking-tight">WELCOME</h1>
          <p className="text-xl opacity-90">
            {showCredentialsStep ? "Back! Please login" : "Confirme seu acesso seguro"}
          </p>
        </div>
      </div>

      {/* Card */}
      <Card className="w-full max-w-md mx-4 lg:ml-auto lg:mr-32 bg-white shadow-2xl border-0 relative z-20">
        <CardHeader className="space-y-2 pb-6">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-semibold">
                {showCredentialsStep ? (isSignUp ? "Sign up" : "Sign in") : "Validação em duas etapas"}
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                {showCredentialsStep
                  ? isSignUp
                    ? "Create your account to get started"
                    : "Enter your credentials to continue"
                  : "Digite o código do Google Authenticator para concluir o login"}
              </CardDescription>
            </div>

            {!showCredentialsStep && <ShieldCheck className="w-8 h-8 text-blue-600" />}
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
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                disabled={submitting || checkingRole}
              >
                {submitting || checkingRole ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {isSignUp ? "Criando conta..." : "Validando credenciais..."}
                  </div>
                ) : isSignUp ? (
                  "Criar Conta"
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>
          ) : (
            // 🔐 Tela de TOTP – só será usada se isPartner === true
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
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium"
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
              {isSignUp ? "Já tem uma conta?" : "Don't have an account?"}
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="ml-2 text-blue-600 hover:text-blue-700 font-medium"
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
                  setTotpValidated(false);
                }}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
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
