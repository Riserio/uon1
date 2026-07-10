import { useState, useEffect, useCallback } from "react";

// Captura o evento de instalação do PWA (Android/Chrome/Edge) e expõe
// helpers pra saber se já está instalado (modo standalone) e se está no
// iOS Safari (que não tem prompt programático — precisa instrução manual
// de "Compartilhar > Adicionar à Tela de Início").
export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(!!standalone);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => setIsStandalone(true);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome === "accepted";
  }, [deferredPrompt]);

  return {
    canInstall: !!deferredPrompt,
    isIos,
    isStandalone,
    promptInstall,
  };
}
