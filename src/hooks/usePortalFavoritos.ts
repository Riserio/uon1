import { useState, useEffect, useCallback } from "react";
import { PortalModule, MODULE_ORDER } from "@/lib/portalModules";

const MAX_FAVORITOS_MOBILE = 4;

type Options = {
  // Prefixo da chave no localStorage. Permite ter listas independentes
  // (ex.: 4 favoritos no mobile x todos os módulos no desktop) sem uma
  // sobrescrever a outra.
  storageKeyPrefix?: string;
  // Limite de itens selecionáveis. No mobile = 4; no desktop = todos.
  maxFavoritos?: number;
  // Se true, o default (quando o usuário nunca editou) é TODOS os módulos
  // disponíveis em vez dos primeiros N.
  defaultAll?: boolean;
};

// Lista de módulos exibidos na barra do Portal. Não existe coluna no banco
// pra isso (checado: profiles e corretora_usuarios não têm campo de
// preferência pessoal), então fica em localStorage, escopado por corretora
// — mesmo padrão já usado em "portal-sidebar-expanded" e
// "portal-carousel-config".
export function usePortalFavoritos(
  corretoraId: string,
  availableModules: PortalModule[],
  options: Options = {}
) {
  const {
    storageKeyPrefix = "portal-favoritos",
    maxFavoritos = MAX_FAVORITOS_MOBILE,
    defaultAll = false,
  } = options;

  const storageKey = `${storageKeyPrefix}-${corretoraId}`;

  const computeDefault = useCallback(() => {
    const all = MODULE_ORDER.filter((m) => availableModules.includes(m));
    return defaultAll ? all : all.slice(0, maxFavoritos);
  }, [availableModules, defaultAll, maxFavoritos]);

  const [favoritos, setFavoritosState] = useState<PortalModule[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed: PortalModule[] = JSON.parse(saved);
        const filtered = parsed.filter((m) => availableModules.includes(m));
        if (filtered.length > 0) return filtered.slice(0, maxFavoritos);
      }
    } catch {
      // ignora storage corrompido, cai no default abaixo
    }
    return computeDefault();
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(favoritos));
    } catch {
      // storage indisponível (modo privado etc) — segue sem persistir
    }
  }, [favoritos, storageKey]);

  // Se os módulos disponíveis mudarem (ex.: trocou de associação) e algum
  // item salvo não existir mais, recalcula a partir do default.
  const availableKey = availableModules.join(",");
  useEffect(() => {
    setFavoritosState((prev) => {
      const filtered = prev.filter((m) => availableModules.includes(m));
      if (filtered.length === prev.length && filtered.length > 0) return prev;
      if (filtered.length > 0) return filtered;
      return computeDefault();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corretoraId, availableKey]);

  const toggleFavorito = useCallback((mod: PortalModule) => {
    setFavoritosState((prev) => {
      if (prev.includes(mod)) return prev.filter((m) => m !== mod);
      if (prev.length >= maxFavoritos) return prev;
      // preserva a ordem canônica dos módulos ao (re)adicionar
      return MODULE_ORDER.filter((m) => prev.includes(m) || m === mod);
    });
  }, [maxFavoritos]);

  return { favoritos, toggleFavorito, maxFavoritos };
}
