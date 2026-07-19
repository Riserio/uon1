import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const HORARIOS_PADRAO = [8, 14];

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

// Próximo horário agendado (Brasília) a partir da lista configurada.
function proximaSync(horarios: number[]): string {
  const lista = [...horarios].sort((a, b) => a - b);
  if (lista.length === 0) return "—";
  const h = new Date().getHours();
  const alvo = lista.find((x) => x > h) ?? lista[0];
  return `${String(alvo).padStart(2, "0")}:00`;
}

// Indicador discreto: última sincronização (geral, inline) e detalhe por
// módulo no tooltip. "Próxima" segue os horários configurados (horarios_sync).
export default function SyncStatusHint({
  corretoraId,
  modulo,
}: {
  corretoraId?: string;
  /**
   * Quando informado, o carimbo mostra a data DESTE modulo em vez da mais
   * recente entre todos. Cada tela do PID olha uma importacao diferente —
   * dizer "dados de 19/07 10:04" sem especificar de que modulo induz a erro,
   * porque cobranca, base, MGF e eventos sincronizam em momentos distintos.
   */
  modulo?: "placas" | "cobranca" | "mgf" | "eventos";
}) {
  const [porModulo, setPorModulo] = useState<Record<string, Date | null>>({});
  const [horarios, setHorarios] = useState<number[]>(HORARIOS_PADRAO);

  useEffect(() => {
    if (!corretoraId) return;
    let cancelado = false;
    (async () => {
      // Horários configurados da associação (default 08h/14h).
      const { data: cred } = await supabase
        .from("hinova_credenciais")
        .select("horarios_sync")
        .eq("corretora_id", corretoraId)
        .maybeSingle();
      const hs = (cred as { horarios_sync?: number[] } | null)?.horarios_sync;
      if (!cancelado && Array.isArray(hs) && hs.length > 0) setHorarios(hs);

      const entradas = await Promise.all(
        MODULOS.map(async (m) => {
          // updated_at, nao created_at: a importacao e REUTILIZADA a cada rodada
          // (getOrCreateImportacaoAtiva), entao created_at e a data em que ela
          // nasceu — podia ter dias — enquanto updated_at e a sincronizacao real.
          // Com created_at a tela dizia "atualizado ha 14h" quando o dado tinha
          // sido atualizado de manha.
          const { data } = await supabase
            .from(m.tabela as never)
            .select("created_at, updated_at")
            .eq("corretora_id", corretoraId)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const reg = data as { created_at?: string; updated_at?: string } | null;
          const ts = reg?.updated_at ?? reg?.created_at;
          return [m.chave, ts ? new Date(ts) : null] as const;
        })
      );
      if (!cancelado) setPorModulo(Object.fromEntries(entradas));
    })();
    return () => { cancelado = true; };
  }, [corretoraId]);

  const datas = Object.values(porModulo).filter(Boolean) as Date[];
  const maisRecente = modulo
    ? porModulo[modulo] ?? null
    : datas.length > 0
      ? new Date(Math.max(...datas.map((d) => d.getTime())))
      : null;
  const rotuloModulo = modulo ? MODULOS.find((m) => m.chave === modulo)?.label : null;
  const prox = proximaSync(horarios);
  const listaHorarios = [...horarios].sort((a, b) => a - b).map((h) => `${String(h).padStart(2, "0")}:00`).join(", ");

  const absoluto = (d: Date) =>
    d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  const detalhe =
    MODULOS.map((m) => {
      const d = porModulo[m.chave];
      return `${m.label}: ${d ? `${absoluto(d)} (${tempoRelativo(d)})` : "—"}`;
    }).join("\n") +
    `\nHorários: ${listaHorarios}` +
    `\n\nOs números refletem a base nesta data/hora. O SGA consultado em outro` +
    `\nmomento pode divergir — pagamentos e prorrogações acontecem no intervalo.`;

  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 whitespace-nowrap cursor-help"
      title={detalhe}
    >
      <RefreshCw className="h-3 w-3" />
      {maisRecente
        ? `${rotuloModulo ? rotuloModulo + ": " : ""}dados de ${absoluto(maisRecente)}`
        : "sync automática"}
      {` · próxima ~${prox}`}
    </span>
  );
}
