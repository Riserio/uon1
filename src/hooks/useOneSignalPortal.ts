import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// Inicializa o OneSignal Web SDK no Portal do Parceiro e marca a inscrição
// com tags de segmentação (corretora, localização e tipo). O App ID vem da
// RPC get_push_web_config (só retorna valor quando o Push está ativo na aba
// Push da Central de Atendimento).
//
// O worker do OneSignal fica em /onesignal/OneSignalSDKWorker.js com escopo
// próprio pra não conflitar com o /sw.js do PWA.
//
// Usuários INTERNOS (fora do Portal) são cobertos pelo hook irmão
// useOneSignalInterno.ts — os dois escrevem no mesmo
// window.OneSignalDeferred/__oneSignalLoaded, então o SDK só carrega/inicia
// uma vez por sessão, seja qual for a área visitada primeiro.

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
        const { data: cfg, error: cfgError } = await supabase.rpc("get_push_web_config" as never);
        if (cfgError) {
          console.warn("[OneSignal] Falha ao buscar config de push:", cfgError.message);
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const webCfg = cfg as any;
        const appId = webCfg?.app_id as string | undefined;
        if (cancelled || !appId) return;

        // Localização da associação (para segmentação por estado/cidade)
        const { data: corr, error: corrError } = await supabase
          .from("corretoras")
          .select("estado, cidade")
          .eq("id", tags.corretora_id)
          .maybeSingle();
        if (corrError) {
          console.warn("[OneSignal] Falha ao buscar estado/cidade da associação:", corrError.message);
        }
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
                      tipo: "parceiro",
                      corretora_id: tags.corretora_id,
                      corretora_nome: tags.corretora_nome || "",
                      estado: (corr?.estado || "").toUpperCase(),
                      cidade: corr?.cidade || "",
                    });
                  } catch (e) {
                    console.error(
                      "[OneSignal] Falha ao gravar tags do parceiro (subscription change):",
                      e,
                    );
                  }
                },
              );
            } catch (e) {
              // Esse catch é importante: o callback roda de forma assíncrona,
              // depois que este hook já retornou — sem ele, um erro aqui
              // (ex.: appId inválido) some como unhandled rejection e nunca
              // fica claro que foi o OneSignal.init que falhou.
              console.error("[OneSignal] Falha ao inicializar o SDK (Portal):", e);
            }
          });
        }

        // Atualiza tags de segmentação (roda também quando troca de associação)
        // deno-lint-ignore no-explicit-any
        window.OneSignalDeferred.push(async (OneSignal: any) => {
          try {
            await OneSignal.User.addTags({
              tipo: "parceiro",
              corretora_id: tags.corretora_id,
              corretora_nome: tags.corretora_nome || "",
              estado: (corr?.estado || "").toUpperCase(),
              cidade: corr?.cidade || "",
            });
          } catch (e) {
            console.error("[OneSignal] Falha ao gravar tags do parceiro:", e);
          }
        });
      } catch (e) {
        console.error("[OneSignal] Erro inesperado ao configurar push do Portal:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tags?.corretora_id, tags?.corretora_nome]);
}
