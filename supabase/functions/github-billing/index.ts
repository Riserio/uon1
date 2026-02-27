import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const GITHUB_PAT = Deno.env.get("GITHUB_PAT");
    const REPO_OWNER = Deno.env.get("GITHUB_REPO_OWNER");
    const REPO_NAME = Deno.env.get("GITHUB_REPO_NAME");

    if (!GITHUB_PAT || !REPO_OWNER || !REPO_NAME) {
      throw new Error("Missing GITHUB_PAT, GITHUB_REPO_OWNER or GITHUB_REPO_NAME");
    }

    const ghFetch = (url: string) =>
      fetch(url, {
        headers: {
          Authorization: `Bearer ${GITHUB_PAT}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

    const body = await req.json().catch(() => ({}));
    const action = body.action || "billing";

    // === ACTION: billing — get overall billing usage ===
    if (action === "billing") {
      // Try org billing first, fallback to user
      let billingData = null;
      
      // Get workflow runs for the last 90 days with timing
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      
      // Fetch all 3 workflows
      const workflows = ["cobranca-hinova.yml", "eventos-hinova.yml", "mgf-hinova.yml"];
      const workflowRuns: any[] = [];

      for (const wf of workflows) {
        let page = 1;
        let hasMore = true;
        while (hasMore) {
          const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${wf}/runs?per_page=100&page=${page}&created=>${since.slice(0, 10)}`;
          const res = await ghFetch(url);
          if (!res.ok) {
            console.error(`Error fetching ${wf} runs:`, res.status, await res.text());
            break;
          }
          const data = await res.json();
          const runs = data.workflow_runs || [];
          workflowRuns.push(
            ...runs.map((r: any) => ({
              id: r.id,
              name: r.name,
              workflow: wf.replace(".yml", ""),
              status: r.status,
              conclusion: r.conclusion,
              run_started_at: r.run_started_at,
              updated_at: r.updated_at,
              created_at: r.created_at,
              html_url: r.html_url,
              run_attempt: r.run_attempt,
            }))
          );
          if (runs.length < 100) hasMore = false;
          else page++;
        }
      }

      // Get timing for recent runs (batch — last 200 max to avoid rate limits)
      const recentRuns = workflowRuns.slice(0, 200);
      const timings: Record<number, any> = {};

      // Process in batches of 20 to avoid rate limits
      for (let i = 0; i < recentRuns.length; i += 20) {
        const batch = recentRuns.slice(i, i + 20);
        const results = await Promise.allSettled(
          batch.map(async (run: any) => {
            const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs/${run.id}/timing`;
            const res = await ghFetch(url);
            if (!res.ok) return null;
            const data = await res.json();
            return { runId: run.id, timing: data };
          })
        );
        results.forEach((r) => {
          if (r.status === "fulfilled" && r.value) {
            timings[r.value.runId] = r.value.timing;
          }
        });
      }

      // Merge timing into runs
      const runsWithTiming = workflowRuns.map((run) => {
        const timing = timings[run.id];
        let billable_ms = 0;
        let run_duration_ms = 0;
        if (timing) {
          run_duration_ms = timing.run_duration_ms || 0;
          // Sum billable time across all OS
          if (timing.billable) {
            for (const os of Object.values(timing.billable) as any[]) {
              billable_ms += (os.total_ms || 0);
            }
          }
        }
        return {
          ...run,
          run_duration_ms,
          billable_ms,
          billable_minutes: Math.ceil(billable_ms / 60000),
          run_duration_minutes: Math.ceil(run_duration_ms / 60000),
        };
      });

      // Summary
      const totalBillableMinutes = runsWithTiming.reduce((s, r) => s + r.billable_minutes, 0);
      const totalRunDurationMinutes = runsWithTiming.reduce((s, r) => s + r.run_duration_minutes, 0);
      const totalRuns = runsWithTiming.length;

      // Per workflow summary
      const perWorkflow: Record<string, { runs: number; billable_minutes: number; run_duration_minutes: number; errors: number }> = {};
      runsWithTiming.forEach((r) => {
        if (!perWorkflow[r.workflow]) perWorkflow[r.workflow] = { runs: 0, billable_minutes: 0, run_duration_minutes: 0, errors: 0 };
        perWorkflow[r.workflow].runs++;
        perWorkflow[r.workflow].billable_minutes += r.billable_minutes;
        perWorkflow[r.workflow].run_duration_minutes += r.run_duration_minutes;
        if (r.conclusion === "failure") perWorkflow[r.workflow].errors++;
      });

      return new Response(
        JSON.stringify({
          total_runs: totalRuns,
          total_billable_minutes: totalBillableMinutes,
          total_run_duration_minutes: totalRunDurationMinutes,
          per_workflow: perWorkflow,
          runs: runsWithTiming,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === ACTION: sync — update local execution records with real GitHub timing ===
    if (action === "sync") {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, serviceKey);

      // Get executions with github_run_id that may need updating
      const tables = [
        "cobranca_automacao_execucoes",
        "sga_automacao_execucoes",
        "mgf_automacao_execucoes",
      ];

      let synced = 0;

      for (const table of tables) {
        const { data: executions } = await sb
          .from(table)
          .select("id, github_run_id, duracao_segundos")
          .not("github_run_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(200);

        if (!executions || executions.length === 0) continue;

        for (const exec of executions) {
          if (!exec.github_run_id) continue;

          try {
            const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs/${exec.github_run_id}/timing`;
            const res = await ghFetch(url);
            if (!res.ok) continue;

            const timing = await res.json();
            const runDurationSec = Math.ceil((timing.run_duration_ms || 0) / 1000);

            if (runDurationSec > 0 && runDurationSec !== exec.duracao_segundos) {
              await sb.from(table).update({ duracao_segundos: runDurationSec }).eq("id", exec.id);
              synced++;
            }
          } catch (e) {
            console.error(`Error syncing run ${exec.github_run_id}:`, e);
          }
        }
      }

      return new Response(
        JSON.stringify({ synced, message: `${synced} execuções atualizadas com tempos reais do GitHub` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
