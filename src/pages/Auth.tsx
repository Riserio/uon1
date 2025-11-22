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

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validated = signInSchema.parse({ email, password });
      const { error } = await signIn(validated.email, validated.password);

      if (error) {
        toast.error(error.message || "Erro ao fazer login");
      } else {
        toast.success("Login realizado com sucesso!");
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
    }

    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

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

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-500 to-blue-700">
      {/* Círculos decorativos */}
      <div className="absolute top-20 left-20 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-20 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/4 w-72 h-72 bg-blue-400/20 rounded-full blur-2xl" />

      {/* Texto de boas-vindas - apenas desktop */}
      <div className="hidden lg:block absolute left-24 top-1/2 -translate-y-1/2 text-white z-10">
        <div className="space-y-4">
          <h1 className="text-6xl font-bold tracking-tight">WELCOME</h1>
          <p className="text-xl opacity-90">Back! Please login</p>
        </div>
      </div>

      {/* Card de Login */}
      <Card className="w-full max-w-md mx-4 lg:ml-auto lg:mr-32 bg-white shadow-2xl border-0 relative z-20">
        <CardHeader className="space-y-2 pb-6">
          <CardTitle className="text-2xl font-semibold">{isSignUp ? "Sign up" : "Sign in"}</CardTitle>

          <CardDescription className="text-muted-foreground">
            {isSignUp ? "Create your account to get started" : "Enter your credentials to continue"}
          </CardDescription>
        </CardHeader>

        <CardContent>
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
              disabled={loading}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {isSignUp ? "Criando conta..." : "Entrando..."}
                </div>
              ) : isSignUp ? (
                "Criar Conta"
              ) : (
                "Entrar"
              )}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex flex-col space-y-4">
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
        </CardFooter>
      </Card>
    </div>
  );
}
