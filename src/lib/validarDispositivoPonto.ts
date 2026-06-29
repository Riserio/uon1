import { supabase } from "@/integrations/supabase/client";
import { getDeviceFingerprint, getClientIp } from "./deviceFingerprint";

export type ValidacaoDispositivo =
  | { permitido: true; dispositivoId: string }
  | { permitido: false; motivo: string; status: "pendente" | "bloqueado" | "novo" };

/**
 * Valida (e, se necessário, registra) o dispositivo usado para bater ponto.
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
  const { fingerprint, userAgent, plataforma, navegador } = await getDeviceFingerprint();
  const ip = await getClientIp();

  const { data: existente } = await supabase
    .from("dispositivos_ponto")
    .select("*")
    .eq("funcionario_id", funcionarioId)
    .eq("fingerprint", fingerprint)
    .maybeSingle();

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