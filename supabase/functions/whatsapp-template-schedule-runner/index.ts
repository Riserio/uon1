import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_TOKEN = Deno.env.get("META_WHATSAPP_TOKEN")!;
const META_PHONE_ID = Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID")!;
const META_WABA_ID = Deno.env.get("META_WHATSAPP_BUSINESS_ACCOUNT_ID") || "";

// Cache: template name -> number of {{n}} placeholders in HEADER/BODY components.
const templateParamSpecCache = new Map<string, { header: number; body: number }>();

async function getTemplateParamSpec(name: string, language: string): Promise<{ header: number; body: number } | null> {
  const cacheKey = `${name}::${language}`;
  if (templateParamSpecCache.has(cacheKey)) return templateParamSpecCache.get(cacheKey)!;

  let wabaId = META_WABA_ID;
  if (!wabaId) {
    const phoneRes = await fetch(`https://graph.facebook.com/v22.0/${META_PHONE_ID}?fields=whatsapp_business_account`, {
      headers: { Authorization: `Bearer ${META_TOKEN}` },
    });
    const phoneJson = await phoneRes.json();
    wabaId = phoneJson?.whatsapp_business_account?.id;
    if (!wabaId) return null;
  }

  const res = await fetch(
    `https://graph.facebook.com/v22.0/${wabaId}/message_templates?name=${encodeURIComponent(name)}&fields=name,language,components&limit=20`,
    { headers: { Authorization: `Bearer ${META_TOKEN}` } },
  );
  const json = await res.json();
  if (!res.ok) return null;
  const list = Array.isArray(json?.data) ? json.data : [];
  const match =
    list.find((t: any) => t.name === name && t.language === language) || list.find((t: any) => t.name === name);
  if (!match) return null;
  const countPlaceholders = (text = "") => {
    const placeholders = new Set<number>();
    const re = /\{\{\s*(\d+)\s*\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) placeholders.add(Number(m[1]));
    return placeholders.size;
  };
  const components = match.components || [];
  const header = components.find((c: any) => c.type === "HEADER");
  const body = components.find((c: any) => c.type === "BODY");
  const spec = {
    header: countPlaceholders(header?.text || ""),
    body: countPlaceholders(body?.text || ""),
  };
  templateParamSpecCache.set(cacheKey, spec);
  return spec;
}

// Default mapping from generator JSON fields → template {{n}} placeholders.
const DEFAULT_MAPS: Record<string, string[]> = {
  resumo_eventos: [
    "mes_referencia",
    "total_eventos",
    "eventos_colisao",
    "eventos_vidros",
    "eventos_furto_roubo",
    "eventos_outros",
    "cidade_mais_eventos",
    "cooperativa_mais_eventos",
  ],
  resumo_cobranca: [
    "data_atual",
    "percentual_inadimplencia",
    "total_gerados",
    "total_baixados",
    "faturamento_esperado_formatado",
    "faturamento_recebido_formatado",
    "total_aberto_formatado",
    "boletos_por_dia",
    "cooperativa_maior_inadimplencia",
    "cooperativa_menor_inadimplencia",
  ],
  resumo_mgf: ["mes_referencia", "total_atendimentos", "finalizados", "pendentes"],
  // RESUMO GERAL consolidado — mapeamento alinhado 1:1 com o template Meta
  // aprovado (11 variáveis: nome, período, financeiro, cobrança, eventos,
  // destaques). Se o layout do template mudar, ajuste esta ordem também —
  // ou defina schedule.variable_map.order para sobrepor por agendamento.
  resumo_geral: [
    "nome_associacao", // {{1}} nome da associação
    "cob_mes_referencia", // {{2}} período/mês de referência
    "cob_faturamento_esperado", // {{3}} faturamento previsto
    "cob_faturamento_recebido", // {{4}} faturamento recebido
    "cob_total_aberto", // {{5}} valor em aberto
    "cob_total_gerados", // {{6}} boletos gerados
    "cob_total_baixados", // {{7}} boletos baixados
    "cob_percentual_inadimplencia", // {{8}} inadimplência
    "ev_total", // {{9}} total de eventos
    "cob_coop_maior_inadimplencia", // {{10}} maior inadimplência
    "ev_cidade_top", // {{11}} cidade com mais eventos
  ],
};

const DATA_FN: Record<string, string> = {
  resumo_eventos: "gerar-resumo-eventos",
  resumo_cobranca: "gerar-resumo-cobranca",
  resumo_mgf: "gerar-resumo-eventos", // fallback temporário
  resumo_geral: "gerar-resumo-geral",
};

// Tipo gravado no histórico conforme a fonte de dados
function tipoFromSource(source: string): string {
  if (source === "resumo_cobranca") return "cobranca";
  if (source === "resumo_eventos") return "eventos";
  if (source === "resumo_geral") return "geral";
  return "mgf";
}

function toSPDate(d: Date): { y: number; m: number; day: number; dow: number; hh: number; mm: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(d).reduce<Record<string, string>>((a, p) => {
    a[p.type] = p.value;
    return a;
  }, {});
  const dows: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: +parts.year,
    m: +parts.month,
    day: +parts.day,
    dow: dows[parts.weekday] ?? 0,
    hh: +parts.hour,
    mm: +parts.minute,
  };
}

