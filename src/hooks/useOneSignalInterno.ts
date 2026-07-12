import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

// Inicializa o OneSignal Web SDK para usuários INTERNOS (equipe Vangard,
// fora do Portal do Parceiro) e marca a inscrição com a tag "tipo: interno"
// (mais o cargo/role, pra permitir segmentações mais finas no futuro).
//
// Antes, só o Portal do Parceiro (useOneSignalPortal.ts) inicializava o
// OneSignal e gravava tags — usuários internos que instalassem o PWA e
// aceitassem a notificação ficavam inscritos sem NENHUMA tag, então o envio
// segmentado por "Usuários internos" na Central de Push nunca encontrava
// ninguém.
//
// Os dois hooks escrevem no mesmo window.OneSignalDeferred/__oneSignalLoaded,
// então o SDK só é carregado/inicializado uma vez por sessão, seja qual for
// a área (Portal ou interna) que o usuário visitar primeiro.

declare global {
  interface Window {
    // deno-lint-ignore no-explicit-any
    OneSignalDeferred?: any[];
    __oneSignalLoaded?: boolean;
  }
}

export function useOneSignalInterno() {
  const { user, userRole } = useAuth();

  useEffect(() => {
    // Tags de parceiro (corretora/localização) já são cuidadas pelo
    // useOneSignalPortal no Portal — aqui cobrimos só os papéis internos
    // (admin, lider, comercial, superintendente, administrativo).
    if (!user || !userRole || userRole === "parceiro") return;

    let cancelled = false;

    (async () => {
      try {
        const { data: cfg, error: cfgError } = await supabase.rpc("get_push_web_config" as never);
        if (cfgError) {
          console.warn("[OneSignal] Falha ao buscar config de push:", cfgError.message);
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const webCfg = cfg as any;
        const appId = webCfg?.app_id as string | undefined;
        if (cancelled || !appId) return;

        window.OneSignalDeferred = window.OneSignalDeferred || [];

        if (!window.__oneSignalLoaded) {
          window.__oneSignalLoaded = true;
          const script = document.createElement("script");
          script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
          script.defer = true;
          document.head.appendChild(script);

          // deno-lint-ignore no-explicit-any
          window.OneSignalDeferred.push(async (OneSignal: any) => {
            try {
              await OneSignal.init({
                appId: String(appId),
                ...(webCfg?.safari_web_id ? { safari_web_id: String(webCfg.safari_web_id) } : {}),
                // Worker em /onesignal/ com escopo próprio pra NÃO substituir o
                // /sw.js do PWA (dois SWs não podem dividir o mesmo escopo).
                serviceWorkerPath: "onesignal/OneSignalSDKWorker.js",
                serviceWorkerParam: { scope: "/onesignal/" },
                allowLocalhostAsSecureOrigin: true,
                // Mensagem automática enviada pelo OneSignal assim que o
                // dispositivo se inscreve (era o "Thanks for subscribing!"
                // padrão em inglês) — agora em português.
                welcomeNotification: {
                  title: "Vangard",
                  message: "Notificações ativadas! Você vai receber avisos importantes por aqui.",
                },
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
              OneSignal.Slidedown.promptPush();

              // Reforça as tags no exato momento em que a inscrição de push
              // fica ativa (optedIn). Sem isso, a 1ª chamada de addTags()
              // (logo abaixo) podia rodar cedo demais — antes de o OneSignal
              // terminar de vincular o dispositivo ao usuário — e a tag
              // nunca era persistida (assinante ficava "Sem vínculo").
              OneSignal.User.PushSubscription.addEventListener(
                "change",
                // deno-lint-ignore no-explicit-any
                async (event: any) => {
                  if (!event?.current?.optedIn) return;
                  try {
                    await OneSignal.User.addTags({
                      tipo: "interno",
                      cargo: userRole,
                    });
                  } catch (e) {
                    console.error(
                      "[OneSignal] Falha ao gravar tags do usuário interno (subscription change):",
                      e,
                    );
                  }
                },
              );
            } catch (e) {
              console.error("[OneSignal] Falha ao inicializar o SDK (interno):", e);
            }
          });
        }

        // Marca a inscrição com o tipo (interno) e o cargo/role atual — roda
        // de novo se o papel do usuário mudar (ex.: promovido a superintendente).
        // deno-lint-ignore no-explicit-any
        window.OneSignalDeferred.push(async (OneSignal: any) => {
          try {
            await OneSignal.User.addTags({
              tipo: "interno",
              cargo: userRole,
            });
          } catch (e) {
            console.error("[OneSignal] Falha ao gravar tags do usuário interno:", e);
          }
        });
      } catch (e) {
        console.error("[OneSignal] Erro inesperado ao configurar push interno:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, userRole]);
}
