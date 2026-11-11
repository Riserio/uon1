import { Eye, ShieldCheck } from "lucide-react";
import { GRUPO_LABEL, GRUPO_ORDEM, MENU_PERMISSION_ITEMS, SUBITENS_MODULO, SYSTEM_MODULES } from "@/config/modulos";
import { resolver, type MapaPermissoes } from "@/lib/permissoes";

/** Prévia somente-leitura do que a pessoa vai enxergar com o cargo escolhido. */
export function ResumoAcesso({ mapa, acessoTotal }: { mapa: MapaPermissoes; acessoTotal?: boolean }) {
  if (acessoTotal) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        Este perfil tem acesso total a todos os módulos.
      </div>
    );
  }

  const grupoDe = (id: string) => SYSTEM_MODULES.find((m) => m.id === id)?.grupo ?? "interno";
  const visiveis = MENU_PERMISSION_ITEMS.filter((it) => resolver(mapa, it.id).pode_visualizar);

  if (visiveis.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
        Nenhum módulo liberado — a pessoa verá o menu vazio.
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-muted/20 p-3 space-y-3">
      <p className="text-xs text-muted-foreground">
        Vai ver <strong className="text-foreground">{visiveis.length}</strong> de {MENU_PERMISSION_ITEMS.length} módulos
      </p>
      {GRUPO_ORDEM.map((g) => {
        const itens = visiveis.filter((it) => grupoDe(it.id) === g);
        if (itens.length === 0) return null;
        return (
          <div key={g} className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{GRUPO_LABEL[g]}</p>
            <div className="flex flex-wrap gap-1.5">
              {itens.map((it) => {
                const p = resolver(mapa, it.id);
                const subs = SUBITENS_MODULO[it.id] || [];
                const subsVisiveis = subs.filter((s) => resolver(mapa, it.id, s.id).pode_visualizar);
                const parcial = subs.length > 0 && subsVisiveis.length < subs.length;
                return (
                  <span
                    key={it.id}
                    title={
                      parcial
                        ? `Áreas liberadas: ${subsVisiveis.map((s) => s.label).join(", ") || "nenhuma"}`
                        : undefined
                    }
                    className="inline-flex items-center gap-1 rounded-lg border bg-background px-2 py-1 text-xs"
                  >
                    <span>{it.icon}</span>
                    {it.label}
                    {parcial && (
                      <span className="text-[10px] text-muted-foreground">
                        ({subsVisiveis.length}/{subs.length})
                      </span>
                    )}
                    {!p.pode_editar && <Eye className="h-3 w-3 text-sky-600" aria-label="Somente leitura" />}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        <Eye className="h-3 w-3 text-sky-600" /> somente leitura · (x/y) áreas liberadas dentro do módulo
      </p>
    </div>
  );
}
