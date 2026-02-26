import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, HelpCircle, XCircle, Loader2 } from "lucide-react";

export default function MeetingRsvp() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const resposta = params.get("resposta");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [meetingName, setMeetingName] = useState("");

  useEffect(() => {
    if (!token || !resposta) {
      setStatus("error");
      return;
    }

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-rooms?action=rsvp&token=${token}&resposta=${resposta}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setMeetingName(data.meetingName || "");
        setStatus("success");
      })
      .catch(() => setStatus("error"));
  }, [token, resposta]);

  const config: Record<string, { icon: React.ReactNode; title: string; color: string; bg: string }> = {
    sim: {
      icon: <CheckCircle2 className="h-16 w-16 text-green-500" />,
      title: "Presença confirmada!",
      color: "text-green-600",
      bg: "bg-green-50 dark:bg-green-950/30",
    },
    talvez: {
      icon: <HelpCircle className="h-16 w-16 text-amber-500" />,
      title: "Resposta registrada como 'Talvez'",
      color: "text-amber-600",
      bg: "bg-amber-50 dark:bg-amber-950/30",
    },
    nao: {
      icon: <XCircle className="h-16 w-16 text-red-500" />,
      title: "Você declinou o convite",
      color: "text-red-600",
      bg: "bg-red-50 dark:bg-red-950/30",
    },
  };

  const c = config[resposta || ""] || config.sim;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="bg-card rounded-2xl shadow-xl border border-border/50 p-10 max-w-md w-full text-center space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {status === "loading" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">Registrando sua resposta...</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="flex items-center justify-center gap-4 mb-2">
              <img src="/images/logo-full.png" alt="Logo" className="h-8 object-contain" />
              <div className="w-px h-8 bg-border" />
              <img src="/images/logo-vg.png" alt="Vangard" className="h-8 object-contain" />
            </div>
            <div className={`inline-flex p-4 rounded-full ${c.bg}`}>{c.icon}</div>
            <h2 className={`text-2xl font-bold ${c.color}`}>{c.title}</h2>
            {meetingName && (
              <span className="inline-block bg-muted text-foreground text-sm font-semibold px-4 py-1.5 rounded-full">
                📹 {meetingName}
              </span>
            )}
            <p className="text-muted-foreground text-sm">Você já pode fechar esta página.</p>
            <div className="pt-4 border-t border-border/50 text-[11px] text-muted-foreground/60 tracking-wider">
              TALK BY UON1
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="h-16 w-16 text-destructive mx-auto" />
            <h2 className="text-xl font-bold text-destructive">Link inválido ou expirado</h2>
            <p className="text-muted-foreground text-sm">Não foi possível registrar sua resposta.</p>
          </>
        )}
      </div>
    </div>
  );
}
