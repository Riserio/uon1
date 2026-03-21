import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProxyRequest {
  corretora_id: string;
  action: 'login' | 'consultar-associado' | 'consultar-veiculo' | 'listar-eventos' | 'gerar-relatorio';
  params?: Record<string, string>;
  session_cookies?: string;
}

async function hinovaLogin(url: string, usuario: string, senha: string, codigoCliente: string): Promise<{ cookies: string; success: boolean; error?: string }> {
  try {
    // Try login via POST form
    const loginUrl = `${url}/login/validar`;
    const body = new URLSearchParams({
      usuario,
      senha,
      codigo_cliente: codigoCliente,
    });

    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      redirect: 'manual',
    });

    // Capture Set-Cookie headers
    const setCookies = response.headers.getSetCookie?.() || [];
    const cookieString = setCookies.map(c => c.split(';')[0]).join('; ');

    if (!cookieString) {
      // Try alternative login endpoint
      const altLoginUrl = `${url}/login`;
      const altResponse = await fetch(altLoginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        body: body.toString(),
        redirect: 'manual',
      });

      const altCookies = altResponse.headers.getSetCookie?.() || [];
      const altCookieString = altCookies.map(c => c.split(';')[0]).join('; ');

      if (altCookieString) {
        return { cookies: altCookieString, success: true };
      }

      // Try yet another pattern
      const formBody = new URLSearchParams({
        login: usuario,
        password: senha,
        codigo: codigoCliente,
      });

      const thirdResponse = await fetch(`${url}/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        body: formBody.toString(),
        redirect: 'manual',
      });

      const thirdCookies = thirdResponse.headers.getSetCookie?.() || [];
      const thirdCookieString = thirdCookies.map(c => c.split(';')[0]).join('; ');

      if (thirdCookieString) {
        return { cookies: thirdCookieString, success: true };
      }

      return { cookies: '', success: false, error: 'Não foi possível obter cookies de sessão. Verifique as credenciais.' };
    }

    return { cookies: cookieString, success: true };
  } catch (e) {
    return { cookies: '', success: false, error: `Erro de conexão: ${e.message}` };
  }
}

function parseHtmlTable(html: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  
  // Extract table headers
  const headerMatch = html.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
  const headers: string[] = [];
  if (headerMatch) {
    const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let thMatch;
    while ((thMatch = thRegex.exec(headerMatch[1])) !== null) {
      headers.push(thMatch[1].replace(/<[^>]*>/g, '').trim());
    }
  }

  // Extract table body rows
  const bodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (bodyMatch) {
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = trRegex.exec(bodyMatch[1])) !== null) {
      const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let tdMatch;
      const row: Record<string, string> = {};
      let colIndex = 0;
      while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
        const key = headers[colIndex] || `col_${colIndex}`;
        row[key] = tdMatch[1].replace(/<[^>]*>/g, '').trim();
        colIndex++;
      }
      if (Object.keys(row).length > 0) {
        rows.push(row);
      }
    }
  }

  return rows;
}

async function fetchWithCookies(url: string, cookies: string, method = 'GET', body?: string): Promise<Response> {
  const headers: Record<string, string> = {
    'Cookie': cookies,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };
  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  return await fetch(url, {
    method,
    headers,
    body: body || undefined,
    redirect: 'follow',
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { corretora_id, action, params, session_cookies } = await req.json() as ProxyRequest;

    if (!corretora_id || !action) {
      return new Response(
        JSON.stringify({ error: 'corretora_id e action são obrigatórios' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch credentials
    const { data: creds, error: credsError } = await supabase
      .from('hinova_credenciais')
      .select('*')
      .eq('corretora_id', corretora_id)
      .single();

    if (credsError || !creds) {
      return new Response(
        JSON.stringify({ error: 'Credenciais Hinova não encontradas para esta associação' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    const baseUrl = creds.url?.replace(/\/$/, '') || '';
    if (!baseUrl) {
      return new Response(
        JSON.stringify({ error: 'URL do Hinova não configurada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Login (or reuse session)
    let cookies = session_cookies || '';
    if (!cookies) {
      const loginResult = await hinovaLogin(baseUrl, creds.usuario, creds.senha, creds.codigo_cliente || '');
      if (!loginResult.success) {
        return new Response(
          JSON.stringify({ error: loginResult.error, action: 'login_failed' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }
      cookies = loginResult.cookies;
    }

    let responseData: any = { cookies };

    switch (action) {
      case 'login': {
        responseData = { success: true, cookies };
        break;
      }

      case 'consultar-associado': {
        const searchTerm = params?.busca || '';
        const url = `${baseUrl}/associado/consultarAssociado.php`;
        
        // Try POST with search params
        const searchBody = new URLSearchParams();
        if (searchTerm) {
          searchBody.set('busca', searchTerm);
          searchBody.set('nome', searchTerm);
          searchBody.set('cpf', searchTerm);
        }

        const response = await fetchWithCookies(url, cookies, 'POST', searchBody.toString());
        const html = await response.text();

        // Check for redirect (session expired)
        if (html.includes('login') && html.includes('senha') && html.length < 5000) {
          return new Response(
            JSON.stringify({ error: 'Sessão expirada, faça login novamente', action: 'session_expired' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
          );
        }

        const data = parseHtmlTable(html);
        responseData = { success: true, data, total: data.length, cookies };
        break;
      }

      case 'consultar-veiculo': {
        const searchTerm = params?.busca || '';
        const url = `${baseUrl}/veiculo/consultarVeiculo.php`;
        
        const searchBody = new URLSearchParams();
        if (searchTerm) {
          searchBody.set('busca', searchTerm);
          searchBody.set('placa', searchTerm);
        }

        const response = await fetchWithCookies(url, cookies, 'POST', searchBody.toString());
        const html = await response.text();

        if (html.includes('login') && html.includes('senha') && html.length < 5000) {
          return new Response(
            JSON.stringify({ error: 'Sessão expirada', action: 'session_expired' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
          );
        }

        const data = parseHtmlTable(html);
        responseData = { success: true, data, total: data.length, cookies };
        break;
      }

      case 'listar-eventos': {
        const url = `${baseUrl}/v5/Novoeventoitem/listar`;
        
        const searchBody = new URLSearchParams();
        if (params?.data_inicio) searchBody.set('data_inicio', params.data_inicio);
        if (params?.data_fim) searchBody.set('data_fim', params.data_fim);
        if (params?.situacao) searchBody.set('situacao', params.situacao);

        const response = await fetchWithCookies(url, cookies, 'POST', searchBody.toString());
        const html = await response.text();

        if (html.includes('login') && html.includes('senha') && html.length < 5000) {
          return new Response(
            JSON.stringify({ error: 'Sessão expirada', action: 'session_expired' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
          );
        }

        // Try JSON first (some Hinova endpoints return JSON)
        try {
          const jsonData = JSON.parse(html);
          responseData = { success: true, data: Array.isArray(jsonData) ? jsonData : jsonData.data || [], cookies };
        } catch {
          const data = parseHtmlTable(html);
          responseData = { success: true, data, total: data.length, cookies };
        }
        break;
      }

      case 'gerar-relatorio': {
        const layout = params?.layout || 'VANGARD';
        const url = `${baseUrl}/v5/Novoeventoitem/listar`;
        
        const searchBody = new URLSearchParams();
        searchBody.set('layout', layout);
        searchBody.set('exportar', 'excel');
        if (params?.data_inicio) searchBody.set('data_inicio', params.data_inicio);
        if (params?.data_fim) searchBody.set('data_fim', params.data_fim);

        const response = await fetchWithCookies(url, cookies, 'POST', searchBody.toString());
        
        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.includes('spreadsheet') || contentType.includes('octet-stream') || contentType.includes('excel')) {
          // Binary file — encode as base64
          const arrayBuffer = await response.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          const base64 = btoa(binary);
          
          const fileName = response.headers.get('content-disposition')?.match(/filename="?([^";\n]+)"?/)?.[1] || 'relatorio.xls';
          
          responseData = { 
            success: true, 
            file: base64, 
            fileName,
            contentType,
            cookies 
          };
        } else {
          // Might be HTML with a download link
          const html = await response.text();
          
          if (html.includes('login') && html.includes('senha') && html.length < 5000) {
            return new Response(
              JSON.stringify({ error: 'Sessão expirada', action: 'session_expired' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
            );
          }

          // Try to extract download link
          const linkMatch = html.match(/href="([^"]*\.xls[^"]*)"/i);
          if (linkMatch) {
            const downloadUrl = linkMatch[1].startsWith('http') ? linkMatch[1] : `${baseUrl}/${linkMatch[1]}`;
            const fileResponse = await fetchWithCookies(downloadUrl, cookies);
            const arrayBuffer = await fileResponse.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < uint8Array.length; i++) {
              binary += String.fromCharCode(uint8Array[i]);
            }
            const base64 = btoa(binary);
            responseData = { success: true, file: base64, fileName: 'relatorio.xls', cookies };
          } else {
            // Parse as data table
            const data = parseHtmlTable(html);
            responseData = { success: true, data, total: data.length, cookies, note: 'Relatório retornado como dados (sem arquivo para download)' };
          }
        }
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Ação desconhecida: ${action}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Hinova proxy error:', error);
    return new Response(
      JSON.stringify({ error: `Erro interno: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
