import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePortalAuth } from "@/contexts/PortalAuthContext";
import { Loader2, QrCode } from "lucide-react";
import { useAppConfig } from "@/hooks/useAppConfig";
import LoginBackgroundDefault from "@/assets/login-background-default.png";

export default function PortalLogin() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { login } = usePortalAuth();
  const { config } = useAppConfig();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [userId, setUserId] = useState("");
  const [qrCodeUri, setQrCodeUri] = useState("");
  
  const loginBackground = config.login_image_url || LoginBackgroundDefault;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("portal-auth/login", {
        body: { slug, email, password, totpCode },
      });

      if (error) throw error;

      if (data.needsTotp && !data.token) {
        setNeedsTotp(true);
        setUserId(data.userId);
        toast.info("Configure o Google Authenticator");

        // Buscar QR Code
        const { data: totpData } = await supabase.functions.invoke("portal-auth/configure-totp", {
          body: { userId: data.userId },
        });

        if (totpData) {
          setQrCodeUri(totpData.qrCodeUri);
        }
      } else if (data.token) {
        login(data.token, data.corretora);
        toast.success("Login realizado com sucesso");
        navigate(`/${slug}/dashboard`);
      }
    } catch (error: any) {
      console.error("Login error:", error);
      toast.error(error.message || "Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        backgroundImage: `url(${loginBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Overlay escuro para melhor contraste */}
      <div className="absolute inset-0 bg-black/40" />
      <Card className="w-full max-w-md relative z-10">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Portal BI</CardTitle>
          <CardDescription className="text-center">Business Intelligence - Indicadores</CardDescription>
        </CardHeader>
        <CardContent>
          {!needsTotp ? (
            <form onSubmit={handleLogin} className="space-y-4">
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
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeUri)}`}
                      alt="QR Code TOTP"
                      className="w-48 h-48"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    Escaneie o código QR com o Google Authenticator
                  </p>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
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
