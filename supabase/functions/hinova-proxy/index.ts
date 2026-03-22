import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProxyRequest {
  corretora_id: string;
  action: "login" | "consultar-associado" | "consultar-veiculo" | "listar-eventos" | "gerar-relatorio" | "refresh-session";
  params?: Record<string, string>;
}

// ── HTML / XML helpers ──────────────────────────────────────────────

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function derivePortalBaseUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    let path = parsed.pathname.replace(/\/+$/, "");
    path = path
      .replace(/\/v5\/login\.php$/i, "")
      .replace(/\/login\.php$/i, "")
      .replace(/\/login\/validar$/i, "")
      .replace(/\/login$/i, "")
      .replace(/\/v5$/i, "");
    return `${parsed.origin}${path}`;
  } catch {
    return rawUrl.replace(/\/+$/, "");
  }
}

function isLoginPage(html: string): boolean {
  const normalized = html.toLowerCase();
  return normalized.includes("senha") && normalized.includes("usuario") && normalized.includes("login");
}

function parseHtmlTable(html: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const headerMatch = html.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
  const headers: string[] = [];
  if (headerMatch) {
    const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let thMatch: RegExpExecArray | null;
    while ((thMatch = thRegex.exec(headerMatch[1])) !== null) {
      headers.push(stripHtml(thMatch[1]));
    }
  }
  const bodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (bodyMatch) {
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch: RegExpExecArray | null;
    while ((trMatch = trRegex.exec(bodyMatch[1])) !== null) {
      const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let tdMatch: RegExpExecArray | null;
      const row: Record<string, string> = {};
      let colIndex = 0;
      while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
        const key = headers[colIndex] || `col_${colIndex}`;
        row[key] = stripHtml(tdMatch[1]);
        colIndex++;
      }
      if (Object.keys(row).length > 0) rows.push(row);
    }
  }
  return rows;
}

function parseXmlResults(payload: string): Record<string, string>[] {
  const results: Record<string, string>[] = [];
  const rsRegex = /<rs[^>]*>([\s\S]*?)<\/rs>/gi;
  let rsMatch: RegExpExecArray | null;
  while ((rsMatch = rsRegex.exec(payload)) !== null) {
    const block = rsMatch[0];
    const id = block.match(/id=["']([^"']+)["']/i)?.[1] || "";
    const info = block.match(/info=["']([^"']+)["']/i)?.[1] || "";
    const text = stripHtml(rsMatch[1]);
    if (text || info) {
      results.push({ id: id || text, nome: text || info, info });
    }
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
      return parsed
        .map((item, index) => {
          if (typeof item === "string") return { id: String(index), nome: item };
          if (item && typeof item === "object") {
            const record = item as Record<string, unknown>;
            return {
              id: String(record.id ?? record.codigo ?? record.value ?? index),
              nome: String(record.nome ?? record.label ?? record.text ?? record.value ?? ""),
            };
          }
          return null;
        })
        .filter((item): item is Record<string, string> => Boolean(item?.nome));
    }
  } catch { /* not JSON */ }

  const candidates: Record<string, string>[] = [];
  const tagRegex = /<(li|option|a|div)[^>]*>([\s\S]*?)<\/\1>/gi;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagRegex.exec(payload)) !== null) {
    const rawBlock = tagMatch[0];
    const text = stripHtml(tagMatch[2]);
    if (!text || text.length < 3) continue;
    const idMatch =
      rawBlock.match(/data-id=["']([^"']+)["']/i) ||
      rawBlock.match(/value=["']([^"']+)["']/i) ||
      rawBlock.match(/id=["']([^"']+)["']/i);
    candidates.push({ id: idMatch?.[1] || text, nome: text });
  }
  return candidates;
}

// ── HTTP helpers ────────────────────────────────────────────────────

