import { useEffect, useRef } from "react";

/**
 * Executa `callback` a cada `ms` milissegundos, mas SÓ enquanto a aba estiver
 * visível. Com a aba oculta não dispara nenhuma requisição; ao voltar para a
 * aba, executa uma vez na hora (se já tiver passado o intervalo) para a tela
 * não ficar desatualizada.
 *
 * Use no lugar de `setInterval(fn, ms)` para polling de dados — reduz o
 * consumo de requisições quando o usuário deixa abas abertas em segundo plano.
 */
export function useVisibleInterval(
  callback: () => void,
  ms: number | null,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const cbRef = useRef(callback);
  cbRef.current = callback;
  const lastRunRef = useRef(Date.now());

  useEffect(() => {
    if (!enabled || ms == null) return;
    lastRunRef.current = Date.now();

    const run = () => {
      lastRunRef.current = Date.now();
      cbRef.current();
    };

    const id = setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, ms);

    const onVisibility = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRunRef.current >= ms) {
        run();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ms, enabled]);
}
