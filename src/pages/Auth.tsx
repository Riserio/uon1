import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { signInSchema, signUpSchema } from '@/lib/validationSchemas';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

type Step = 'CREDENTIALS' | 'TOTP';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const [step, setStep] = useState<Step>('CREDENTIALS');
  const [totpCode, setTotpCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 🔐 controla se já validou o TOTP (só faz sentido pra parceiro)
  const [totpValidated, setTotpValidated] = useState(false);
  // loading pós-login até descobrir o papel
  const [checkingRole, setCheckingRole] = useState(false);

  const { signIn, signUp, user, userRole, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // helper pra identificar parceiro
  const isPartner =
    userRole === 'partner' ||
    userRole === 'parceiro' ||
    userRole === 'parceiro_externo';

  // 🔐 Decisão central de pra onde mandar o usuário
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    // se ainda estamos checando papel depois do login, só continua quando já tiver role
    if (checkingRole && !userRole) return;

    if (isPartner) {
      // parceiro SEM TOTP validado → fica na tela de TOTP
      if (!totpValidated) {
        setStep('TOTP');
        setCheckingRole(false);
        return;
      }

      // parceiro COM TOTP ok → manda pro PID
      navigate('/pid', { replace: true });
      return;
    }

    // NÃO parceiro → fluxo normal, sem TOTP
    navigate('/dashboard', { replace: true });
  }, [
    authLoading,
    user,
    userRole,
    isPartner,
    totpValidated,
    checkingRole,
    navigate,
  ]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const validated = signInSchema.parse({ email, password });

      const { error } = await signIn(validated.email, validated.password);

      if (error) {
        toast.error(error.message || 'Erro ao fazer login');
        setCheckingRole(false);
      } else {
        // credencial ok → agora vamos descobrir o papel
        setCheckingRole(true);
        toast.success('Credenciais válidas! Validando seu acesso...');
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
      const { error } = await signUp(
        validated.email,
        validated.password,
        validated.nome
      );

      if (error) {
        toast.error(error.message || 'Erro ao criar conta');
      } else {
        toast.success(
          'Conta criada! Aguarde aprovação de um administrador para fazer login.'
        );
        setEmail('');
        setPassword('');
        setNome('');
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
      const { data, error } = await supab