function extractSetCookies(response: Response): string {
  const cookieValues: string[] = [];
  // Deno exposes multiple Set-Cookie via response.headers iteration
  for (const [key, value] of response.headers.entries()) {
    if (key.toLowerCase() === "set-cookie") {
      const cookiePart = value.split(";")[0];
      if (cookiePart) cookieValues.push(cookiePart);
    }
  }
  // Also try getSetCookie if available (Deno 1.37+)
  try {
    const setCookies = (response.headers as any).getSetCookie?.();
    if (Array.isArray(setCookies)) {
      for (const sc of setCookies) {
        const part = sc.split(";")[0];
        if (part && !cookieValues.includes(part)) cookieValues.push(part);
      }
    }
  } catch { /* older Deno */ }
  return cookieValues.join("; ");
}

async function fetchWithCookies(url: string, cookies: string, method = "GET", body?: string): Promise<Response> {
  const headers: Record<string, string> = {
    Cookie: cookies,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };
  if (body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  return await fetch(url, { method, headers, body: body || undefined, redirect: "manual" });
}

// ── Direct HTTP login ───────────────────────────────────────────────

async function performDirectLogin(
  portalBase: string,
  user: string,
  pass: string,
  codigoCliente: string,
): Promise<{ success: boolean; cookies: string; error?: string }> {
  console.info("Hinova direct login", { portalBase, user: user.substring(0, 3) + "***" });

  // Try multiple login endpoints
  const loginEndpoints = [
    `${portalBase}/v5/login/validar`,
    `${portalBase}/v5/login.php`,
    `${portalBase}/login.php`,
    `${portalBase}/login/validar`,
  ];

  let allCookies = "";
  let loginSuccess = false;

  for (const endpoint of loginEndpoints) {
    try {
      const formBody = new URLSearchParams();
      formBody.set("usuario", user);
      formBody.set("senha", pass);
      if (codigoCliente) formBody.set("codigo_cliente", codigoCliente);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: formBody.toString(),
        redirect: "manual",
      });

      const newCookies = extractSetCookies(response);
      if (newCookies) {
        // Merge cookies
        const existing = allCookies ? allCookies.split("; ") : [];
        const incoming = newCookies.split("; ");
        const merged = new Map<string, string>();
        for (const c of [...existing, ...incoming]) {
          const [name] = c.split("=");
          if (name) merged.set(name, c);
        }
        allCookies = Array.from(merged.values()).join("; ");
      }

      // Follow redirects manually to collect all cookies
      const location = response.headers.get("location");
      if (location && (response.status === 301 || response.status === 302 || response.status === 303)) {
        const redirectUrl = location.startsWith("http") ? location : `${portalBase}/${location.replace(/^\//, "")}`;
        const redirectRes = await fetch(redirectUrl, {
          headers: {
            Cookie: allCookies,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          redirect: "manual",
        });
        const moreCookies = extractSetCookies(redirectRes);
        if (moreCookies) {
          const existing = allCookies ? allCookies.split("; ") : [];
          const incoming = moreCookies.split("; ");
          const merged = new Map<string, string>();
          for (const c of [...existing, ...incoming]) {
            const [name] = c.split("=");
            if (name) merged.set(name, c);
          }
          allCookies = Array.from(merged.values()).join("; ");
        }
      }

      // Verify login worked by checking a protected endpoint
      if (allCookies) {
        const verifyRes = await fetchWithCookies(`${portalBase}/carrega/carregaAssociados.php?input=a`, allCookies);
        const verifyText = await verifyRes.text();
        if (!isLoginPage(verifyText) && verifyRes.status !== 302) {
          loginSuccess = true;
          console.info("Login success via", endpoint, "cookies length:", allCookies.length);
          break;
        }
      }
    } catch (err) {
      console.warn("Login attempt failed for", endpoint, err);
      continue;
    }
  }

  if (loginSuccess && allCookies) {
    return { success: true, cookies: allCookies };
  }

  return { success: false, cookies: "", error: "Não foi possível fazer login no portal. Verifique as credenciais." };
}

