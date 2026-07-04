import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShieldAlert } from "lucide-react";

/** Intervalo mínimo entre popups (evita cascata de diálogos) */
const COOLDOWN_MS = 30_000;

/** Rotas públicas onde o popup não deve aparecer */
const ROTAS_IGNORADAS = ["/auth", "/reset-password", "/f/", "/vistoria/", "/contrato/", "/ouvidoria", "/reportar-problema", "/login"];

/** Erros de infraestrutura/ruído que não devem gerar popup */
const RUIDO_RE = /ResizeObserver|Loading chunk|dynamically imported module|Script error\.?$|Importing a module script failed|AbortError|NetworkError when attempting/i;

/**
 * Popup global de relato de erro.
 * Captura erros não tratados (window.onerror / unhandledrejection) e oferece
 * ao usuário relatar o problema, levando à tela de novo bug com dados pré-preenchidos.
 */
export function ErrorReportPrompt() {
  const [erro, setErro] = useState<{ mensagem: string; url: string } | null>(null);
  const ultimoPopup = useRef(0);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const deveIgnorar = (msg: string) => {
      if (!msg || RUIDO_RE.test(msg)) return true;
      const path = window.location.pathname;
      if (ROTAS_IGNORADAS.some((r) => path.startsWith(r) || path.includes(r))) return true;
      if (Date.now() - ultimoPopup.current < COOLDOWN_MS) return true;
      return false;
    };

    const abrir = (mensagem: string) => {
      ultimoPopup.current = Date.now();
      setErro({ mensagem: mensagem.slice(0, 500), url: window.location.href });
    };

    const onError = (e: ErrorEvent) => {
      const msg = e?.message || "";
      if (deveIgnorar(msg)) return;
      abrir(msg);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = e?.reason?.message || String(e?.reason || "");
      if (deveIgnorar(msg)) return;
      abrir(msg);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fecha o popup se o usuário navegar
  useEffect(() => {
    setErro(null);
  }, [location.pathname]);

  const relatar = () => {
    if (!erro) return;
    const params = new URLSearchParams({
      relatar: "1",
      titulo: `Erro: ${erro.mensagem.slice(0, 100)}`,
      descricao: `Erro capturado automaticamente pelo sistema.\n\nMensagem: ${erro.mensagem}\n\nPágina: ${erro.url}\n\nO que eu estava fazendo: `,
    });
    setErro(null);
    navigate(`/reportar-problema?${params.toString()}`);
  };

  return (
    <AlertDialog open={!!erro} onOpenChange={(o) => { if (!o) setErro(null); }}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <span className="h-9 w-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <ShieldAlert className="h-5 w-5 text-orange-500" />
            </span>
            Ops, ocorreu um erro
          </AlertDialogTitle>
          <AlertDialogDescription>
            Algo não saiu como esperado. Gostaria de relatar esse problema para nossa equipe corrigir?
            {erro && (
              <span className="block mt-2 text-xs font-mono bg-muted/60 rounded-lg px-2.5 py-1.5 text-muted-foreground line-clamp-2">
                {erro.mensagem}
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Não relatar</AlertDialogCancel>
          <AlertDialogAction onClick={relatar}>Relatar erro</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
