import { useState, useEffect, useCallback } from "react";
import { PortalModule, MODULE_ORDER } from "@/lib/portalModules";

const MAX_FAVORITOS = 4;

// Favoritos da barra flutuante mobile. Não existe coluna no banco pra isso
// (checado: profiles e corretora_usuarios não têm campo de preferência
// pessoal), então fica em localStorage, escopado por corretora — mesmo
// padrão já usado em "portal-sidebar-expanded" e "portal-carousel-config".
export function usePortalFavoritos(corretoraId: string, availableModules: PortalModule[]) {
  const storageKey = `portal-favoritos-${corretoraId}`;

  const [favoritos, setFavoritosState] = useState<PortalModule[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed: PortalModule[] = JSON.parse(saved);
        const filtered = parsed.filter((m) => availableModules.includes(m));
        if (filtered.length > 0) return filtered.slice(0, MAX_FAVORITOS);
      }
    } catch {
      // ignora storage corrompido, cai no default abaixo
    }
    return MODULE_ORDER.filter((m) => availableModules.includes(m)).slice(0, MAX_FAVORITOS);
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(favoritos));
    } catch {
      // storage indisponível (modo privado etc) — segue sem persistir
    }
  }, [favoritos, storageKey]);

  // Se os módulos disponíveis mudarem (ex.: trocou de associação) e algum
  // favorito salvo não existir mais, recalcula a partir do default.
  const availableKey = availableModules.join(",");
  useEffect(() => {
    setFavoritosState((prev) => {
      const filtered = prev.filter((m) => availableModules.includes(m));
      if (filtered.length === prev.length && filtered.length > 0) return prev;
      if (filtered.length > 0) return filtered;
      return MODULE_ORDER.filter((m) => availableModules.includes(m)).slice(0, MAX_FAVORITOS);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corretoraId, availableKey]);

  const toggleFavorito = useCallback((mod: PortalModule) => {
    setFavoritosState((prev) => {
      if (prev.includes(mod)) return prev.filter((m) => m !== mod);
      if (prev.length >= MAX_FAVORITOS) return prev;
      return [...prev, mod];
    });
  }, []);

  return { favoritos, toggleFavorito, maxFavoritos: MAX_FAVORITOS };
}
