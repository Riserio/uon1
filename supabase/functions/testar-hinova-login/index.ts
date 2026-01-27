import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verificar autenticação
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, message: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, message: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { hinova_url, hinova_user, hinova_pass } = body;

    // Validação de campos obrigatórios
    if (!hinova_url) {
      return new Response(
        JSON.stringify({ success: false, message: "URL do portal é obrigatória", field: "hinova_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!hinova_user) {
      return new Response(
        JSON.stringify({ success: false, message: "Usuário é obrigatório", field: "hinova_user" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!hinova_pass) {
      return new Response(
        JSON.stringify({ success: false, message: "Senha é obrigatória", field: "hinova_pass" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validar formato da URL
    let urlObj: URL;
    try {
      urlObj = new URL(hinova_url);
    } catch {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "URL inválida. Formato esperado: https://...hinova.com.br/...",
          field: "hinova_url"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar se é um domínio Hinova válido
    if (!urlObj.hostname.includes('hinova.com.br')) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "URL deve ser do domínio hinova.com.br",
          field: "hinova_url"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Testar Hinova] Testando URL: ${hinova_url}`);

    // Testar se a URL está acessível
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const response = await fetch(hinova_url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: `Portal retornou erro HTTP ${response.status}. Verifique a URL.`,
            field: "hinova_url",
            http_status: response.status
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const html = await response.text();

      // Verificar se é uma página de login do Hinova
      const isLoginPage = 
        html.includes('login') || 
        html.includes('senha') || 
        html.includes('password') ||
        html.includes('Hinova') ||
        html.includes('SGA') ||
        html.includes('Sistema');

      if (!isLoginPage) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: "A URL não parece ser uma página de login do Hinova. Verifique o endereço.",
            field: "hinova_url"
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validar formato do usuário (mínimo 3 caracteres)
      if (hinova_user.length < 3) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: "Usuário deve ter pelo menos 3 caracteres",
            field: "hinova_user"
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Validar tamanho da senha
      if (hinova_pass.length < 3) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: "Senha muito curta",
            field: "hinova_pass"
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (hinova_pass.length < 3) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: "Senha muito curta",
            field: "hinova_pass"
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[Testar Hinova] Conexão bem-sucedida para: ${hinova_url}`);

      // Registrar log de auditoria
      await supabase.from("bi_audit_logs").insert({
        modulo: "cobranca",
        acao: "teste_conexao_hinova",
        descricao: `Teste de conexão Hinova realizado por ${user.email}`,
        user_id: user.id,
        user_nome: user.email || "Usuário",
        dados_novos: {
          url: hinova_url,
          usuario: hinova_user,
          resultado: 'sucesso',
        },
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Conexão validada com sucesso! A URL está acessível e parece ser um portal Hinova válido.",
          details: {
            url_accessible: true,
            is_login_page: true,
            user_format_valid: true,
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (fetchError: unknown) {
      console.error("[Testar Hinova] Erro de conexão:", fetchError);
      
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      
      if (errorMessage.includes('abort')) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: "Timeout: O portal demorou muito para responder. Verifique se a URL está correta.",
            field: "hinova_url"
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `Não foi possível conectar ao portal: ${errorMessage}`,
          field: "hinova_url"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error: unknown) {
    console.error("[Testar Hinova] Erro:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