// ── Main handler ────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { corretora_id, action, params } = (await req.json()) as ProxyRequest;

    if (!corretora_id || !action) {
      return new Response(JSON.stringify({ error: "corretora_id e action são obrigatórios" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: creds, error: credsError } = await supabase
      .from("hinova_credenciais")
      .select("*")
      .eq("corretora_id", corretora_id)
      .single();

    if (credsError || !creds) {
      return new Response(JSON.stringify({ error: "Credenciais Hinova não encontradas para esta associação" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    const loginUrl = (creds.hinova_url || "").trim();
    if (!loginUrl) {
      return new Response(JSON.stringify({ error: "URL do Hinova não configurada" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const portalBase = derivePortalBaseUrl(loginUrl);

    // ── Obtain valid session cookies (auto-login if needed) ─────────

    async function getValidCookies(): Promise<string> {
      // Try existing cookies first
      let cookies = (creds.session_cookies || "").trim();
      if (cookies) {
        try {
          const verifyRes = await fetchWithCookies(`${portalBase}/carrega/carregaAssociados.php?input=a`, cookies);
          const verifyText = await verifyRes.text();
          if (!isLoginPage(verifyText) && verifyRes.status !== 302) {
            return cookies; // Existing session still valid
          }
        } catch {
          // Session invalid, proceed to login
        }
      }

      // Auto-login with stored credentials
      console.info("Session invalid or missing, performing direct login...");
      const loginResult = await performDirectLogin(
        portalBase,
        creds.hinova_user || "",
        creds.hinova_pass || "",
        creds.hinova_codigo_cliente || "",
      );

      if (!loginResult.success) {
        throw new Error(loginResult.error || "Falha no login automático");
      }

      // Save new cookies to DB
      await supabase
        .from("hinova_credenciais")
        .update({
          session_cookies: loginResult.cookies,
          session_cookies_updated_at: new Date().toISOString(),
        })
        .eq("corretora_id", corretora_id);

      return loginResult.cookies;
    }

    // For refresh-session, force a fresh login regardless of existing cookies
    if (action === "refresh-session") {
      const loginResult = await performDirectLogin(
        portalBase,
        creds.hinova_user || "",
        creds.hinova_pass || "",
        creds.hinova_codigo_cliente || "",
      );

      if (!loginResult.success) {
        return new Response(JSON.stringify({ error: loginResult.error || "Falha no login" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        });
      }

      await supabase
        .from("hinova_credenciais")
        .update({
          session_cookies: loginResult.cookies,
          session_cookies_updated_at: new Date().toISOString(),
        })
        .eq("corretora_id", corretora_id);

      return new Response(JSON.stringify({
        success: true,
        message: "Sessão atualizada com sucesso!",
        session_cookies_updated_at: new Date().toISOString(),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get valid cookies (auto-login if needed)
    let cookies: string;
    try {
      cookies = await getValidCookies();
    } catch (e) {
      return new Response(JSON.stringify({
        error: e instanceof Error ? e.message : "Falha ao obter sessão",
        action: "login_failed",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    console.info("Hinova proxy action", { action, corretora_id, portalBase });

    let responseData: Record<string, unknown> = {};

    switch (action) {
      case "login": {
        responseData = {
          success: true,
          portalBase,
          session_cookies_updated_at: creds.session_cookies_updated_at || new Date().toISOString(),
          message: "Sessão ativa",
        };
        break;
      }

      case "consultar-associado": {
        const searchTerm = (params?.busca || "").trim();
        const autoCompleteUrl = `${portalBase}/carrega/carregaAssociados.php?input=${encodeURIComponent(searchTerm)}`;
        const autoCompleteResponse = await fetchWithCookies(autoCompleteUrl, cookies);
        const autoCompletePayload = await autoCompleteResponse.text();

        console.info("Hinova autocomplete", { searchTerm, len: autoCompletePayload.length, preview: autoCompletePayload.slice(0, 300) });

        if (isLoginPage(autoCompletePayload)) {
          return new Response(JSON.stringify({ error: "Sessão expirada durante consulta", action: "session_expired" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 401,
          });
        }

        let data = parseAssociadoAutocomplete(autoCompletePayload, searchTerm);

        if (data.length === 0) {
          const fallbackUrl = `${portalBase}/associado/consultarAssociado.php`;
          const searchBody = new URLSearchParams({ input: searchTerm, busca: searchTerm, nome: searchTerm });
          const fallbackResponse = await fetchWithCookies(fallbackUrl, cookies, "POST", searchBody.toString());
          const fallbackHtml = await fallbackResponse.text();
          if (!isLoginPage(fallbackHtml)) {
            data = parseHtmlTable(fallbackHtml);
          }
        }

        responseData = { success: true, data, total: data.length };
        break;
      }

      case "consultar-veiculo": {
        const searchTerm = params?.busca || "";
        const autoUrl = `${portalBase}/carrega/carregaVeiculos.php?input=${encodeURIComponent(searchTerm)}`;
        const autoRes = await fetchWithCookies(autoUrl, cookies);
        const autoPayload = await autoRes.text();

        if (isLoginPage(autoPayload)) {
          return new Response(JSON.stringify({ error: "Sessão expirada", action: "session_expired" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 401,
          });
        }

        let data = parseAssociadoAutocomplete(autoPayload, searchTerm);

        if (data.length === 0) {
          const url = `${portalBase}/veiculo/consultarVeiculo.php`;
          const searchBody = new URLSearchParams({ busca: searchTerm, placa: searchTerm });
          const response = await fetchWithCookies(url, cookies, "POST", searchBody.toString());
          const html = await response.text();
          if (!isLoginPage(html)) data = parseHtmlTable(html);
        }

        responseData = { success: true, data, total: data.length };
        break;
      }

      case "listar-eventos": {
        const url = `${portalBase}/v5/Novoeventoitem/listar`;
        const searchBody = new URLSearchParams();
        if (params?.data_inicio) searchBody.set("data_inicio", params.data_inicio);
        if (params?.data_fim) searchBody.set("data_fim", params.data_fim);
        if (params?.situacao) searchBody.set("situacao", params.situacao);

        const response = await fetchWithCookies(url, cookies, "POST", searchBody.toString());
        const html = await response.text();

        if (isLoginPage(html)) {
          return new Response(JSON.stringify({ error: "Sessão expirada", action: "session_expired" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 401,
          });
        }

        try {
          const jsonData = JSON.parse(html);
          responseData = { success: true, data: Array.isArray(jsonData) ? jsonData : jsonData.data || [] };
        } catch {
          const data = parseHtmlTable(html);
          responseData = { success: true, data, total: data.length };
        }
        break;
      }

      case "gerar-relatorio": {
        const layout = params?.layout || "VANGARD";
        const url = `${portalBase}/v5/Novoeventoitem/listar`;
        const searchBody = new URLSearchParams();
        searchBody.set("layout", layout);
        searchBody.set("exportar", "excel");
        if (params?.data_inicio) searchBody.set("data_inicio", params.data_inicio);
        if (params?.data_fim) searchBody.set("data_fim", params.data_fim);

        const response = await fetchWithCookies(url, cookies, "POST", searchBody.toString());
        const contentType = response.headers.get("content-type") || "";

        if (contentType.includes("spreadsheet") || contentType.includes("octet-stream") || contentType.includes("excel")) {
          const arrayBuffer = await response.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          let binary = "";
          for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          const base64 = btoa(binary);
          const fileName = response.headers.get("content-disposition")?.match(/filename="?([^";\n]+)"?/)?.[1] || "relatorio.xls";
          responseData = { success: true, file: base64, fileName, contentType };
        } else {
          const html = await response.text();
          if (isLoginPage(html)) {
            return new Response(JSON.stringify({ error: "Sessão expirada", action: "session_expired" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 401,
            });
          }

          const linkMatch = html.match(/href="([^"]*\.xls[^"]*)"/i);
          if (linkMatch) {
            const downloadUrl = linkMatch[1].startsWith("http") ? linkMatch[1] : `${portalBase}/${linkMatch[1].replace(/^\//, "")}`;
            const fileResponse = await fetchWithCookies(downloadUrl, cookies);
            const arrayBuffer = await fileResponse.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            let binary = "";
            for (let i = 0; i < uint8Array.length; i++) binary += String.fromCharCode(uint8Array[i]);
            const base64 = btoa(binary);
            responseData = { success: true, file: base64, fileName: "relatorio.xls" };
          } else {
            const data = parseHtmlTable(html);
            responseData = { success: true, data, total: data.length, note: "Relatório retornado como tabela (Excel não disponível neste layout)" };
          }
        }
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Ação desconhecida: ${action}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
    }

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Hinova proxy error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
