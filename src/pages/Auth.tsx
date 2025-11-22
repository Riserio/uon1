import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { z } from "zod";
import { signInSchema, signUpSchema } from "@/lib/validationSchemas";
import { supabase } from "@/integrations/supabase/client";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [background, setBackground] = useState("");

  const { signIn, signUp } = useAuth();

  useEffect(() => {
    carregarImagem();
  }, []);

  async function carregarImagem() {
    const { data } = await supabase.from("configuracoes").select("*").single();

    if (data?.imagem_fundo) {
      setBackground(data.imagem_fundo);
    }
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validated = signInSchema.parse({ email, password });
      const { error } = await signIn(validated.email, validated.password);

      if (error) toast.error(error.message || "Erro ao fazer login");
      else toast.success("Login realizado!");
    } catch (error) {
      if (error instanceof z.ZodError) toast.error(error.errors[0].message);
    }

    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validated = signUpSchema.parse({ nome, email, password });
      const { error } = await signUp(validated.email, validated.password, validated.nome);

      if (error) toast.error(error.message || "Erro ao criar conta");
      else {
        toast.success("Conta criada! Aguarde aprovação.");
        setNome("");
        setEmail("");
        setPassword("");
      }
    } catch (error) {
      if (error instanceof z.ZodError) toast.error(error.errors[0].message);
    }

    setLoading(false);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center relative bg-cover bg-center"
      style={{
        backgroundImage: background ? `url('${background}')` : `linear-gradient(to bottom right, #2563eb, #1d4ed8)`,
      }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>

      <Card className="w-full max-w-md mx-4 bg-white shadow-2xl border-0 relative z-20">
        <CardHeader className="space-y-2 pb-6">
          <CardTitle className="text-2xl font-semibold">{isSignUp ? "Sign up" : "Sign in"}</CardTitle>
          <CardDescription>{isSignUp ? "Create your account" : "Enter your credentials"}</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <Label>Nome Completo</Label>
                <Input type="text" value={nome} onChange={(e) => setNome(e.target.value)} required />
              </div>
            )}

            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>

            <Button className="w-full" disabled={loading}>
              {loading ? "Carregando..." : isSignUp ? "Criar conta" : "Entrar"}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="text-center text-sm">
          {isSignUp ? "Já tem uma conta?" : "Não tem conta?"}
          <button className="ml-2 text-blue-600 font-medium" onClick={() => setIsSignUp(!isSignUp)}>
            {isSignUp ? "Entrar" : "Registrar"}
          </button>
        </CardFooter>
      </Card>
    </div>
  );
}
