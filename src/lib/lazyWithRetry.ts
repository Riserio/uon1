import { lazy, type ComponentType } from "react";

/**
 * lazy() resiliente a "Importing a module script failed".
 *
 * Depois de um deploy novo, o index.html em cache aponta pra chunks com hash
 * que não existem mais no servidor. O import dinâmico falha e a tela fica em
 * branco. Aqui tentamos de novo uma vez com cache-buster e, se ainda falhar,
 * recarregamos a página (no máximo uma vez por sessão, pra evitar loop).
 */
const RELOAD_KEY = "__lazy_reload_at";

export function lazyWithRetry<T extends ComponentType<never>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        const url = new URL(window.location.href);
        url.searchParams.set("_cb", String(Date.now()));
        window.location.replace(url.toString());
        // Promessa pendente enquanto a página recarrega.
        return await new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}
