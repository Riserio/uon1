import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// Inicializa o OneSignal Web SDK no Portal do Parceiro e marca a inscrição
// com tags de segmentação (corretora, localização e tipo). O App ID vem da
// RPC get_push_app_id (só retorna valor quando o Push está ativo na aba
// Push da Central de Atendimento).
//
// O worker do OneSignal fica em /onesignal/OneSignalSDKWorker.js com escopo
// próprio pra não conflitar com o /sw.js do PWA.

declare global {
  interface Window {
    // deno-lint-ignore no-explicit-any
    OneSignalDeferred?: any[];
    __oneSignalLoaded?: boolean;
  }
}

type PortalTags = {
  corretora_id: string;
  corretora_nome?: string | null;
};

export function useOneSignalPortal(tags: PortalTags | null) {
  useEffect(() => {
    if (!tags?.corretora_id) return;

    let cancelled = false;

    (async () => {
      try {
        const { data: cfg } = await supabase.rpc("get_push_web_config" as never);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const webCfg = cfg as any;
        const appId = webCfg?.app_id as string | undefined;
        if (cancelled || !appId) return;

        // Localização da associação (para segmentação por estado/cidade)
        const { data: corr } = await supabase
          .from("corretoras")
          .select("estado, cidade")
          .eq("id", tags.corretora_id)
          .maybeSingle();
        if (cancelled) return;

        window.OneSignalDeferred = window.OneSignalDeferred || [];

        if (!window.__oneSignalLoaded) {
          window.__oneSignalLoaded = true;
          const script = document.createElement("script");
          script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
          script.defer = true;
          document.head.appendChild(script);

          // deno-lint-ignore no-explicit-any
          window.OneSignalDeferred.push(async (OneSignal: any) => {
            await OneSignal.init({
              appId: String(appId),
              ...(webCfg?.safari_web_id ? { safari_web_id: String(webCfg.safari_web_id) } : {}),
              // Worker em /onesignal/ com escopo próprio pra NÃO substituir o
              // /sw.js do PWA (dois SWs não podem dividir o mesmo escopo).
              serviceWorkerPath: "onesignal/OneSignalSDKWorker.js",
              serviceWorkerParam: { scope: "/onesignal/" },
              allowLocalhostAsSecureOrigin: true,
              // Sem notifyButton (sino flutuante) — o controle de ativar/
              // desativar fica em Configurações (PortalMobileSettingsSheet).
              // Texto e visual do slidedown (soft-ask) com a marca Vangard —
              // o card em si é estilizado em src/index.css.
              promptOptions: {
                slidedown: {
                  prompts: [
                    {
                      type: "push",
                      autoPrompt: true,
                      text: {
                        actionMessage:
                          "Ative as notificações da Vangard e receba avisos importantes em tempo real.",
                        acceptButton: "Ativar",
                        cancelButton: "Agora não",
                      },
                      delay: {
                        pageViews: 1,
                        timeDelay: 0,
                      },
                    },
                  ],
                },
              },
            });
            // 1º acesso: pergunta uma vez, de forma suave (slidedown nativo)
            OneSignal.Slidedown.promptPush();
          });
        }

        // Atualiza tags de segmentação (roda também quando troca de associação)
        // deno-lint-ignore no-explicit-any
        window.OneSignalDeferred.push(async (OneSignal: any) => {
          await OneSignal.User.addTags({
            tipo: "parceiro",
            corretora_id: tags.corretora_id,
            corretora_nome: tags.corretora_nome || "",
            estado: (corr?.estado || "").toUpperCase(),
            cidade: corr?.cidade || "",
          });
        });
      } catch {
        /* push é opcional — nunca quebra o portal */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tags?.corretora_id, tags?.corretora_nome]);
}
