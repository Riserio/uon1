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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const githubPat = Deno.env.get("GITHUB_PAT");
    const githubRepoOwner = Deno.env.get("GITHUB_REPO_OWNER");
    const githubRepoName = Deno.env.get("GITHUB_REPO_NAME");

    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, message: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ success: false, message: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const user = { id: claimsData.claims.sub as string, email: (claimsData.claims.email as string) || "Usuário" };

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { corretora_id, placa, renavam, chassi, cpf_consulta } = body;

    if (!corretora_id || !placa) {
      return new Response(
        JSON.stringify({ success: false, message: "corretora_id e placa são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: cred } = await supabase
      .from("detran_mg_credenciais")
      .select("ativo, gov_br_cpf, gov_br_senha_secret_id")
      .eq("corretora_id", corretora_id)
      .maybeSingle();

    if (!cred || !cred.ativo || !cred.gov_br_cpf || !cred.gov_br_senha_secret_id) {
      return new Response(
        JSON.stringify({ success: false, message: "Login Gov.br não configurado (ou desativado) para esta associação. Configure em 'Login Gov.br (Detran-MG)'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!githubPat || !githubRepoOwner || !githubRepoName) {
      return new Response(
        JSON.stringify({ success: false, message: "Configuração do GitHub incompleta" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: execucao, error: execError } = await supabase
      .from("detran_mg_execucoes")
      .insert({
        corretora_id,
        usuario_id: user.id,
        placa,
        renavam: renavam || null,
        chassi: chassi || null,
        cpf_consulta: cpf_consulta || null,
        status: "executando",
      })
      .select()
      .single();

    if (execError || !execucao) {
      console.error("Erro ao criar execução:", execError);
      return new Response(
        JSON.stringify({ success: false, message: "Erro ao registrar execução" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dispatchUrl = `https://api.github.com/repos/${githubRepoOwner}/${githubRepoName}/actions/workflows/detran-mg.yml/dispatches`;
    const dispatchResponse = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${githubPat}`,
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          corretora_id,
          placa,
          renavam: renavam || '',
          chassi: chassi || '',
          cpf_consulta: cpf_consulta || '',
          execucao_id: execucao.id,
          webhook_url: `${supabaseUrl}/functions/v1/webhook-detran-mg`,
        },
      }),
    });

    if (!dispatchResponse.ok && dispatchResponse.status !== 204) {
      const errorText = await dispatchResponse.text();
      console.error("Erro ao disparar workflow Detran-MG:", dispatchResponse.status, errorText);
      await supabase.from("detran_mg_execucoes").update({
        status: 'erro',
        erro: `Erro ao disparar GitHub Actions: ${dispatchResponse.status}`,
        finalizado_at: new Date().toISOString(),
      }).eq("id", execucao.id);
      return new Response(
        JSON.stringify({ success: false, message: "Erro ao disparar workflow no GitHub" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Associa o run correto (o run-name inclui o execucao_id)
    let githubRunId: string | null = null;
    let githubRunUrl: string | null = null;
    for (let attempt = 0; attempt < 4 && !githubRunId; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        const runsUrl = `https://api.github.com/repos/${githubRepoOwner}/${githubRepoName}/actions/workflows/detran-mg.yml/runs?event=workflow_dispatch&per_page=10`;
        const runsResponse = await fetch(runsUrl, {
          headers: { 'Authorization': `Bearer ${githubPat}`, 'Accept': 'application/vnd.github.v3+json' },
          signal: AbortSignal.timeout(20000),
        });
        if (!runsResponse.ok) continue;
        const runsData = await runsResponse.json();
        const match = (runsData.workflow_runs || []).find((r: { display_title?: string }) =>
          r.display_title?.includes(execucao.id),
        );
        if (match) {
          githubRunId = String((match as { id: number }).id);
          githubRunUrl = (match as { html_url: string }).html_url;
        }
      } catch (e) {
        console.warn(`[Detran-MG Workflow] Tentativa ${attempt + 1} de localizar run falhou:`, e);
      }
    }

    if (githubRunId) {
      await supabase.from("detran_mg_execucoes").update({ github_run_id: githubRunId, github_run_url: githubRunUrl }).eq("id", execucao.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Consulta Detran-MG iniciada",
        execucao_id: execucao.id,
        github_run_id: githubRunId,
        github_run_url: githubRunUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[disparar-detran-mg-workflow] Erro:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
