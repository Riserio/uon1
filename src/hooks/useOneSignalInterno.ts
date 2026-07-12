import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

// Inicializa o OneSignal Web SDK para usuários INTERNOS (equipe Vangard,
// fora do Portal do Parceiro) e marca a inscrição com a tag "tipo: interno"
// (mais o cargo/role, nome e telefone, pra permitir segmentações e uma lista
// de assinantes mais completa na Central de Push).
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
//
// OneSignal.login(user.id) vincula o dispositivo ao mesmo "external_id" em
// todos os aparelhos/navegadores desse usuário — sem isso, cada navegador
// vira um assinante anônimo separado e não dá pra unificar/deduplicar na
// lista de Assinantes.

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

        // Nome/telefone do usuário interno logado, pra exibir na lista de
        // Assinantes (hoje só mostrava tipo/cargo).
        const { data: perfil, error: perfilError } = await supabase
          .from("profiles")
          .select("nome, telefone, whatsapp")
          .eq("id", user.id)
          .maybeSingle();
        if (perfilError) {
          console.warn("[OneSignal] Falha ao buscar perfil do usuário interno:", perfilError.message);
        }
        if (cancelled) return;

        const nome = perfil?.nome || "";
        const telefone = perfil?.telefone || perfil?.whatsapp || "";

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
                // dispositivo se inscreve. Evitamos repetir "Vangard" no
                // título porque o Safari já anexa "from Vangard" (nome do
                // site) embaixo por conta própria — repetir a marca no
                // título deixava a notificação com "Vangard from Vangard".
                welcomeNotification: {
                  title: "Notificações ativadas",
                  message: "Você vai receber avisos importantes da Vangard por aqui.",
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

              // Vincula esse navegador ao mesmo ID em todos os dispositivos
              // do usuário (login/logout do Supabase Auth) — sem isso, cada
              // navegador aparece como um assinante anônimo diferente na
              // lista, mesmo sendo a mesma pessoa.
              try {
                await OneSignal.login(String(user.id));
              } catch (e) {
                console.error("[OneSignal] Falha ao vincular external_id (interno):", e);
              }

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
                      nome,
                      telefone,
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

        // Marca a inscrição com o tipo (interno), cargo/role, nome e telefone
        // atuais — roda de novo se o papel do usuário mudar (ex.: promovido a
        // superintendente).
        // deno-lint-ignore no-explicit-any
        window.OneSignalDeferred.push(async (OneSignal: any) => {
          try {
            await OneSignal.login(String(user.id));
          } catch (e) {
            console.error("[OneSignal] Falha ao vincular external_id (interno):", e);
          }
          try {
            await OneSignal.User.addTags({
              tipo: "interno",
              cargo: userRole,
              nome,
              telefone,
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
