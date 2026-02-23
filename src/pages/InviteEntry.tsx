import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Video, Users } from "lucide-react";

export default function InviteEntry() {
  const { inviteId } = useParams<{ inviteId: string }>();
  const navigate = useNavigate();
  const [roomInfo, setRoomInfo] = useState<{ nome: string; descricao?: string } | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string>("");

  useEffect(() => {
    validateInvite();
  }, [inviteId]);

  const validateInvite = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=validateInvite&inviteId=${inviteId}`
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRoomInfo(data.room);
    } catch (e: any) {
      setError(e.message || "Convite inválido");
    }
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!displayName.trim()) { toast.error("Informe seu nome"); return; }
    setJoining(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=joinViaInvite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inviteId, displayName }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setToken(data.token);
      setLivekitUrl(data.livekitUrl);
      toast.success("Conectando... Aguarde aprovação do moderador.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao entrar");
    }
    setJoining(false);
  };

  const LogoBanner = () => (
    <div className="flex items-center justify-center gap-3">
      <img src="/images/logo-full.png" alt="UON1" className="h-8 w-auto" />
      <div className="h-6 w-px bg-border" />
      <img src="/images/logo-vg.png" alt="Vangard" className="h-8 w-auto" />
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center space-y-4">
            <LogoBanner />
            <Video className="h-10 w-10 mx-auto text-destructive" />
            <h2 className="text-xl font-semibold">Convite Inválido</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (token && livekitUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center space-y-4">
            <LogoBanner />
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Sala de Espera</h2>
            <p className="text-muted-foreground">
              Aguardando aprovação do moderador para entrar em <strong>{roomInfo?.nome}</strong>
            </p>
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-muted-foreground">Você será conectado automaticamente quando aprovado</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30">
      <Card className="max-w-md w-full mx-4">
        <CardContent className="p-8 space-y-6">
          <div className="text-center space-y-3">
            <LogoBanner />
            <div className="pt-1">
              <h2 className="text-lg font-semibold flex items-center justify-center gap-1.5">
                <span className="text-primary">Talk</span>
                <span className="text-xs text-muted-foreground font-normal">by Uon1</span>
              </h2>
              <p className="text-muted-foreground mt-1">
                Você foi convidado para: <strong>{roomInfo?.nome}</strong>
              </p>
              {roomInfo?.descricao && <p className="text-sm text-muted-foreground">{roomInfo.descricao}</p>}
            </div>
          </div>

          <div>
            <Label>Seu nome</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Como deseja ser identificado?"
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
          </div>

          <Button onClick={handleJoin} disabled={joining} className="w-full gap-2" size="lg">
            <Video className="h-5 w-5" />
            {joining ? "Conectando..." : "Entrar na Sala"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
