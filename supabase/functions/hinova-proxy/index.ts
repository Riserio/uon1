import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProxyRequest {
  corretora_id: string;
  action: "login" | "consultar-associado" | "consultar-veiculo" | "listar-eventos" | "gerar-relatorio";
  params?: Record<string, string>;
  session_cookies?: string;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items.filter(Boolean))];
}

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

function normalizeText(value: string): string {
  return stripHtml(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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

function extractCookies(response: Response): string {
  const rawCookies = response.headers.getSetCookie?.() ?? [];
  const fallbackCookie = response.headers.get("set-cookie");
  const cookies = rawCookies.length > 0 ? rawCookies : fallbackCookie ? [fallbackCookie] : [];
  return cookies.map((cookie) => cookie.split(";")[0]).filter(Boolean).join("; ");
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

      if (Object.keys(row).length > 0) {
        rows.push(row);
      }
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

function parseAssociadoAutocomplete(payload: string, searchTerm: string): Record<string, string>[] {
  // Try XML format first (Hinova returns <?xml ...><results><rs id="..." info="...">Name</rs></results>)
  if (payload.includes("<results") || payload.includes("<rs")) {
    const xmlResults = parseXmlResults(payload);
    if (xmlResults.length > 0) return xmlResults;
  }

  const normalizedSearch = normalizeText(searchTerm);

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
  } catch {
    // not JSON
  }

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
      rawBlock.match(/id=["']([^"']+)["']/i) ||
      rawBlock.match(/['"](\d{2,})['"]/);

    candidates.push({ id: idMatch?.[1] || text, nome: text });
  }

  if (candidates.length === 0) {
    const lines = payload.split(/[\r\n]+/).map((l) => stripHtml(l)).filter((l) => l.length >= 3);
    for (const line of lines) candidates.push({ id: line, nome: line });
  }

  const deduped = unique(candidates.map((i) => `${i.id}|||${i.nome}`)).map((i) => {
    const [id, nome] = i.split("|||");
    return { id, nome };
  });

  const filtered = deduped.filter((i) => !normalizedSearch || normalizeText(i.nome).includes(normalizedSearch));
  return filtered.length > 0 ? filtered : deduped;
}

async function fetchWithCookies(url: string, cookies: string, method = "GET", body?: string): Promise<Response> {
  const headers: Record<string, string> = {
    Cookie: cookies,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };

  if (body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  return await fetch(url, {
    method,
    headers,
    body: body || undefined,
    redirect: "follow",
  });
}

async function hinovaLogin(rawUrl: string, usuario: string, senha: string, codigoCliente: string): Promise<{ cookies: string; success: boolean; error?: string }> {
  const portalBase = derivePortalBaseUrl(rawUrl);
  const loginPageUrl = `${portalBase}/v5/login.php`;

  try {
    // Step 1: GET login page to capture PHPSESSID
    const loginPageResponse = await fetch(loginPageUrl, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      redirect: "follow",
    });
    const loginHtml = await loginPageResponse.text();
    const initialCookies = extractCookies(loginPageResponse);
    const csrf = loginHtml.match(/name=["']hCsrf["'][^>]*value=["']([^"']+)/i)?.[1] || "";

    // Step 2: POST login form
    const body = new URLSearchParams();
    body.set("codigo_mobile", codigoCliente);
    body.set("usuario", usuario);
    body.set("senha", senha);
    body.set("codigo_fma", "");
    if (csrf) body.set("hCsrf", csrf);

    await fetch(loginPageUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Cookie: initialCookies,
        Referer: loginPageUrl,
      },
      body: body.toString(),
      redirect: "follow",
    }).then(r => r.text()); // consume body

    // Step 3: Verify session by testing autocomplete endpoint
    const verifyRes = await fetchWithCookies(`${portalBase}/carrega/carregaAssociados.php?input=a`, initialCookies);
    const verifyText = await verifyRes.text();

    console.info("Hinova login verify", {
      verifyLen: verifyText.length,
      isLogin: isLoginPage(verifyText),
      rawPreview: verifyText.slice(0, 500),
    });

    if (!isLoginPage(verifyText)) {
      console.info("Hinova login OK");
      return { cookies: initialCookies, success: true };
    }

    return { cookies: "", success: false, error: "Login falhou - sessão não autenticada" };
  } catch (e) {
    return { cookies: "", success: false, error: `Erro de conexão: ${e instanceof Error ? e.message : String(e)}` };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { corretora_id, action, params, session_cookies } = (await req.json()) as ProxyRequest;

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

    let cookies = session_cookies || "";
    if (!cookies) {
      const loginResult = await hinovaLogin(loginUrl, creds.hinova_user, creds.hinova_pass, creds.hinova_codigo_cliente || "");
      if (!loginResult.success) {
        return new Response(JSON.stringify({ error: loginResult.error, action: "login_failed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        });
      }
      cookies = loginResult.cookies;
    }

    console.info("Hinova proxy action", { action, corretora_id, portalBase });

    let responseData: Record<string, unknown> = { cookies };

    switch (action) {
      case "login": {
        responseData = { success: true, cookies, portalBase };
        break;
      }

      case "consultar-associado": {
        const searchTerm = (params?.busca || "").trim();
        const autoCompleteUrl = `${portalBase}/carrega/carregaAssociados.php?input=${encodeURIComponent(searchTerm)}`;
        const fallbackUrl = `${portalBase}/associado/consultarAssociado.php`;

        let autoCompleteResponse = await fetchWithCookies(autoCompleteUrl, cookies);
        let autoCompletePayload = await autoCompleteResponse.text();

        if (isLoginPage(autoCompletePayload)) {
          return new Response(JSON.stringify({ error: "Sessão expirada, faça login novamente", action: "session_expired" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 401,
          });
        }

        let data = parseAssociadoAutocomplete(autoCompletePayload, searchTerm);

        if (data.length === 0) {
          const searchBody = new URLSearchParams({
            input: searchTerm,
            busca: searchTerm,
            nome: searchTerm,
            cpf: searchTerm,
          });

          const fallbackResponse = await fetchWithCookies(fallbackUrl, cookies, "POST", searchBody.toString());
          const fallbackHtml = await fallbackResponse.text();

          if (isLoginPage(fallbackHtml)) {
            return new Response(JSON.stringify({ error: "Sessão expirada, faça login novamente", action: "session_expired" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 401,
            });
          }

          data = parseHtmlTable(fallbackHtml);

          if (data.length === 0) {
            console.info("Hinova associado sem resultados", {
              searchTerm,
              autoCompleteUrl,
              preview: stripHtml(autoCompletePayload).slice(0, 300),
              fallbackPreview: stripHtml(fallbackHtml).slice(0, 300),
            });
          }
        }

        responseData = { success: true, data, total: data.length, cookies };
        break;
      }

      case "consultar-veiculo": {
        const searchTerm = params?.busca || "";
        const url = `${portalBase}/veiculo/consultarVeiculo.php`;
        const searchBody = new URLSearchParams();
        if (searchTerm) {
          searchBody.set("busca", searchTerm);
          searchBody.set("placa", searchTerm);
        }

        const response = await fetchWithCookies(url, cookies, "POST", searchBody.toString());
        const html = await response.text();

        if (isLoginPage(html)) {
          return new Response(JSON.stringify({ error: "Sessão expirada", action: "session_expired" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 401,
          });
        }

        const data = parseHtmlTable(html);
        responseData = { success: true, data, total: data.length, cookies };
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
          responseData = { success: true, data: Array.isArray(jsonData) ? jsonData : jsonData.data || [], cookies };
        } catch {
          const data = parseHtmlTable(html);
          responseData = { success: true, data, total: data.length, cookies };
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
          responseData = { success: true, file: base64, fileName, contentType, cookies };
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
            for (let i = 0; i < uint8Array.length; i++) {
              binary += String.fromCharCode(uint8Array[i]);
            }
            const base64 = btoa(binary);
            responseData = { success: true, file: base64, fileName: "relatorio.xls", cookies };
          } else {
            const data = parseHtmlTable(html);
            responseData = {
              success: true,
              data,
              total: data.length,
              cookies,
              note: "Relatório retornado como dados (sem arquivo para download)",
            };
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
  } catch (error) {
    console.error("Hinova proxy error:", error);
    return new Response(JSON.stringify({ error: `Erro interno: ${error instanceof Error ? error.message : String(error)}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});