import { supabase } from "@/integrations/supabase/client";
import {
  getDeviceFingerprint,
  getClientIp,
  normalizarUserAgent,
  persistDeviceId,
} from "./deviceFingerprint";

export type ValidacaoDispositivo =
  | { permitido: true; dispositivoId: string }
  | { permitido: false; motivo: string; status: "pendente" | "bloqueado" | "novo" };

/**
 * Valida (e, se necessário, registra) o dispositivo usado para bater ponto.
 *
 * Reconhecimento em 2 níveis para NÃO pedir aprovação repetida do mesmo
 * aparelho: 1) ID persistente do navegador; 2) assinatura estável (ou o
 * user agent sem números de versão, para registros antigos).
 */
export async function validarDispositivoPonto(
  funcionarioId: string
): Promise<ValidacaoDispositivo> {
  const { data: config } = await supabase
    .from("jornada_config")
    .select("exigir_aprovacao_dispositivo, exigir_ip_dispositivo")
    .limit(1)
    .maybeSingle();

  if (!config?.exigir_aprovacao_dispositivo) {
    return { permitido: true, dispositivoId: "" };
  }

  const exigirIpGlobal = !!config.exigir_ip_dispositivo;
  const { fingerprint, assinatura, userAgent, plataforma, navegador } =
    await getDeviceFingerprint();
  const ip = await getClientIp();

  const { data: dispositivos } = await supabase
    .from("dispositivos_ponto")
    .select("*")
    .eq("funcionario_id", funcionarioId);

  const lista = dispositivos || [];
  const uaBase = normalizarUserAgent(userAgent);

  // 1) mesmo ID persistente
  let existente = lista.find((d) => d.fingerprint === fingerprint) || null;

  // 2) mesmo aparelho já conhecido (assinatura ou UA sem versão)
  if (!existente) {
    const mesmoAparelho = lista.filter(
      (d) =>
        (d.assinatura && d.assinatura === assinatura) ||
        (!d.assinatura &&
          d.plataforma === plataforma &&
          d.navegador === navegador &&
          d.user_agent &&
          normalizarUserAgent(d.user_agent) === uaBase)
    );
    existente =
      mesmoAparelho.find((d) => d.status === "aprovado") ||
      mesmoAparelho.find((d) => d.status === "bloqueado") ||
      mesmoAparelho[0] ||
      null;

    if (existente) {
      // revincula o registro existente ao novo ID persistente
      await supabase
        .from("dispositivos_ponto")
        .update({ fingerprint, assinatura, user_agent: userAgent })
        .eq("id", existente.id);
      persistDeviceId(existente.fingerprint || fingerprint);
    }
  }

  if (existente) {
    if (existente.status === "aprovado") {
      const precisaIp = exigirIpGlobal || existente.exigir_ip;
      if (precisaIp && existente.ip_aprovado && existente.ip_aprovado !== ip) {
        return {
          permitido: false,
          motivo: `Este dispositivo está aprovado apenas para o IP ${existente.ip_aprovado}. O seu IP atual é ${ip ?? "desconhecido"}.`,
          status: "bloqueado",
        };
      }
      await supabase
        .from("dispositivos_ponto")
        .update({ ultimo_uso_em: new Date().toISOString(), ip: ip ?? existente.ip })
        .eq("id", existente.id);
      return { permitido: true, dispositivoId: existente.id };
    }
    if (existente.status === "pendente") {
      return {
        permitido: false,
        motivo:
          "Este dispositivo ainda está aguardando aprovação do gestor. Avise quem aprova para liberar.",
        status: "pendente",
      };
    }
    return {
      permitido: false,
      motivo: "Este dispositivo foi bloqueado para registro de ponto.",
      status: "bloqueado",
    };
  }

  const { error: insErr } = await supabase.from("dispositivos_ponto").insert({
    funcionario_id: funcionarioId,
    fingerprint,
    assinatura,
    user_agent: userAgent,
    plataforma,
    navegador,
    ip,
    status: "pendente",
  });
  if (insErr) {
    return {
      permitido: false,
      motivo: `Não foi possível registrar o dispositivo: ${insErr.message}`,
      status: "novo",
    };
  }
  return {
    permitido: false,
    motivo:
      "Este é um dispositivo novo. Enviamos uma solicitação para o gestor aprovar antes da primeira batida.",
    status: "novo",
  };
}
