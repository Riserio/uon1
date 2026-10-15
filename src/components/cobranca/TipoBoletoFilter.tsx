import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type TipoBoleto = { tipo: string; descricao: string | null; grupo: string; ordem: number; qtd: number };

const GRUPOS: { id: string; label: string }[] = [
  { id: "mensalidade", label: "Mensalidade" },
  { id: "cobranca", label: "Cobrança" },
  { id: "taxa", label: "Taxas" },
  { id: "evento", label: "Eventos" },
  { id: "outros", label: "Outros" },
];

/** Lista os tipos de boleto da associação (cache 30 min, sem polling). */
export function useTiposBoleto(corretoraId: string | null | undefined) {
  return useQuery({
    queryKey: ["listar_tipos_boleto", corretoraId],
    enabled: !!corretoraId,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<TipoBoleto[]> => {
      const { data, error } = await supabase.rpc("listar_tipos_boleto" as never, { p_corretora_id: corretoraId } as never);
      if (error) throw error;
      return ((data as unknown as TipoBoleto[]) || []).map((t) => ({ ...t, qtd: Number(t.qtd) || 0 }));
    },
  });
}

/** Padrão do relatório diário da associação (cobranca_automacao_config.tipos_boleto_relatorio). */
export function useTiposBoletoRelatorio(corretoraId: string | null | undefined) {
  return useQuery({
    queryKey: ["tipos_boleto_relatorio", corretoraId],
    enabled: !!corretoraId,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<string[]> => {
      const { data } = await supabase
        .from("cobranca_automacao_config")
        .select("tipos_boleto_relatorio")
        .eq("corretora_id", corretoraId!)
        .maybeSingle();
      const v = (data as { tipos_boleto_relatorio?: string[] | null } | null)?.tipos_boleto_relatorio;
      return Array.isArray(v) && v.length ? v : ["FECHAMENTO"];
    },
  });
}

type Props = {
  corretoraId: string | null | undefined;
  /** Lista vazia = todos os tipos. */
  selected: string[];
  onChange: (v: string[]) => void;
  className?: string;
};

export default function TipoBoletoFilter({ corretoraId, selected, onChange, className }: Props) {
  const { data: tipos = [], isLoading } = useTiposBoleto(corretoraId);

  const porGrupo = useMemo(
    () =>
      GRUPOS.map((g) => ({ ...g, itens: tipos.filter((t) => (t.grupo || "outros") === g.id) })).filter(
        (g) => g.itens.length > 0,
      ),
    [tipos],
  );

  const mensalidades = tipos.filter((t) => t.grupo === "mensalidade").map((t) => t.tipo);
  const resumo =
    selected.length === 0
      ? "Todos os tipos"
      : selected.length === 1
        ? selected[0]
        : `${selected.length} tipos`;

  const toggle = (t: string) => onChange(selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t]);
  const toggleGrupo = (itens: string[]) => {
    const todos = itens.every((i) => selected.includes(i));
    onChange(todos ? selected.filter((s) => !itens.includes(s)) : Array.from(new Set([...selected, ...itens])));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("h-9 justify-between text-xs font-normal", className)}>
          <span className="truncate">{resumo}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <div className="mb-2 flex gap-1">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 flex-1 text-xs"
            onClick={() => onChange(mensalidades.length ? mensalidades : ["FECHAMENTO"])}
          >
            Só mensalidades
          </Button>
          <Button size="sm" variant="secondary" className="h-7 flex-1 text-xs" onClick={() => onChange([])}>
            Todos
          </Button>
        </div>
        {isLoading && <p className="px-2 py-3 text-xs text-muted-foreground">Carregando tipos…</p>}
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {porGrupo.map((g) => (
            <div key={g.id}>
              <button
                type="button"
                className="w-full px-2 py-1 text-left text-[11px] font-bold uppercase tracking-wider text-primary"
                onClick={() => toggleGrupo(g.itens.map((i) => i.tipo))}
              >
                {g.label}
              </button>
              {g.itens.map((t) => (
                <label
                  key={t.tipo}
                  className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted"
                >
                  <Checkbox className="mt-0.5" checked={selected.includes(t.tipo)} onCheckedChange={() => toggle(t.tipo)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex justify-between gap-2">
                      <span className="truncate font-medium">{t.tipo}</span>
                      <span className="tabular-nums text-muted-foreground">{t.qtd.toLocaleString("pt-BR")}</span>
                    </span>
                    {t.descricao && <span className="block text-[11px] text-muted-foreground">{t.descricao}</span>}
                  </span>
                </label>
              ))}
            </div>
          ))}
        </div>
        <p className="mt-2 flex items-start gap-1 border-t pt-2 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" /> Quantidades dos últimos 90 dias. Nenhum marcado = todos os tipos.
        </p>
      </PopoverContent>
    </Popover>
  );
}
