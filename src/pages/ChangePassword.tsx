import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';

const changePasswordSchema = z.object({
  password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres'),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword']
});

export default function ChangePassword() {
  const { user, clearMustChangePassword, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [pedirSenhaAtual, setPedirSenhaAtual] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/auth');
    }
  }, [user, navigate]);

  const concluir = async () => {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        status: 'ativo',
        force_password_change: false
      })
      .eq('id', user?.id);

    if (profileError) console.error('Error updating profile:', profileError);

    clearMustChangePassword();
    toast.success('Senha definida com sucesso!');
    setTimeout(() => navigate('/', { replace: true }), 800);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      changePasswordSchema.parse({ password, confirmPassword });

      const payload: { password: string; current_password?: string } = { password };
      if (currentPassword) payload.current_password = currentPassword;

      const { error } = await supabase.auth.updateUser(payload as any);

      if (error) {
        const msg = (error.message || '').toLowerCase();

        // Reutilizar uma senha anterior é permitido: seguimos normalmente
        if (msg.includes('different from the old password') || msg.includes('should be different')) {
          await concluir();
          return;
        }

        if (msg.includes('current password')) {
          setPedirSenhaAtual(true);
          toast.error('Digite também a senha atual (a que você recebeu por e-mail).');
          setLoading(false);
          return;
        }

        if (msg.includes('pwned') || msg.includes('compromised')) {
          toast.error('Essa senha é muito comum. Escolha outra.');
          setLoading(false);
          return;
        }

        throw error;
      }

      await concluir();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        toast.error(error?.message || 'Erro ao alterar senha');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2">
          <CardTitle className="font-serif text-2xl font-semibold text-center">Crie sua nova senha</CardTitle>
          <CardDescription className="text-center">
            Por segurança, defina uma senha pessoal antes de acessar o sistema.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleChangePassword}>
          <CardContent className="space-y-4">
            {pedirSenhaAtual && (
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Senha atual</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  placeholder="••••••••"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">A senha temporária que você recebeu por e-mail</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">Nova Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar nova senha'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => signOut()}
            >
              Sair
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
