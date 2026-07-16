import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Horários (Brasília) em que os schedulers rodam — cron 08–18 a cada 2h.
// Mantido em sincronia com a migration de otimização dos crons.
const SYNC_HOURS = [8, 10, 12, 14, 16, 18];

function tempoRelativo(d: Date): string {
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function proximaSync(): string {
  const now = new Date();
  const alvo = SYNC_HOURS.find((x) => x > now.getHours()) ?? SYNC_HOURS[0];
  return `${String(alvo).padStart(2, "0")}:00`;
}

// Indicador discreto: última sincronização (última importação da base) e
// horário aproximado da próxima. Só leitura, sem impacto de custo relevante.
export default function SyncStatusHint({ corretoraId }: { corretoraId?: string }) {
  const [ultima, setUltima] = useState<Date | null>(null);

  useEffect(() => {
    if (!corretoraId) return;
    let cancelado = false;
    (async () => {
      const { data } = await supabase
        .from("estudo_base_importacoes")
        .select("created_at")
        .eq("corretora_id", corretoraId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelado && data?.created_at) setUltima(new Date(data.created_at));
    })();
    return () => { cancelado = true; };
  }, [corretoraId]);

  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 whitespace-nowrap"
      title="Sincronização automática com a base (08h–18h, a cada 2h)"
    >
      <RefreshCw className="h-3 w-3" />
      {ultima ? `atualizado ${tempoRelativo(ultima)}` : "sync automática"}
      {` · próxima ~${proximaSync()}`}
    </span>
  );
}
