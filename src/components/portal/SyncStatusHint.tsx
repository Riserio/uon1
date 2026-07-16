import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Horários (Brasília) em que os schedulers rodam — cron 08–18 a cada 2h.
// Mantido em sincronia com a migration de otimização dos crons.
const SYNC_HOURS = [8, 10, 12, 14, 16, 18];

// Módulo -> tabela de importações (mesma fonte que cada tela usa).
const MODULOS: { chave: string; label: string; tabela: string }[] = [
  { chave: "placas", label: "Placas", tabela: "estudo_base_importacoes" },
  { chave: "cobranca", label: "Cobrança", tabela: "cobranca_importacoes" },
  { chave: "mgf", label: "MGF", tabela: "mgf_importacoes" },
  { chave: "eventos", label: "Eventos", tabela: "sga_importacoes" },
];

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

// Indicador discreto: última sincronização (geral, inline) e detalhe por
// módulo no tooltip. Só leitura.
export default function SyncStatusHint({ corretoraId }: { corretoraId?: string }) {
  const [porModulo, setPorModulo] = useState<Record<string, Date | null>>({});

  useEffect(() => {
    if (!corretoraId) return;
    let cancelado = false;
    (async () => {
      const entradas = await Promise.all(
        MODULOS.map(async (m) => {
          const { data } = await supabase
            .from(m.tabela as never)
            .select("created_at")
            .eq("corretora_id", corretoraId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const ts = (data as { created_at?: string } | null)?.created_at;
          return [m.chave, ts ? new Date(ts) : null] as const;
        })
      );
      if (!cancelado) setPorModulo(Object.fromEntries(entradas));
    })();
    return () => { cancelado = true; };
  }, [corretoraId]);

  const datas = Object.values(porModulo).filter(Boolean) as Date[];
  const maisRecente = datas.length > 0 ? new Date(Math.max(...datas.map((d) => d.getTime()))) : null;

  const detalhe =
    MODULOS.map((m) => {
      const d = porModulo[m.chave];
      return `${m.label}: ${d ? tempoRelativo(d) : "—"}`;
    }).join("\n") + `\nPróxima ~${proximaSync()} (08–18h, a cada 2h)`;

  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 whitespace-nowrap cursor-help"
      title={detalhe}
    >
      <RefreshCw className="h-3 w-3" />
      {maisRecente ? `atualizado ${tempoRelativo(maisRecente)}` : "sync automática"}
      {` · próxima ~${proximaSync()}`}
    </span>
  );
}
