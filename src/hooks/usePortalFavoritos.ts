import { useState, useEffect, useCallback } from "react";
import { PortalModule, MODULE_ORDER } from "@/lib/portalModules";

const MAX_FAVORITOS_MOBILE = 4;

type Options = {
  storageKeyPrefix?: string;
  maxFavoritos?: number;
  // Se true, o default é TODOS os módulos disponíveis. Além disso, módulos
  // que passarem a ficar disponíveis DEPOIS (ex.: Ouvidoria habilitada mais
  // tarde) são adicionados automaticamente — preservando remoções explícitas.
  defaultAll?: boolean;
};

const readList = (key: string): PortalModule[] => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PortalModule[]) : [];
  } catch {
    return [];
  }
};

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
  // Guarda os módulos já "conhecidos" na última vez — distingue um módulo
  // NOVO (deve aparecer) de um REMOVIDO de propósito (segue oculto). Só no
  // modo defaultAll (desktop).
  const knownKey = `${storageKey}-known`;

  const computeDefault = useCallback(() => {
    const all = MODULE_ORDER.filter((m) => availableModules.includes(m));
    return defaultAll ? all : all.slice(0, maxFavoritos);
  }, [availableModules, defaultAll, maxFavoritos]);

  const withNewlyAvailable = useCallback(
    (lista: PortalModule[]): PortalModule[] => {
      if (!defaultAll) return lista;
      const known = readList(knownKey);
      const novos = availableModules.filter(
        (m) => !known.includes(m) && !lista.includes(m)
      );
      if (novos.length === 0) return lista;
      return MODULE_ORDER.filter((m) => lista.includes(m) || novos.includes(m));
    },
    [defaultAll, knownKey, availableModules]
  );

  const [favoritos, setFavoritosState] = useState<PortalModule[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed: PortalModule[] = JSON.parse(saved);
        const filtered = parsed.filter((m) => availableModules.includes(m));
        if (filtered.length > 0) {
          return withNewlyAvailable(filtered).slice(0, maxFavoritos);
        }
      }
    } catch {
      // ignora storage corrompido
    }
    return computeDefault();
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(favoritos));
    } catch {
      // storage indisponível — segue
    }
  }, [favoritos, storageKey]);

  const availableKey = availableModules.join(",");

  // Módulos disponíveis mudaram: remove os inexistentes e, no defaultAll,
  // adiciona os novos. Só DEPOIS de calcular os novos é que registramos os
  // "conhecidos" — senão o novo já entraria como conhecido e nunca apareceria.
  useEffect(() => {
    setFavoritosState((prev) => {
      const filtered = prev.filter((m) => availableModules.includes(m));
      const base = filtered.length > 0 ? filtered : computeDefault();
      const next = withNewlyAvailable(base);
      if (next.length === prev.length && next.every((m, i) => m === prev[i])) {
        return prev;
      }
      return next;
    });
    if (defaultAll) {
      try {
        localStorage.setItem(knownKey, JSON.stringify(availableModules));
      } catch {
        // sem persistência
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corretoraId, availableKey]);

  const toggleFavorito = useCallback((mod: PortalModule) => {
    setFavoritosState((prev) => {
      if (prev.includes(mod)) return prev.filter((m) => m !== mod);
      if (prev.length >= maxFavoritos) return prev;
      return MODULE_ORDER.filter((m) => prev.includes(m) || m === mod);
    });
  }, [maxFavoritos]);

  return { favoritos, toggleFavorito, maxFavoritos };
}
