import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ProxyRequest {
  corretora_id: string;
  action: "login" | "consultar-associado" | "consultar-veiculo" | "listar-eventos" | "gerar-relatorio" | "refresh-session";
  params?: Record<string, string>;
}

// ── Constants ───────────────────────────────────────────────────────
const FETCH_TIMEOUT = 25000; // 25s per external request (Hinova is slow)
const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes - Hinova sessions expire fast

// ── HTML / XML helpers ──────────────────────────────────────────────
function stripHtml(value: string): string {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim();
}

function derivePortalBaseUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    let path = parsed.pathname.replace(/\/+$/, "");
    path = path.replace(/\/v5\/login\.php$/i, "").replace(/\/login\.php$/i, "")
      .replace(/\/login\/validar$/i, "").replace(/\/login$/i, "").replace(/\/v5$/i, "");
    return `${parsed.origin}${path}`;
  } catch { return rawUrl.replace(/\/+$/, ""); }
}

function isLoginPage(html: string): boolean {
  const n = html.toLowerCase();
  return n.includes("senha") && n.includes("usuario") && n.includes("login");
}

function parseHtmlTable(html: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const headerMatch = html.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
  const headers: string[] = [];
  if (headerMatch) {
    const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let m: RegExpExecArray | null;
    while ((m = thRegex.exec(headerMatch[1])) !== null) headers.push(stripHtml(m[1]));
  }
  const bodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (bodyMatch) {
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trM: RegExpExecArray | null;
    while ((trM = trRegex.exec(bodyMatch[1])) !== null) {
      const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let tdM: RegExpExecArray | null;
      const row: Record<string, string> = {};
      let ci = 0;
      while ((tdM = tdRegex.exec(trM[1])) !== null) {
        row[headers[ci] || `col_${ci}`] = stripHtml(tdM[1]);
        ci++;
      }
      if (Object.keys(row).length > 0) rows.push(row);
    }
  }
  return rows;
}

function parseXmlResults(payload: string): Record<string, string>[] {
  const results: Record<string, string>[] = [];
  const rsRegex = /<rs[^>]*>([\s\S]*?)<\/rs>/gi;
  let m: RegExpExecArray | null;
  while ((m = rsRegex.exec(payload)) !== null) {
    const id = m[0].match(/id=["']([^"']+)["']/i)?.[1] || "";
    const info = m[0].match(/info=["']([^"']+)["']/i)?.[1] || "";
    const text = stripHtml(m[1]);
    if (text || info) results.push({ id: id || text, nome: text || info, info });
  }
  return results;
}

function parseAssociadoAutocomplete(payload: string, _searchTerm: string): Record<string, string>[] {
  if (payload.includes("<results") || payload.includes("<rs")) {
    const xmlResults = parseXmlResults(payload);
    if (xmlResults.length > 0) return xmlResults;
  }
  try {
    const parsed = JSON.parse(payload);
    if (Array.isArray(parsed)) {
      return parsed.map((item, i) => {
        if (typeof item === "string") return { id: String(i), nome: item };
        if (item && typeof item === "object") {
          const r = item as Record<string, unknown>;
          return { id: String(r.id ?? r.codigo ?? r.value ?? i), nome: String(r.nome ?? r.label ?? r.text ?? r.value ?? "") };
        }
        return null;
      }).filter((x): x is Record<string, string> => Boolean(x?.nome));
    }
  } catch { /* not JSON */ }
  const candidates: Record<string, string>[] = [];
  const tagRegex = /<(li|option|a|div)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRegex.exec(payload)) !== null) {
    const text = stripHtml(m[2]);
    if (!text || text.length < 3) continue;
    const idMatch = m[0].match(/data-id=["']([^"']+)["']/i) || m[0].match(/value=["']([^"']+)["']/i) || m[0].match(/id=["']([^"']+)["']/i);
    candidates.push({ id: idMatch?.[1] || text, nome: text });
  }
  return candidates;
}

// ── HTTP helpers with timeout ───────────────────────────────────────
function extractSetCookies(response: Response): string {
  const vals: string[] = [];
  for (const [key, value] of response.headers.entries()) {
    if (key.toLowerCase() === "set-cookie") {
      const p = value.split(";")[0];
      if (p) vals.push(p);
    }
  }
  try {
    const sc = (response.headers as any).getSetCookie?.();
    if (Array.isArray(sc)) for (const s of sc) { const p = s.split(";")[0]; if (p && !vals.includes(p)) vals.push(p); }
  } catch { /* older Deno */ }
  return vals.join("; ");
}

