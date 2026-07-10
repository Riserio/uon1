import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// O manifest.json (ícone usado no Android ao "Adicionar à tela inicial")
// já é servido dinamicamente pela edge function pwa-manifest, então não
// precisa de nada aqui. O apple-touch-icon (ícone do iOS) é diferente: o
// Safari lê a tag <link rel="apple-touch-icon"> presente no DOM no
// momento em que o usuário toca em "Adicionar à Tela de Início" — então
// dá pra trocar o href dessa tag via JS, sem precisar de rebuild, desde
// que isso rode antes do usuário tocar em compartilhar. Roda uma vez, no
// carregamento do app.
//
// Importante: isso NUNCA mexe no <link rel="icon"> (ícone da aba do
// navegador) — aquele fica só com o valor padrão do navegador, de
// propósito, conforme pedido do usuário.
export function useDynamicAppIcon() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("platform_settings")
          .select("app_icon_apple_url")
          .eq("id", "global")
          .maybeSingle();

        if (cancelled || !data?.app_icon_apple_url) return;

        let link = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
        if (!link) {
          link = document.createElement("link");
          link.rel = "apple-touch-icon";
          document.head.appendChild(link);
        }
        link.href = data.app_icon_apple_url;
      } catch (e) {
        console.error("[useDynamicAppIcon] failed to load custom icon:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