// Build a UTC Date for a São Paulo wall-clock instant (BRT = UTC-3, no DST).
function spWallToUtc(y: number, m: number, day: number, hh: number, mm: number): Date {
  return new Date(Date.UTC(y, m - 1, day, hh + 3, mm, 0));
}

export function computeNextRun(schedule: any, from: Date = new Date()): Date {
  const [hStr, mStr] = String(schedule.send_time || "08:00").split(":");
  const hh = +hStr,
    mm = +mStr;
  const sp = toSPDate(from);
  // candidate today at send_time SP
  let candidate = spWallToUtc(sp.y, sp.m, sp.day, hh, mm);

  if (schedule.frequency === "daily") {
    if (candidate <= from) candidate = new Date(candidate.getTime() + 24 * 3600_000);
    return candidate;
  }

  if (schedule.frequency === "weekly") {
    const target = Number(schedule.day_of_week ?? 1);
    // Compute SP-aware difference
    let diff = (target - sp.dow + 7) % 7;
    if (diff === 0 && candidate <= from) diff = 7;
    return new Date(spWallToUtc(sp.y, sp.m, sp.day, hh, mm).getTime() + diff * 24 * 3600_000);
  }

  if (schedule.frequency === "monthly") {
    const targetDom = Math.max(1, Math.min(31, Number(schedule.day_of_month ?? 1)));
    let y = sp.y,
      m = sp.m;
    const tryBuild = (yy: number, mm0: number) => {
      const last = new Date(Date.UTC(yy, mm0, 0)).getUTCDate(); // last day of mm0
      const dom = Math.min(targetDom, last);
      return spWallToUtc(yy, mm0, dom, hh, mm);
    };
    let cand = tryBuild(y, m);
    if (cand <= from) {
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
      cand = tryBuild(y, m);
    }
    return cand;
  }

  return new Date(from.getTime() + 24 * 3600_000);
}

async function generateData(supabase: any, source: string, corretora_id: string): Promise<any> {
  const fnName = DATA_FN[source] || "gerar-resumo-eventos";
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ corretora_id }),
  });
  const json = await res.json();
  if (!res.ok || !json?.success) throw new Error(json?.error || "Falha ao gerar dados");
  return json.dados || {};
}

// A Meta rejeita parâmetros com quebra de linha, tab ou 4+ espaços seguidos (erro #132018).
// Sanitiza qualquer valor antes do envio: quebras viram " · ", espaços múltiplos são colapsados.
function sanitizeParam(v: any): string {
  return (
    String(v ?? "")
      .replace(/[\n\r\t]+/g, " · ")
      .replace(/ {4,}/g, " ")
      .trim() || "-"
  );
}

function buildParameters(schedule: any, dados: Record<string, any>): { type: "text"; text: string }[] {
  const order: string[] =
    Array.isArray(schedule.variable_map?.order) && schedule.variable_map.order.length > 0
      ? schedule.variable_map.order
      : DEFAULT_MAPS[schedule.data_source] || [];
  return order.map((field) => ({ type: "text", text: sanitizeParam(dados[field]) }));
}