function mergeCookies(existing: string, incoming: string): string {
  const merged = new Map<string, string>();
  for (const c of [...(existing ? existing.split("; ") : []), ...(incoming ? incoming.split("; ") : [])]) {
    const [name] = c.split("=");
    if (name) merged.set(name, c);
  }
  return Array.from(merged.values()).join("; ");
}

async function timedFetch(url: string, init?: RequestInit, timeout = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithCookies(url: string, cookies: string, method = "GET", body?: string, extraHeaders?: Record<string, string>): Promise<Response> {
  const headers: Record<string, string> = {
    Cookie: cookies,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "*/*",
    ...extraHeaders,
  };
  if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
  return await timedFetch(url, { method, headers, body: body || undefined, redirect: "manual" });
}

// ── Direct HTTP login (best-effort, may not work on all Hinova portals) ──
async function performDirectLogin(
  portalBase: string, user: string, pass: string, codigoCliente: string,
): Promise<{ success: boolean; cookies: string; error?: string }> {
  console.info("Attempting direct login", { portalBase });
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  let allCookies = "";

  // Step 1: GET login page for PHPSESSID
  try {
    const r = await timedFetch(`${portalBase}/v5/login.php`, { headers: { "User-Agent": UA }, redirect: "manual" });
    const c = extractSetCookies(r);
    if (c) allCookies = mergeCookies(allCookies, c);
    
    // Read page to find actual form action
    const html = await r.text();
    const actionMatch = html.match(/action=["']([^"']+)["']/i);
    const formAction = actionMatch?.[1] || "login.php";
    const loginUrl = formAction.startsWith("http") ? formAction : `${portalBase}/v5/${formAction.replace(/^\.?\//, "")}`;
    
    // Step 2: POST to actual form action
    const formBody = new URLSearchParams();
    formBody.set("usuario", user);
    formBody.set("senha", pass);
    if (codigoCliente) formBody.set("codigo_cliente", codigoCliente);

    const loginRes = await timedFetch(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA, Cookie: allCookies, Referer: `${portalBase}/v5/login.php` },
      body: formBody.toString(),
      redirect: "manual",
    });
    const lc = extractSetCookies(loginRes);
    if (lc) allCookies = mergeCookies(allCookies, lc);
    
    // Follow all redirects
    let location = loginRes.headers.get("location");
    let count = 0;
    while (location && count < 8) {
      const url = location.startsWith("http") ? location : `${portalBase}/${location.replace(/^\//, "")}`;
      const rr = await timedFetch(url, { headers: { Cookie: allCookies, "User-Agent": UA }, redirect: "manual" });
      const rc = extractSetCookies(rr);
      if (rc) allCookies = mergeCookies(allCookies, rc);
      location = [301, 302, 303].includes(rr.status) ? rr.headers.get("location") : null;
      count++;
    }

    // Verify
    const vRes = await fetchWithCookies(`${portalBase}/carrega/carregaAssociados.php?input=teste`, allCookies);
    const vText = await vRes.text();
    const hasResults = vText.includes("<rs") || (!isLoginPage(vText) && !vText.includes("Falha na autenticação"));
    console.info("Login verify", { hasResults, preview: vText.substring(0, 200) });
    
    if (hasResults || (vText.includes("<results") && !vText.includes("Falha"))) {
      return { success: true, cookies: allCookies };
    }
  } catch (e) {
    console.warn("Direct login failed:", e);
  }

  return { success: false, cookies: "", error: "Login direto não suportado neste portal. Use o robô automatizado para atualizar a sessão." };
}

