import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------- helpers ----------
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "") || String(v));
  // A API ja manda "2900.00" (ponto decimal). Tenta direto primeiro.
  const direto = parseFloat(String(v));
  return Number.isFinite(direto) ? direto : (Number.isFinite(n) ? n : null);
};
const dateISO = (v: unknown): string | null => {
  if (!v || typeof v !== "string") return null;
  // API devolve YYYY-MM-DD; ignora placeholders "9999-99-99"/"0000-00-00"
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m || m[1] === "9999" || m[1] === "0000") return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
};
const int = (v: unknown): number | null => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const ddmmyyyy = (d: Date): string => {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const parseBR = (s: string): Date | null => {
  const m = s?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
};
const addDays = (d: Date, n: number): Date => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const corretora_id: string = body.corretora_id;
    const modulo: string = body.modulo || "eventos";
    if (!corretora_id) {
      return new Response(JSON.stringify({ success: false, message: "corretora_id é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Credenciais da API
    const { data: cred } = await supabase
      .from("hinova_credenciais")
      .select("api_token, api_base_url, hinova_user, hinova_pass, usar_api")
      .eq("corretora_id", corretora_id)
      .maybeSingle();

    if (!cred?.api_token || !cred?.hinova_user || !cred?.hinova_pass) {
      return new Response(JSON.stringify({ success: false, message: "API não configurada (token/usuário/senha)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const base = (cred.api_base_url || "https://api.hinova.com.br/api/sga/v2").replace(/\/$/, "");

    // 1) Autenticar -> token_usuario (nao expira)
    const authRes = await fetch(`${base}/usuario/autenticar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cred.api_token}` },
      body: JSON.stringify({ usuario: cred.hinova_user, senha: cred.hinova_pass }),
    });
    const authJson = await authRes.json().catch(() => ({}));
    const tokenUsuario = authJson?.token_usuario;
    if (!tokenUsuario) {
      const msg = authJson?.error?.mensagem || authJson?.mensagem || "Falha na autenticação da API";
      throw new Error(`API auth: ${msg}`);
    }
    const H = { "Content-Type": "application/json", Authorization: `Bearer ${tokenUsuario}` };

    if (modulo !== "eventos") {
      return new Response(JSON.stringify({ success: false, message: `Módulo '${modulo}' ainda não implementado na API (piloto: eventos)` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Janela de datas (default: últimos 18 meses). data_cadastro/data_cadastro_final, máx 30 dias por janela.
    const hoje = new Date();
    const fim = body.data_fim ? parseBR(body.data_fim) || hoje : hoje;
    const inicio = body.data_inicio ? parseBR(body.data_inicio) || addDays(fim, -540) : addDays(fim, -540);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const porCodigo = new Map<string, any>();
    let janelas = 0;
    let cursor = new Date(inicio);
    while (cursor <= fim && janelas < 40) {
      const janelaFim = addDays(cursor, 29) > fim ? fim : addDays(cursor, 29);
      janelas++;
      const r = await fetch(`${base}/listar/evento`, {
        method: "POST",
        headers: H,
        body: JSON.stringify({ data_cadastro: ddmmyyyy(cursor), data_cadastro_final: ddmmyyyy(janelaFim) }),
      });
      const j = await r.json().catch(() => null);
      const arr = Array.isArray(j) ? j : [];
      for (const ev of arr) {
        const chave = String(ev.codigo_evento ?? ev.codigo ?? ev.protocolo ?? Math.random());
        porCodigo.set(chave, ev);
      }
      cursor = addDays(janelaFim, 1);
    }

    // 3) Mapear -> sga_eventos
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventos = Array.from(porCodigo.values()).map((ev: any) => {
      const vec = ev.veiculo || {};
      return {
        situacao_evento: ev.situacao_evento ?? null,
        tipo_evento: ev.evento_tipo ?? null,
        motivo_evento: ev.motivo ?? null,
        envolvimento: ev.envolvimento ?? null,
        passivel_ressarcimento: ev.passivel_ressarcimento || null,
        solicitou_carro_reserva: ev.solicitou_carro_reserva ?? null,
        protocolo: ev.protocolo ? String(ev.protocolo) : null,
        numero_bo: ev.numero_bo || null,
        data_cadastro_item: dateISO(ev.data_cadastro),
        data_cadastro_evento: dateISO(ev.data_cadastro),
        data_evento: dateISO(ev.data_evento),
        valor_reparo: num(ev.valor_reparo),
        previsao_valor_reparo: num(ev.previsao_valor_reparo),
        participacao: num(ev.participacao),
        evento_cidade: ev.cidade || null,
        evento_logradouro: ev.logradouro || null,
        regional: ev.regional || null,
        cooperativa: ev.cooperativa || null,
        voluntario: ev.voluntario || null,
        // veículo (objeto aninhado)
        placa: vec.placa || null,
        modelo_veiculo: vec.modelo || null,
        ano_fabricacao: int(vec.ano_fabricacao),
        categoria_veiculo: vec.categoria || null,
        valor_protegido_veiculo: num(vec.valor_fipe),
      };
    });

    // 4) Gravar importação + eventos (mesmas tabelas do crawl)
    const nomeArquivo = `API eventos ${ddmmyyyy(inicio)}–${ddmmyyyy(fim)}`;
    const { data: imp, error: impErr } = await supabase
      .from("sga_importacoes")
      .insert({ nome_arquivo: nomeArquivo, total_registros: eventos.length, corretora_id, ativo: true })
      .select("id")
      .single();
    if (impErr) throw new Error(`Erro ao criar importação: ${impErr.message}`);

    // desativa importações anteriores
    await supabase.from("sga_importacoes").update({ ativo: false }).eq("corretora_id", corretora_id).neq("id", imp.id);

    // insere em lotes
    if (eventos.length > 0) {
      const comImp = eventos.map((e) => ({ ...e, importacao_id: imp.id }));
      for (let i = 0; i < comImp.length; i += 500) {
        const lote = comImp.slice(i, i + 500);
        const { error: insErr } = await supabase.from("sga_eventos").insert(lote);
        if (insErr) throw new Error(`Erro ao inserir eventos (lote ${i}): ${insErr.message}`);
      }
    }

    // 5) Atualiza config
    await supabase.from("sga_automacao_config").update({
      ultimo_status: "sucesso",
      ultimo_erro: null,
      ultima_execucao: new Date().toISOString(),
      ultima_origem: "api",
    }).eq("corretora_id", corretora_id);

    return new Response(JSON.stringify({ success: true, modulo: "eventos", total: eventos.length, janelas, importacao_id: imp.id, via: "api" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    console.error("[importar-api-hinova]", msg);
    return new Response(JSON.stringify({ success: false, message: msg }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
