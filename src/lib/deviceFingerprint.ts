// Lightweight device fingerprint (no external dep)
// Combines stable browser/system signals into a SHA-256 hash.

export async function getDeviceFingerprint(): Promise<{
  fingerprint: string;
  userAgent: string;
  plataforma: string;
  navegador: string;
}> {
  const ua = navigator.userAgent;
  const plataforma = navigator.platform || "desconhecida";
  const navegador = detectBrowser(ua);

  // Canvas signal
  let canvasHash = "no-canvas";
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "16px Arial";
      ctx.fillStyle = "#069";
      ctx.fillText("Uon1 fingerprint #@!", 2, 2);
      ctx.strokeStyle = "rgba(102,200,0,0.7)";
      ctx.strokeRect(10, 10, 100, 30);
      canvasHash = canvas.toDataURL();
    }
  } catch {
    /* ignore */
  }

  const parts = [
    ua,
    plataforma,
    navigator.language,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    `cores:${navigator.hardwareConcurrency ?? 0}`,
    `mem:${(navigator as any).deviceMemory ?? 0}`,
    `touch:${navigator.maxTouchPoints ?? 0}`,
    canvasHash,
  ].join("||");

  const fingerprint = await sha256(parts);
  return { fingerprint, userAgent: ua, plataforma, navegador };
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