// ── Main handler ────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { corretora_id, action, params } = (await req.json()) as ProxyRequest;
    if (!corretora_id || !action) {
      return new Response(JSON.stringify({ error: "corretora_id e action são obrigatórios" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: creds, error: credsError } = await supabase.from("hinova_credenciais").select("*").eq("corretora_id", corretora_id).single();

    if (credsError || !creds) {
      return new Response(JSON.stringify({ error: "Credenciais Hinova não encontradas" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 });
    }

    const loginUrl = (creds.hinova_url || "").trim();
    if (!loginUrl) {
      return new Response(JSON.stringify({ error: "URL do Hinova não configurada" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }

    const portalBase = derivePortalBaseUrl(loginUrl);

    // ── refresh-session: force login ────────────────────────────────
    if (action === "refresh-session") {
      const lr = await performDirectLogin(portalBase, creds.hinova_user || "", creds.hinova_pass || "", creds.hinova_codigo_cliente || "");
      if (!lr.success) {
        return new Response(JSON.stringify({ error: lr.error }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 });
      }
      const now = new Date().toISOString();
      await supabase.from("hinova_credenciais").update({ session_cookies: lr.cookies, session_cookies_updated_at: now }).eq("corretora_id", corretora_id);
      return new Response(JSON.stringify({ success: true, message: "Sessão conectada!", session_cookies_updated_at: now }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── login: fast check (no HTTP round-trip if cookies are fresh) ──
    if (action === "login") {
      const hasCookies = !!(creds.session_cookies || "").trim();
      const updatedAt = creds.session_cookies_updated_at ? new Date(creds.session_cookies_updated_at).getTime() : 0;
      const isFresh = Date.now() - updatedAt < SESSION_TTL_MS;

      return new Response(JSON.stringify({
        success: hasCookies && isFresh,
        portalBase,
        session_cookies_updated_at: creds.session_cookies_updated_at,
        message: hasCookies && isFresh ? "Sessão ativa" : "Sessão expirada ou não disponível",
        needs_refresh: !hasCookies || !isFresh,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Get valid cookies with auto-login ────────────────────────────
    async function getValidCookies(): Promise<string> {
      const cookies = (creds.session_cookies || "").trim();
      const updatedAt = creds.session_cookies_updated_at ? new Date(creds.session_cookies_updated_at).getTime() : 0;
      const isFresh = Date.now() - updatedAt < SESSION_TTL_MS;

      // Trust fresh cookies without verifying
      if (cookies && isFresh) return cookies;

      // Need login
      console.info("Session stale/missing, performing auto-login...");
      const lr = await performDirectLogin(portalBase, creds.hinova_user || "", creds.hinova_pass || "", creds.hinova_codigo_cliente || "");
      if (!lr.success) throw new Error(lr.error || "Falha no login automático");

      await supabase.from("hinova_credenciais").update({ session_cookies: lr.cookies, session_cookies_updated_at: new Date().toISOString() }).eq("corretora_id", corretora_id);
      return lr.cookies;
    }

    let cookies: string;
    try {
      cookies = await getValidCookies();
    } catch (e) {
      return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Falha ao obter sessão", action: "login_failed" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 });
    }

    // ── Helper: execute with auto-retry on session expired ───────────
    async function executeWithRetry<T>(fn: (c: string) => Promise<T>, isExpired: (result: T) => boolean): Promise<T> {
      const result = await fn(cookies);
      if (!isExpired(result)) return result;

      // Session expired mid-request, re-login and retry once
      console.info("Session expired during request, re-logging...");
      const lr = await performDirectLogin(portalBase, creds.hinova_user || "", creds.hinova_pass || "", creds.hinova_codigo_cliente || "");
      if (!lr.success) throw new Error("Sessão expirou e não foi possível reconectar");
      cookies = lr.cookies;
      await supabase.from("hinova_credenciais").update({ session_cookies: lr.cookies, session_cookies_updated_at: new Date().toISOString() }).eq("corretora_id", corretora_id);
      return await fn(cookies);
    }

    console.info("Hinova proxy", { action, corretora_id });
    let responseData: Record<string, unknown> = {};

    switch (action) {
      case "consultar-associado": {
        const searchTerm = (params?.busca || "").trim();
        
        // Warm up: navigate to associado page to set PHP session context
        try {
          await fetchWithCookies(`${portalBase}/associado/consultarAssociado.php`, cookies);
        } catch { /* ignore */ }
        
        const result = await executeWithRetry(
          async (c) => {
            const url = `${portalBase}/carrega/carregaAssociados.php?input=${encodeURIComponent(searchTerm)}`;
            const res = await fetchWithCookies(url, c);
            const text = await res.text();
            console.info("Hinova autocomplete response", { searchTerm, len: text.length, status: res.status, preview: text.substring(0, 500) });
            return { text, status: res.status };
          },
          (r) => isLoginPage(r.text) || r.status === 302,
        );
        let data = parseAssociadoAutocomplete(result.text, searchTerm);
        if (data.length === 0) {
          // Fallback: POST search
          const fb = await fetchWithCookies(`${portalBase}/associado/consultarAssociado.php`, cookies, "POST", new URLSearchParams({ input: searchTerm, busca: searchTerm, nome: searchTerm }).toString());
          const fbHtml = await fb.text();
          console.info("Hinova fallback search", { len: fbHtml.length, preview: fbHtml.substring(0, 500) });
          if (!isLoginPage(fbHtml)) data = parseHtmlTable(fbHtml);
        }
        responseData = { success: true, data, total: data.length };
        break;
      }

      case "consultar-veiculo": {
        const searchTerm = params?.busca || "";
        const result = await executeWithRetry(
          async (c) => {
            const res = await fetchWithCookies(`${portalBase}/carrega/carregaVeiculos.php?input=${encodeURIComponent(searchTerm)}`, c);
            const text = await res.text();
            return { text, status: res.status };
          },
          (r) => isLoginPage(r.text) || r.status === 302,
        );
        let data = parseAssociadoAutocomplete(result.text, searchTerm);
        if (data.length === 0) {
          const fb = await fetchWithCookies(`${portalBase}/veiculo/consultarVeiculo.php`, cookies, "POST", new URLSearchParams({ busca: searchTerm, placa: searchTerm }).toString());
          const fbHtml = await fb.text();
          if (!isLoginPage(fbHtml)) data = parseHtmlTable(fbHtml);
        }
        responseData = { success: true, data, total: data.length };
        break;
      }

      case "listar-eventos": {
        const searchBody = new URLSearchParams();
        if (params?.data_inicio) searchBody.set("data_inicio", params.data_inicio);
        if (params?.data_fim) searchBody.set("data_fim", params.data_fim);
        if (params?.situacao) searchBody.set("situacao", params.situacao);

        const result = await executeWithRetry(
          async (c) => {
            const res = await fetchWithCookies(`${portalBase}/v5/Novoeventoitem/listar`, c, "POST", searchBody.toString());
            const text = await res.text();
            return { text };
          },
          (r) => isLoginPage(r.text),
        );
        try {
          const jsonData = JSON.parse(result.text);
          responseData = { success: true, data: Array.isArray(jsonData) ? jsonData : jsonData.data || [] };
        } catch {
          responseData = { success: true, data: parseHtmlTable(result.text), total: parseHtmlTable(result.text).length };
        }
        break;
      }

      case "gerar-relatorio": {
        const layout = params?.layout || "VANGARD";
        const searchBody = new URLSearchParams();
        searchBody.set("layout", layout);
        searchBody.set("exportar", "excel");
        if (params?.data_inicio) searchBody.set("data_inicio", params.data_inicio);
        if (params?.data_fim) searchBody.set("data_fim", params.data_fim);

        const response = await fetchWithCookies(`${portalBase}/v5/Novoeventoitem/listar`, cookies, "POST", searchBody.toString());
        const contentType = response.headers.get("content-type") || "";

        if (contentType.includes("spreadsheet") || contentType.includes("octet-stream") || contentType.includes("excel")) {
          const ab = await response.arrayBuffer();
          const u8 = new Uint8Array(ab);
          let bin = "";
          for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
          const fileName = response.headers.get("content-disposition")?.match(/filename="?([^";\n]+)"?/)?.[1] || "relatorio.xls";
          responseData = { success: true, file: btoa(bin), fileName, contentType };
        } else {
          const html = await response.text();
          if (isLoginPage(html)) {
            return new Response(JSON.stringify({ error: "Sessão expirada", action: "session_expired" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 });
          }
          const linkMatch = html.match(/href="([^"]*\.xls[^"]*)"/i);
          if (linkMatch) {
            const dlUrl = linkMatch[1].startsWith("http") ? linkMatch[1] : `${portalBase}/${linkMatch[1].replace(/^\//, "")}`;
            const fRes = await fetchWithCookies(dlUrl, cookies);
            const ab = await fRes.arrayBuffer();
            const u8 = new Uint8Array(ab);
            let bin = "";
            for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
            responseData = { success: true, file: btoa(bin), fileName: "relatorio.xls" };
          } else {
            const data = parseHtmlTable(html);
            responseData = { success: true, data, total: data.length, note: "Relatório retornado como tabela" };
          }
        }
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Ação desconhecida: ${action}` }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }

    return new Response(JSON.stringify(responseData), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? (e.name === "AbortError" ? "Timeout na conexão com o portal Hinova" : e.message) : String(e);
    console.error("Hinova proxy error:", msg);
    return new Response(JSON.stringify({ error: msg }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});
