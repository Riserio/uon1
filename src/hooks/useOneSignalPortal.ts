import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

// Inicializa o OneSignal Web SDK no Portal do Parceiro e marca a inscrição
// com tags de segmentação (corretora, localização, tipo, nome e telefone do
// parceiro). O App ID vem da RPC get_push_web_config (só retorna valor
// quando o Push está ativo na aba Push da Central de Atendimento).
//
// O worker do OneSignal fica em /onesignal/OneSignalSDKWorker.js com escopo
// próprio pra não conflitar com o /sw.js do PWA.
//
// Usuários INTERNOS (fora do Portal) são cobertos pelo hook irmão
// useOneSignalInterno.ts — os dois escrevem no mesmo
// window.OneSignalDeferred/__oneSignalLoaded, então o SDK só carrega/inicia
// uma vez por sessão, seja qual for a área visitada primeiro.
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

type PortalTags = {
  corretora_id: string;
  corretora_nome?: string | null;
};

export function useOneSignalPortal(tags: PortalTags | null) {
  const { user } = useAuth();

  useEffect(() => {
    if (!tags?.corretora_id || !user) return;

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

        // Nome/telefone do parceiro logado, pra exibir na lista de
        // Assinantes (hoje só mostrava a associação, não a pessoa).
        const { data: perfil, error: perfilError } = await supabase
          .from("profiles")
          .select("nome, telefone, whatsapp")
          .eq("id", user.id)
          .maybeSingle();
        if (perfilError) {
          console.warn("[OneSignal] Falha ao buscar perfil do parceiro:", perfilError.message);
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

              // Vincula esse navegador ao mesmo ID em todos os dispositivos
              // do usuário (login/logout do Supabase Auth) — sem isso, cada
              // navegador aparece como um assinante anônimo diferente na
              // lista, mesmo sendo a mesma pessoa.
              try {
                await OneSignal.login(String(user.id));
              } catch (e) {
                console.error("[OneSignal] Falha ao vincular external_id (Portal):", e);
              }

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
                      nome,
                      telefone,
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

        // Atualiza tags de segmentação (roda também quando troca de associação).
        // Grava e CONFERE com retry: o addTags pode rodar antes de o OneSignal
        // terminar de vincular o usuário (login) e ser descartado em silêncio —
        // era assim que assinantes ficavam "Sem vínculo".
        // deno-lint-ignore no-explicit-any
        window.OneSignalDeferred.push(async (OneSignal: any) => {
          try {
            await OneSignal.login(String(user.id));
          } catch (e) {
            console.error("[OneSignal] Falha ao vincular external_id (Portal):", e);
          }
          const desejadas = {
            tipo: "parceiro",
            corretora_id: tags.corretora_id,
            corretora_nome: tags.corretora_nome || "",
            estado: (corr?.estado || "").toUpperCase(),
            cidade: corr?.cidade || "",
            nome,
            telefone,
          };
          for (let tentativa = 0; tentativa < 3; tentativa++) {
            try {
              await OneSignal.User.addTags(desejadas);
              const atuais = (await OneSignal.User.getTags?.()) || {};
              if (atuais.corretora_id === tags.corretora_id) break;
            } catch (e) {
              console.error("[OneSignal] Falha ao gravar tags do parceiro:", e);
            }
            await new Promise((r) => setTimeout(r, 4000 * (tentativa + 1)));
          }
        });
      } catch (e) {
        console.error("[OneSignal] Erro inesperado ao configurar push do Portal:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tags?.corretora_id, tags?.corretora_nome, user]);
}