async function sendTemplate(
  phone: string,
  schedule: any,
  params: { type: "text"; text: string }[],
  headerText: string,
) {
  const formatted = phone.replace(/\D/g, "").startsWith("55")
    ? phone.replace(/\D/g, "")
    : `55${phone.replace(/\D/g, "")}`;

  // Adjust params to match the template's actual HEADER/BODY placeholder count.
  let adjustedParams = params;
  let headerParams: { type: "text"; text: string }[] = [];
  try {
    const expected = await getTemplateParamSpec(schedule.template_name, schedule.template_language || "pt_BR");
    if (expected) {
      if (expected.header > 0) {
        headerParams = Array.from({ length: expected.header }, (_, index) => ({
          type: "text" as const,
          text: index === 0 ? headerText : "-",
        }));
      }
      if (params.length > expected.body) {
        adjustedParams = params.slice(0, expected.body);
      } else if (params.length < expected.body) {
        adjustedParams = [
          ...params,
          ...Array.from({ length: expected.body - params.length }, () => ({ type: "text" as const, text: "-" })),
        ];
      }
    }
  } catch {
    /* fall back to provided params */
  }

  const components = [];
  if (headerParams.length > 0) components.push({ type: "header", parameters: headerParams });
  if (adjustedParams.length > 0) components.push({ type: "body", parameters: adjustedParams });

  const body: any = {
    messaging_product: "whatsapp",
    to: formatted,
    type: "template",
    template: {
      name: schedule.template_name,
      language: { code: schedule.template_language || "pt_BR" },
      ...(components.length > 0 ? { components } : {}),
    },
  };
  const res = await fetch(`https://graph.facebook.com/v22.0/${META_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${META_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Erro Meta API");
  return json.messages?.[0]?.id || null;
}

async function runOne(supabase: any, schedule: any) {
  const now = new Date();
  try {
    const { data: corretora } = await supabase
      .from("corretoras")
      .select("nome")
      .eq("id", schedule.corretora_id)
      .maybeSingle();
    const dados = await generateData(supabase, schedule.data_source, schedule.corretora_id);
    const params = buildParameters(schedule, dados);
    const headerText = corretora?.nome || "Associação";

    const recipients: string[] = Array.isArray(schedule.recipients) ? schedule.recipients : [];
    if (recipients.length === 0) throw new Error("Sem destinatários");

    const results: string[] = [];
    for (const phone of recipients) {
      if (!phone?.trim()) continue;
      try {
        const id = await sendTemplate(phone.trim(), schedule, params, headerText);
        results.push(`${phone}:ok`);
        await supabase.from("whatsapp_messages").insert({
          direction: "out",
          body: `[template:${schedule.template_name}] ${params.map((p) => p.text).join(" | ")}`,
          type: "template",
          status: "sent",
          meta_message_id: id,
        });
        await supabase.from("whatsapp_historico").insert({
          corretora_id: schedule.corretora_id,
          telefone_destino: phone.trim().replace(/\D/g, "").startsWith("55")
            ? phone.trim().replace(/\D/g, "")
            : `55${phone.trim().replace(/\D/g, "")}`,
          mensagem: `[template:${schedule.template_name}] ${params.map((p) => p.text).join(" | ")}`,
          tipo: tipoFromSource(schedule.data_source),
          status: "enviado",
          status_entrega: "enviado",
          meta_message_id: id,
          enviado_em: now.toISOString(),
          enviado_por: schedule.created_by || null,
        });
      } catch (e: any) {
        results.push(`${phone}:erro(${e.message})`);
        await supabase.from("whatsapp_historico").insert({
          corretora_id: schedule.corretora_id,
          telefone_destino: phone.trim().replace(/\D/g, "").startsWith("55")
            ? phone.trim().replace(/\D/g, "")
            : `55${phone.trim().replace(/\D/g, "")}`,
          mensagem: `[template:${schedule.template_name}] ${params.map((p) => p.text).join(" | ")}`,
          tipo: tipoFromSource(schedule.data_source),
          status: "erro",
          status_entrega: "erro",
          erro_mensagem: e.message,
          enviado_em: now.toISOString(),
          enviado_por: schedule.created_by || null,
        });
      }
    }

    await supabase
      .from("whatsapp_template_schedules")
      .update({
        last_run_at: now.toISOString(),
        last_status: results.join(", "),
        last_error: null,
        next_run_at: computeNextRun(schedule, now).toISOString(),
      })
      .eq("id", schedule.id);
    return { ok: results.some((result) => result.includes(":ok")), results };
  } catch (e: any) {
    await supabase
      .from("whatsapp_template_schedules")
      .update({
        last_run_at: now.toISOString(),
        last_status: "failed",
        last_error: e.message,
        next_run_at: computeNextRun(schedule, now).toISOString(),
      })
      .eq("id", schedule.id);
    return { ok: false, results: [], error: e.message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Force-run a specific schedule (manual "Enviar agora" from UI)
  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  if (body?.schedule_id) {
    const { data: sch, error } = await supabase
      .from("whatsapp_template_schedules")
      .select("*")
      .eq("id", body.schedule_id)
      .single();
    if (error || !sch) {
      return new Response(JSON.stringify({ error: "schedule not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const result = await runOne(supabase, sch);
    return new Response(JSON.stringify({ ...result, ran: result.ok ? 1 : 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Cron tick: run all due schedules.
  const now = new Date().toISOString();
  const { data: due, error } = await supabase
    .from("whatsapp_template_schedules")
    .select("*")
    .eq("ativo", true)
    .or(`next_run_at.is.null,next_run_at.lte.${now}`)
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let ran = 0;
  for (const sch of due || []) {
    // If next_run_at is null, just compute and skip this tick to avoid surprise sends.
    if (!sch.next_run_at) {
      await supabase
        .from("whatsapp_template_schedules")
        .update({ next_run_at: computeNextRun(sch).toISOString() })
        .eq("id", sch.id);
      continue;
    }
    await runOne(supabase, sch);
    ran++;
  }

  return new Response(JSON.stringify({ ok: true, ran, total: due?.length || 0 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
