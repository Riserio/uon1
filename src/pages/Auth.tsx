import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { signInSchema, signUpSchema } from '@/lib/validationSchemas';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import loginBackground from '@/assets/login-background.jpg';
export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState(loginBackground);
  const {
    signIn,
    signUp,
    user
  } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    loadLoginImage();
  }, []);
  const loadLoginImage = async () => {
    const {
      data
    } = await supabase.from('app_config').select('login_image_url').single();
    if (data?.login_image_url) {
      setBackgroundImage(data.login_image_url);
    }
  };

  // Removed automatic redirect - useAuth hook now handles status verification

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const validated = signInSchema.parse({
        email,
        password
      });
      const {
        error
      } = await signIn(validated.email, validated.password);
      if (error) {
        toast.error(error.message || 'Erro ao fazer login');
      } else {
        toast.success('Login realizado com sucesso!');
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
      const validated = signUpSchema.parse({
        nome,
        email,
        password
      });
      const {
        error
      } = await signUp(validated.email, validated.password, validated.nome);
      if (error) {
        toast.error(error.message || 'Erro ao criar conta');
      } else {
        toast.success('Conta criada! Aguarde aprovação de um administrador para fazer login.');
        setEmail('');
        setPassword('');
        setNome('');
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
    }
    setLoading(false);
  };
  return <div className="min-h-screen flex overflow-hidden">
      {/* Left Side - Decorative Background */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{
        backgroundImage: `url(${backgroundImage})`
      }} />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/90 to-primary/70" />
        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <h1 className="text-5xl font-bold mb-6">Bem-vindo ao ATCD!</h1>
          <p className="text-xl opacity-90">
            Faça login para acessar sua conta.
          </p>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <Card className="w-full max-w-md border-0 shadow-none">
          <CardHeader className="space-y-2 pb-8">
            <CardTitle className="text-3xl font-bold text-center">
              {isSignUp ? 'Criar Conta' : 'Entrar'}
            </CardTitle>
            <CardDescription className="text-center text-base">
              {isSignUp ? 'Crie sua conta' : 'Digite suas credenciais para acessar sua conta'}
            </CardDescription>
          </CardHeader>
          
          {!isSignUp ? <form onSubmit={handleSignIn}>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" placeholder="Digite seu e-mail" value={email} onChange={e => setEmail(e.target.value)} required className="h-12" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Senha</Label>
                    <Button type="button" variant="link" className="text-xs p-0 h-auto text-primary" onClick={() => navigate('/reset-password')}>
                      Esqueceu a senha?
                    </Button>
                  </div>
                  <Input id="password" type="password" placeholder="Digite sua senha" value={password} onChange={e => setPassword(e.target.value)} required className="h-12" />
                </div>
              </CardContent>
              <CardFooter className="flex-col space-y-4">
                <Button type="submit" className="w-full h-12 bg-primary hover:bg-primary/90" disabled={loading}>
                  {loading ? 'Entrando...' : 'Entrar'}
                </Button>
                <p className="text-sm text-center text-muted-foreground">
                  Não tem uma conta?{' '}
                  <Button type="button" variant="link" className="p-0 h-auto text-primary" onClick={() => setIsSignUp(true)}>
                    Criar conta
                  </Button>
                </p>
              </CardFooter>
            </form> : <form onSubmit={handleSignUp}>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="signup-nome">Nome Completo</Label>
                  <Input id="signup-nome" type="text" placeholder="Digite seu nome completo" value={nome} onChange={e => setNome(e.target.value)} required className="h-12" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">E-mail</Label>
                  <Input id="signup-email" type="email" placeholder="Digite seu e-mail" value={email} onChange={e => setEmail(e.target.value)} required className="h-12" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Senha</Label>
                  <Input id="signup-password" type="password" placeholder="Crie uma senha" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} className="h-12" />
                </div>
              </CardContent>
              <CardFooter className="flex-col space-y-4">
                <Button type="submit" className="w-full h-12 bg-primary hover:bg-primary/90" disabled={loading}>
                  {loading ? 'Criando conta...' : 'Criar Conta'}
                </Button>
                <p className="text-sm text-center text-muted-foreground">
                  Já tem uma conta?{' '}
                  <Button type="button" variant="link" className="p-0 h-auto text-primary" onClick={() => setIsSignUp(false)}>
                    Entrar
                  </Button>
                </p>
              </CardFooter>
            </form>}
        </Card>
      </div>
    </div>;
}