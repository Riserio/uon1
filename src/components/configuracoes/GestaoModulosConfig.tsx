import { useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Blocks, Lock, Search } from "lucide-react";
import { GRUPO_LABEL, SYSTEM_MODULES, type ModuloGrupo } from "@/config/modulos";
import { useModulosDesabilitados } from "@/hooks/useModulosDesabilitados";

/**
 * Gestão global de módulos: habilita/desabilita módulos para TODOS os usuários.
 * Módulos essenciais ficam bloqueados para não travar o acesso ao sistema.
 */
export function GestaoModulosConfig() {
  const { isDesabilitado, definirModulo, loading } = useModulosDesabilitados();
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState<string | null>(null);

  const gruposOrdenados: ModuloGrupo[] = ["nav", "cadastros", "ferramentas"];

  const modulosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return SYSTEM_MODULES.filter((m) => !termo || m.label.toLowerCase().includes(termo));
  }, [busca]);

  const totalDesabilitados = SYSTEM_MODULES.filter((m) => isDesabilitado(m.id)).length;

  const toggle = async (moduloId: string, label: string, ativo: boolean) => {
    setSalvando(moduloId);
    try {
      // `ativo` = o modulo esta habilitado agora. Clicar num habilitado significa
      // DESABILITAR, e o segundo parametro de definirModulo e "desabilitar".
      // Portanto passa-se `ativo`, nao `!ativo`.
      //
      // Antes ia `!ativo`: clicar em habilitado chamava definirModulo(id, false),
      // que e REABILITAR — um DELETE de linha inexistente. O delete voltava com
      // zero linhas, o hook confirmava que a linha nao existe, concluia sucesso e
      // mostrava o toast. Resultado: mensagem positiva, nada gravado, switch
      // imovel e modulo nunca ocultado.
      await definirModulo(moduloId, ativo);
      toast.success(ativo ? `"${label}" desabilitado para todos` : `"${label}" reativado`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar. Verifique suas permissões.");
    } finally {
      setSalvando(null);
    }
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Blocks className="h-5 w-5 text-primary" />
            Módulos do sistema
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Desative módulos que não são mais usados. Ficam ocultos no menu para todos os usuários — sem apagar nada.
          </p>
        </div>
        {totalDesabilitados > 0 && (
          <Badge variant="outline" className="text-muted-foreground">
            {totalDesabilitados} desabilitado{totalDesabilitados > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar módulo..." value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9 rounded-xl" />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Carregando módulos...</p>
      ) : (
        gruposOrdenados.map((grupo) => {
          const itens = modulosFiltrados.filter((m) => m.grupo === grupo);
          if (itens.length === 0) return null;
          return (
            <div key={grupo} className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{GRUPO_LABEL[grupo]}</p>
              <div className="space-y-1.5">
                {itens.map((m) => {
                  const desabilitado = isDesabilitado(m.id);
                  const ativo = !desabilitado;
                  return (
                    <div
                      key={m.id}
                      className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors ${
                        desabilitado ? "border-border/40 bg-muted/30" : "border-border/60"
                      }`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium truncate ${desabilitado ? "text-muted-foreground line-through" : ""}`}>
                            {m.label}
                          </span>
                          {m.essencial && (
                            <Badge variant="outline" className="text-[10px] h-4 gap-1 text-muted-foreground">
                              <Lock className="h-2.5 w-2.5" /> Essencial
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {m.essencial ? "Sempre disponível" : ativo ? "Visível no menu" : "Oculto para todos"}
                        </p>
                      </div>
                      <Switch
                        checked={ativo}
                        disabled={m.essencial || salvando === m.id}
                        onCheckedChange={() => toggle(m.id, m.label, ativo)}
                        aria-label={`${ativo ? "Desabilitar" : "Habilitar"} ${m.label}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
