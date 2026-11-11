import { useMemo, useState } from "react";
import { ChevronRight, Eye, EyeOff, Pencil, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  GRUPO_LABEL,
  GRUPO_ORDEM,
  MENU_PERMISSION_ITEMS,
  SUBITENS_MODULO,
  SYSTEM_MODULES,
  chavePermissao,
  type ModuloGrupo,
} from "@/config/modulos";
import type { MapaPermissoes, Permissao } from "@/lib/permissoes";

type Nivel = "nenhum" | "ver" | "editar";

const nivelDe = (p?: Permissao): Nivel =>
  !p || (p.pode_visualizar && p.pode_editar) ? "editar" : p.pode_visualizar ? "ver" : "nenhum";

const permDe = (n: Nivel): Permissao => ({
  pode_visualizar: n !== "nenhum",
  pode_editar: n === "editar",
});

const grupoDoItem = (id: string): ModuloGrupo =>
  SYSTEM_MODULES.find((m) => m.id === id)?.grupo ?? "interno";

function SeletorNivel({
  valor,
  onChange,
  disabled,
  compacto,
}: {
  valor: Nivel;
  onChange: (n: Nivel) => void;
  disabled?: boolean;
  compacto?: boolean;
}) {
  const opcoes: { n: Nivel; label: string; icon: typeof Eye; ativo: string }[] = [
    { n: "nenhum", label: "Oculto", icon: EyeOff, ativo: "bg-muted-foreground/15 text-foreground" },
    { n: "ver", label: "Ver", icon: Eye, ativo: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
    { n: "editar", label: "Editar", icon: Pencil, ativo: "bg-primary/15 text-primary" },
  ];
  return (
    <div className={cn("inline-flex rounded-lg border bg-background p-0.5 shrink-0", disabled && "opacity-40 pointer-events-none")}>
      {opcoes.map(({ n, label, icon: Icon, ativo }) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
            valor === n ? ativo : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={valor === n}
        >
          <Icon className="h-3 w-3" />
          {!compacto && <span className="hidden sm:inline">{label}</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * Editor de permissões em árvore: grupo → módulo → subitem, com três níveis
 * (Oculto / Ver / Editar). Recebe e devolve o mapa COMPLETO (expandido);
 * quem grava usa compactarParaGravar.
 */
export function PermissoesArvore({
  value,
  onChange,
}: {
  value: MapaPermissoes;
  onChange: (m: MapaPermissoes) => void;
}) {
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return GRUPO_ORDEM.map((g) => ({
      id: g,
      label: GRUPO_LABEL[g],
      itens: MENU_PERMISSION_ITEMS.filter((it) => grupoDoItem(it.id) === g).filter((it) => {
        if (!q) return true;
        return (
          it.label.toLowerCase().includes(q) ||
          (SUBITENS_MODULO[it.id] || []).some((s) => s.label.toLowerCase().includes(q))
        );
      }),
    })).filter((g) => g.itens.length > 0);
  }, [busca]);

  const setModulo = (id: string, n: Nivel) => {
    const next = { ...value, [id]: permDe(n) };
    // Ao mudar o módulo, os subitens acompanham (o caso comum). Depois dá
    // para restringir um subitem específico.
    (SUBITENS_MODULO[id] || []).forEach((s) => {
      next[chavePermissao(id, s.id)] = permDe(n);
    });
    onChange(next);
  };

  const setSub = (mod: string, sub: string, n: Nivel) => {
    const modNivel = nivelDe(value[mod]);
    // Subitem não pode ter mais acesso que o módulo
    const efetivo: Nivel = modNivel === "ver" && n === "editar" ? "ver" : n;
    onChange({ ...value, [chavePermissao(mod, sub)]: permDe(efetivo) });
  };

  const setTodos = (ids: string[], n: Nivel) => {
    const next = { ...value };
    ids.forEach((id) => {
      next[id] = permDe(n);
      (SUBITENS_MODULO[id] || []).forEach((s) => (next[chavePermissao(id, s.id)] = permDe(n)));
    });
    onChange(next);
  };

  const todosIds = MENU_PERMISSION_ITEMS.map((i) => i.id);
  const visiveis = todosIds.filter((id) => value[id]?.pode_visualizar !== false).length;

  const toggleAberto = (id: string) =>
    setAbertos((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar módulo ou área..."
            className="pl-9 h-9 rounded-xl"
          />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground whitespace-nowrap">
            {visiveis}/{todosIds.length} módulos visíveis
          </span>
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setTodos(todosIds, "editar")}>
            Liberar tudo
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setTodos(todosIds, "nenhum")}>
            Ocultar tudo
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {grupos.map((g) => (
          <div key={g.id} className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => setTodos(g.itens.map((i) => i.id), "editar")}
                >
                  liberar grupo
                </button>
                <span className="text-muted-foreground/40">·</span>
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => setTodos(g.itens.map((i) => i.id), "nenhum")}
                >
                  ocultar grupo
                </button>
              </div>
            </div>
            <div className="rounded-xl border divide-y bg-card">
              {g.itens.map((it) => {
                const subs = SUBITENS_MODULO[it.id] || [];
                const nivel = nivelDe(value[it.id]);
                const aberto = abertos.has(it.id) || (!!busca && subs.length > 0);
                const subsRestritos = subs.filter(
                  (s) => nivelDe(value[chavePermissao(it.id, s.id)]) !== nivel,
                ).length;
                return (
                  <div key={it.id}>
                    <div className="flex items-center gap-2 px-3 py-2">
                      {subs.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggleAberto(it.id)}
                          className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-muted shrink-0"
                          aria-label={aberto ? "Recolher áreas" : "Mostrar áreas"}
                        >
                          <ChevronRight className={cn("h-4 w-4 transition-transform", aberto && "rotate-90")} />
                        </button>
                      ) : (
                        <span className="w-6 shrink-0" />
                      )}
                      <span className="text-base shrink-0">{it.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-medium truncate", nivel === "nenhum" && "text-muted-foreground")}>
                          {it.label}
                        </p>
                        {subs.length > 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            {subs.length} áreas{subsRestritos > 0 && nivel !== "nenhum" ? ` · ${subsRestritos} com acesso diferente` : ""}
                          </p>
                        )}
                      </div>
                      <SeletorNivel valor={nivel} onChange={(n) => setModulo(it.id, n)} />
                    </div>
                    {aberto && subs.length > 0 && (
                      <div className="bg-muted/30 border-t py-1">
                        {subs.map((s) => {
                          const k = chavePermissao(it.id, s.id);
                          return (
                            <div key={s.id} className="flex items-center gap-2 pl-14 pr-3 py-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                              <p className="flex-1 text-xs truncate">{s.label}</p>
                              <SeletorNivel
                                compacto
                                valor={nivelDe(value[k])}
                                onChange={(n) => setSub(it.id, s.id, n)}
                                disabled={nivel === "nenhum"}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
