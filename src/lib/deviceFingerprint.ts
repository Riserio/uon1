// Identificação de dispositivo estável (sem dependência externa).
//
// IMPORTANTE: a versão antiga usava canvas + versão completa do navegador,
// o que fazia o "fingerprint" mudar a cada atualização do Chrome (ou troca de
// driver de vídeo). Resultado: o mesmo computador pedia aprovação de novo
// várias vezes por mês.
//
// Agora o identificador principal é um ID persistente salvo no próprio
// navegador (localStorage), e há uma "assinatura" derivada de sinais estáveis
// (sem números de versão) usada para reconhecer o mesmo aparelho caso o
// armazenamento local seja limpo.

const DEVICE_ID_KEY = "uon1_device_id";

export type DeviceInfo = {
  fingerprint: string;
  assinatura: string;
  userAgent: string;
  plataforma: string;
  navegador: string;
};

export async function getDeviceFingerprint(): Promise<DeviceInfo> {
  const ua = navigator.userAgent;
  const plataforma = navigator.platform || "desconhecida";
  const navegador = detectBrowser(ua);

  const assinatura = await sha256(
    [
      normalizarUserAgent(ua),
      plataforma,
      (navigator.language || "").split("-")[0],
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      `cores:${navigator.hardwareConcurrency ?? 0}`,
      `touch:${navigator.maxTouchPoints ?? 0}`,
    ].join("||")
  );

  return {
    fingerprint: getOrCreateDeviceId(assinatura),
    assinatura,
    userAgent: ua,
    plataforma,
    navegador,
  };
}

/** ID persistente do aparelho; cai na assinatura se o storage estiver bloqueado. */
function getOrCreateDeviceId(assinatura: string): string {
  try {
    const salvo = localStorage.getItem(DEVICE_ID_KEY);
    if (salvo) return salvo;
    const novo =
      (crypto.randomUUID?.() as string | undefined) ??
      `${assinatura.slice(0, 16)}-${Date.now().toString(36)}`;
    localStorage.setItem(DEVICE_ID_KEY, novo);
    return novo;
  } catch {
    return assinatura;
  }
}

/** Reaproveita um ID já existente no banco para este aparelho. */
export function persistDeviceId(id: string) {
  try {
    localStorage.setItem(DEVICE_ID_KEY, id);
  } catch {
    /* ignore */
  }
}

/** Remove números de versão (Chrome/135.0.0.0 -> Chrome/x) e builds do SO. */
export function normalizarUserAgent(ua: string): string {
  return ua
    .replace(/\d+(\.\d+)+/g, "x")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function detectBrowser(ua: string): string {
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  return "Desconhecido";
}

async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function getClientIp(): Promise<string | null> {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    if (!res.ok) return null;
    const data = await res.json();
    return data.ip || null;
  } catch {
    return null;
  }
}
