import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePortalAuth } from "@/contexts/PortalAuthContext";
import { Loader2 } from "lucide-react";

export default function PortalLogin() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { login } = usePortalAuth();

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [qrCodeUri, setQrCodeUri] = useState("");

  if (!slug) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/20 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center">Portal PID</CardTitle>
            <CardDescription className="text-center">Slug da corretora não informado na URL.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // 1ª etapa: login com e-mail e senha
  const handleLoginSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("portal-auth/login", {
        body: { slug, email, password },
      });

      if (error) throw error;

      // Se a função já devolver token, TOTP já estava configurado e foi validado
      if (data?.token) {
        login(data.token, data.corretora);
        toast.success("Login realizado com sucesso");
        navigate(`/portal/${slug}/dashboard`);
        return;
      }

      // Se a função disser que precisa configurar/verificar TOTP
      if (data?.needsTotp && data.userId) {
        setNeedsTotp(true);
        setUserId(data.userId);
        toast.info("Configure o Google Authenticator");

        // Buscar QR Code (configuração TOTP)
        const { data: totpData, error: totpError } = await supabase.functions.invoke("portal-auth/configure-totp", {
          body: { userId: data.userId },
        });

        if (totpError) {
          console.error("Erro ao configurar TOTP:", totpError);
          toast.error("Erro ao configurar TOTP");
        } else if (totpData?.qrCodeUri) {
          setQrCodeUri(totpData.qrCodeUri);
        }
        return;
      }

      toast.error("Resposta inesperada da autenticação");
    } catch (error: any) {
      console.error("Login error:", error);
      toast.error(error.message || "Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  };

  // 2ª etapa: verificar código TOTP
  const handleVerificarTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      toast.error("Usuário não identificado para verificação TOTP");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("portal-auth/verify-totp", {
        body: { userId, totpCode, slug },
      });

      if (error) throw error;

      if (data?.token) {
        login(data.token, data.corretora);
        toast.success("Autenticação em duas etapas concluída com sucesso");
        navigate(`/portal/${slug}/dashboard`);
      } else {
        toast.error("Não foi possível completar o login. Tente novamente.");
      }
    } catch (error: any) {
      console.error("Verify TOTP error:", error);
      toast.error(error.message || "Erro ao verificar código TOTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Portal PID</CardTitle>
          <CardDescription className="text-center">
            Painel de Indicadores e Demonstrativos
            <div className="mt-1 text-xs text-muted-foreground">
              Corretora: <span className="font-semibold">{slug.toUpperCase()}</span>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!needsTotp ? (
            <form onSubmit={handleLoginSenha} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Entrar
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              {qrCodeUri && (
                <div className="flex flex-col items-center space-y-4">
                  <div className="p-4 bg-white rounded-lg">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                        qrCodeUri,
                      )}`}
                      alt="QR Code TOTP"
                      className="w-48 h-48"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    Escaneie o código QR com o Google Authenticator. Depois, digite abaixo o código de 6 dígitos.
                  </p>
                </div>
              )}

              <form onSubmit={handleVerificarTotp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="totpCode">Código do Google Authenticator</Label>
                  <Input
                    id="totpCode"
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    placeholder="000000"
                    maxLength={6}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verificar e Entrar
                </Button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
