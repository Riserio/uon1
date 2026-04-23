import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

// Mapeamento de colunas do Excel/JSON para campos do banco
// Aceita o formato padronizado do layout "BI - Vangard Cobrança"
const COLUMN_MAP: { [key: string]: string } = {
  // Formato padronizado (vindo do Excel processado pelo script)
  "Data Pagamento": "data_pagamento",
  "Data Vencimento Original": "data_vencimento_original",
  "Dia Vencimento Veiculo": "dia_vencimento_veiculo",
  "Regional Boleto": "regional_boleto",
  "Cooperativa": "cooperativa",
  "Voluntário": "voluntario",
  "Nome": "nome",
  "Placas": "placas",
  "Valor": "valor",
  "Data Vencimento": "data_vencimento",
  "Qtde Dias em Atraso Vencimento Original": "qtde_dias_atraso_vencimento_original",
  "Situacao": "situacao",
  
  // ===== ALIASES E VARIAÇÕES ADICIONAIS =====
  // Estes campos precisam ser mapeados para garantir que qualquer variação seja reconhecida
  
  // Nome e Voluntário
  "nome": "nome",
  "voluntario": "voluntario",
  "voluntário": "voluntario",
  
  // Placas
  "placas": "placas",
  "placa": "placas",
  
  // Cooperativa e Regional
  "cooperativa": "cooperativa",
  "regional": "regional_boleto",
  "regional_boleto": "regional_boleto",
  "regional boleto": "regional_boleto",
  
  // Situação
  "situacao": "situacao",
  "situação": "situacao",
  "situacao_boleto": "situacao",
  "situação_boleto": "situacao",
  
  // Valor
  "valor": "valor",
  
  // Datas de Vencimento
  "data_vencimento": "data_vencimento",
  "vencimento": "data_vencimento",
  "data vencimento": "data_vencimento",
  "data_vencimento_original": "data_vencimento_original",
  "vencimento_original": "data_vencimento_original",
  "data vencimento original": "data_vencimento_original",
  
  // Data de Pagamento
  "data_pagamento": "data_pagamento",
  "pagamento": "data_pagamento",
  "data pagamento": "data_pagamento",
  
  // ===== CAMPOS CRÍTICOS: Dia Vencimento Veículo =====
  "dia_vencimento_veiculo": "dia_vencimento_veiculo",
  "dia_vencimento": "dia_vencimento_veiculo",
  "dia vencimento veiculo": "dia_vencimento_veiculo",
  "dia vencimento veículo": "dia_vencimento_veiculo",
  "vencimento_veiculo": "dia_vencimento_veiculo",
  "vencimento_do_veiculo": "dia_vencimento_veiculo",
  "vencimento do veiculo": "dia_vencimento_veiculo",
  "vencimento do veículo": "dia_vencimento_veiculo",
  "dia_venc_veiculo": "dia_vencimento_veiculo",
  
  // ===== CAMPOS CRÍTICOS: Dias de Atraso =====
  "qtde_dias_atraso_vencimento_original": "qtde_dias_atraso_vencimento_original",
  "qtde dias em atraso vencimento original": "qtde_dias_atraso_vencimento_original",
  "qtde_dias_em_atraso_vencimento_original": "qtde_dias_atraso_vencimento_original",
  "dias_atraso": "qtde_dias_atraso_vencimento_original",
  "dias atraso": "qtde_dias_atraso_vencimento_original",
  "dias_em_atraso": "qtde_dias_atraso_vencimento_original",
  "dias em atraso": "qtde_dias_atraso_vencimento_original",
  "atraso": "qtde_dias_atraso_vencimento_original",
  "qtde_atraso": "qtde_dias_atraso_vencimento_original",
  "quantidade_dias_atraso": "qtde_dias_atraso_vencimento_original",
};

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

// ============================================
// Deduplicação fiel ao SGA
// ============================================
// O relatório SGA mostra 1 boleto por pessoa+data_vencimento (mesmo quando
// a pessoa tem múltiplos veículos no mesmo dia) e ignora boletos
// "acumulados/refaturados" (data_vencimento_original com dia diferente
// do dia_vencimento_veiculo). Esta função aplica as mesmas regras.
function normalizarNomeSGA(nome: any): string {
  if (!nome) return "";
  return String(nome)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function diaDeISO(s: any): number | null {
  if (!s) return null;
  const m = String(s).match(/^\d{4}-\d{2}-(\d{2})/);
  return m ? parseInt(m[1], 10) : null;
}

function isAcumuladoSGA(b: any): boolean {
  if (b.dia_vencimento_veiculo == null) return false;
  const d = diaDeISO(b.data_vencimento_original);
  if (d == null) return false;
  return d !== Number(b.dia_vencimento_veiculo);
}

function dedupSGAFielServer(boletos: any[]): any[] {
  if (!Array.isArray(boletos) || boletos.length === 0) return [];
  const mapa = new Map<string, any>();
  for (const b of boletos) {
    const nome = normalizarNomeSGA(b.nome);
    const dv = b.data_vencimento || "";
    if (!nome || !dv) {
      mapa.set(`__nokey_${mapa.size}`, b);
      continue;
    }
    const key = `${nome}|${dv}`;
    const existente = mapa.get(key);
    const valorNovo = parseFloat(String(b.valor || 0)) || 0;
    const valorExist = existente ? (parseFloat(String(existente.valor || 0)) || 0) : -1;
    if (!existente || valorNovo > valorExist) {
      mapa.set(key, b);
    }
  }
  return Array.from(mapa.values());
}

function normalizeGithubRunId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function isUuidString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeColumnKey(key: string): string {
  return key
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatDateParts(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getTodayInSaoPaulo(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);

  return formatDateParts(year, month, day) || new Date().toISOString().split("T")[0];
}

// Parse de data no formato brasileiro (timezone-safe)
function parseDate(value: any): string | null {
  if (!value) return null;

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === "number") {
    if (value < 1 || value > 100000) return null;
    const excelEpochUtc = Date.UTC(1899, 11, 30);
    const dateUtc = new Date(excelEpochUtc + Math.round(value) * 86400000);
    if (isNaN(dateUtc.getTime())) return null;
    return formatDateParts(dateUtc.getUTCFullYear(), dateUtc.getUTCMonth() + 1, dateUtc.getUTCDate());
  }

  const strValue = String(value).trim();
  if (!strValue) return null;

  const baseDate = strValue.split("T")[0].split(" ")[0];

  // Brasil: DD/MM/YYYY (padrão)
  const brMatch = baseDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (brMatch) {
    let day = Number(brMatch[1]);
    let month = Number(brMatch[2]);
    let year = Number(brMatch[3]);
    if (year < 100) year += 2000;

    // fallback para MM/DD quando detectado
    if (month > 12 && day <= 12) {
      const tmp = day;
      day = month;
      month = tmp;
    }

    return formatDateParts(year, month, day);
  }

  // ISO: YYYY-MM-DD
  const isoMatch = baseDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return formatDateParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  return null;
}

// Parse de valor monetário - trata formato brasileiro e valores com casas decimais extras
function parseMoneyValue(value: any): number {
  if (!value) return 0;
  
  const strValue = String(value).trim();
  
  // Remove R$, espaços extras
  let cleanValue = strValue.replace(/R\$\s*/gi, '').trim();
  
  // Se não tem vírgula nem ponto, pode ser um número inteiro
  if (!/[.,]/.test(cleanValue)) {
    const parsed = parseFloat(cleanValue);
    if (isNaN(parsed)) return 0;
    // Se parece ser um valor em centavos (muito grande para boleto típico)
    // Ex: 9639 quando deveria ser 96,39
    if (parsed > 10000 && parsed % 100 === 0) {
      return parsed / 100;
    }
    return parsed;
  }
  
  // Detectar formato brasileiro: 1.234,56 ou 96,39
  // vs formato internacional: 1,234.56 ou 96.39
  const lastComma = cleanValue.lastIndexOf(',');
  const lastDot = cleanValue.lastIndexOf('.');
  
  if (lastComma > lastDot) {
    // Formato brasileiro: vírgula é separador decimal
    // Remove pontos (milhares) e substitui vírgula por ponto
    cleanValue = cleanValue.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // Formato internacional ou misto
    // Remove vírgulas (milhares)
    cleanValue = cleanValue.replace(/,/g, '');
  }
  
  const parsed = parseFloat(cleanValue);
  if (isNaN(parsed)) return 0;
  
  // Verificar se o valor parece ter casas decimais extras (4, 5, 6 casas)
  // Ex: se o resultado é 9639.00 mas deveria ser 96.39
  // Isso acontece quando o Excel armazena "96,3900" que vira "96.3900" -> 96.39 (ok)
  // Mas se armazena "9639,00" que vira "9639.00" -> pode estar errado
  
  // Heurística: se o valor tem muitos zeros à direita e é muito grande, pode estar em centavos
  // Valores de boleto típicos são < R$ 5.000,00
  // Se o valor é > 10.000 e parece ter 2 zeros decimais, dividir por 100
  const strParsed = parsed.toFixed(2);
  if (parsed >= 1000 && strParsed.endsWith('.00')) {
    // Verificar se o valor original tinha indicação de ser centavos
    // Se o valor termina em ,00 ou .00 no original e é muito alto
    if (parsed >= 10000 && (strValue.includes(',00') || strValue.includes('.00') || /\d{4,}$/.test(strValue.replace(/[^0-9]/g, '')))) {
      // Valor provavelmente está em centavos
      return parsed / 100;
    }
  }
  
  return parsed;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verificar secret do webhook (opcional, para segurança)
    const webhookSecret = req.headers.get('x-webhook-secret');
    const expectedSecret = Deno.env.get("COBRANCA_WEBHOOK_SECRET");
    
    if (expectedSecret && webhookSecret !== expectedSecret) {
      console.error("Webhook secret inválido");
      return new Response(
        JSON.stringify({ success: false, message: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { 
      corretora_id, 
      corretora_slug,
      dados,
      nome_arquivo,
      mes_referencia,
      modo,
      // Suporte a importação em lotes (chunks)
      importacao_id,
      total_registros,
      chunk_index,
      chunk_total,
      // Suporte a atualização de progresso
      execucao_id,
      update_progress,
      progresso_download,
      bytes_baixados,
      bytes_total,
      progresso_importacao,
      etapa_atual,
      // GitHub run info
      github_run_id,
      github_run_url,
      // Ação especial: start, error
      action,
      error_message,
    } = body;

    const githubRunIdStr = normalizeGithubRunId(github_run_id);
    const execucaoIdCandidate = isUuidString(execucao_id) ? execucao_id : null;

    // ============================================
    // Ação: Iniciar execução (para sincronizações automáticas)
    // ============================================
    if (action === 'start' && corretora_id) {
      console.log("Iniciando execução para corretora:", corretora_id);
      
      // Buscar config da corretora
      const { data: config, error: configError } = await supabase
        .from("cobranca_automacao_config")
        .select("id")
        .eq("corretora_id", corretora_id)
        .single();

      if (configError || !config) {
        console.error("Config não encontrada para corretora:", corretora_id);
        return new Response(
          JSON.stringify({ success: false, message: "Configuração não encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Evitar duplicidade quando o mesmo run notifica mais de uma vez
      if (githubRunIdStr) {
        const { data: existing } = await supabase
          .from("cobranca_automacao_execucoes")
          .select("id")
          .eq("config_id", config.id)
          .eq("github_run_id", githubRunIdStr)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing?.id) {
          await supabase
            .from("cobranca_automacao_execucoes")
            .update({ status: "executando", etapa_atual: "login" })
            .eq("id", existing.id);

          await supabase
            .from("cobranca_automacao_config")
            .update({
              ultimo_status: "executando",
              ultimo_erro: null,
              ultima_execucao: new Date().toISOString(),
            })
            .eq("id", config.id);

          return new Response(
            JSON.stringify({ success: true, execucao_id: existing.id }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Criar registro de execução
      const { data: execucao, error: execError } = await supabase
        .from("cobranca_automacao_execucoes")
        .insert({
          config_id: config.id,
          corretora_id: corretora_id,
          status: 'executando',
          etapa_atual: 'login',
          tipo_disparo: 'automatico',
          github_run_id: githubRunIdStr,
          github_run_url: github_run_url || null,
        })
        .select()
        .single();

      if (execError) {
        console.error("Erro ao criar execução:", execError);
        return new Response(
          JSON.stringify({ success: false, message: "Erro ao criar execução", error: execError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Atualizar config com status executando
      await supabase
        .from("cobranca_automacao_config")
        .update({
          ultimo_status: 'executando',
          ultimo_erro: null,
          ultima_execucao: new Date().toISOString(),
        })
        .eq("id", config.id);

      // Registrar no BI (início da execução automática)
      await supabase.from("bi_audit_logs").insert({
        modulo: "cobranca",
        acao: "execucao_automatica_iniciada",
        descricao: `Execução automática iniciada${githubRunIdStr ? ` (run ${githubRunIdStr})` : ""}`,
        corretora_id: corretora_id,
        user_id: SYSTEM_USER_ID,
        user_nome: "Sistema (Automação)",
        dados_novos: {
          execucao_id: execucao.id,
          github_run_id: githubRunIdStr,
          github_run_url: github_run_url || null,
        },
      });

      console.log("Execução criada:", execucao.id);
      return new Response(
        JSON.stringify({ success: true, execucao_id: execucao.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================
    // Ação: Registrar erro
    // ============================================
    if (action === 'error' && corretora_id) {
      console.log("Registrando erro para corretora:", corretora_id, error_message);
      
      // Buscar config da corretora
      const { data: config } = await supabase
        .from("cobranca_automacao_config")
        .select("id")
        .eq("corretora_id", corretora_id)
        .single();

      if (config) {
        // Atualizar config com erro
        await supabase
          .from("cobranca_automacao_config")
          .update({
            ultimo_status: 'erro',
            ultimo_erro: error_message || 'Erro desconhecido',
            ultima_execucao: new Date().toISOString(),
          })
          .eq("id", config.id);

        // Resolver execução alvo (UUID válido > github_run_id > última em andamento)
        let targetId: string | null = execucaoIdCandidate;

        if (!targetId && githubRunIdStr) {
          const { data: existingByRun } = await supabase
            .from("cobranca_automacao_execucoes")
            .select("id")
            .eq("config_id", config.id)
            .eq("github_run_id", githubRunIdStr)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          targetId = existingByRun?.id ?? null;
        }

        if (!targetId) {
          const { data: lastRunning } = await supabase
            .from("cobranca_automacao_execucoes")
            .select("id")
            .eq("config_id", config.id)
            .eq("status", "executando")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        targetId = lastRunning?.id ?? null;
        }

        // Limite máximo de retries para evitar loop infinito
        const MAX_RETRIES = 3;
        
        if (targetId) {
          // Buscar retry_count atual
          const { data: currentExec } = await supabase
            .from("cobranca_automacao_execucoes")
            .select("retry_count")
            .eq("id", targetId)
            .single();
          
          const newRetryCount = (currentExec?.retry_count || 0) + 1;
          
          // Só agenda retry se não ultrapassou o limite
          const proximaTentativa = newRetryCount < MAX_RETRIES 
            ? new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
            : null;
          
          await supabase
            .from("cobranca_automacao_execucoes")
            .update({
              status: "erro",
              erro: newRetryCount >= MAX_RETRIES 
                ? `${error_message || "Erro desconhecido"} (limite de ${MAX_RETRIES} tentativas atingido - retry automático desabilitado)`
                : (error_message || "Erro desconhecido"),
              finalizado_at: new Date().toISOString(),
              etapa_atual: "erro",
              github_run_id: githubRunIdStr,
              github_run_url: github_run_url || null,
              retry_count: newRetryCount,
              proxima_tentativa_at: proximaTentativa,
            })
            .eq("id", targetId);
            
          if (proximaTentativa) {
            console.log(`[Webhook] Retry agendado para ${proximaTentativa} (tentativa ${newRetryCount}/${MAX_RETRIES})`);
          } else {
            console.log(`[Webhook] Limite de retries atingido (${newRetryCount}/${MAX_RETRIES}) - não será feita nova tentativa automática`);
          }
        } else {
          // Primeiro erro - agendar retry
          const proximaTentativa = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
          
          await supabase
            .from("cobranca_automacao_execucoes")
            .insert({
              config_id: config.id,
              corretora_id: corretora_id,
              status: "erro",
              erro: error_message || "Erro desconhecido",
              finalizado_at: new Date().toISOString(),
              etapa_atual: "erro",
              tipo_disparo: "automatico",
              github_run_id: githubRunIdStr,
              github_run_url: github_run_url || null,
              retry_count: 1,
              proxima_tentativa_at: proximaTentativa,
            });
            
          console.log(`[Webhook] Retry agendado para ${proximaTentativa} (nova execução com erro, tentativa 1/${MAX_RETRIES})`);
        }

        // Registrar no BI (erro)
        await supabase.from("bi_audit_logs").insert({
          modulo: "cobranca",
          acao: "execucao_automatica_erro",
          descricao: `Execução automática com erro${githubRunIdStr ? ` (run ${githubRunIdStr})` : ""}: ${error_message || "Erro desconhecido"}`,
          corretora_id: corretora_id,
          user_id: SYSTEM_USER_ID,
          user_nome: "Sistema (Automação)",
          dados_novos: {
            github_run_id: githubRunIdStr,
            github_run_url: github_run_url || null,
            erro: error_message || null,
          },
        });
      }

      return new Response(
        JSON.stringify({ success: true, message: "Erro registrado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================
    // Atualização de progresso (sem inserção de dados)
    // ============================================
    if (update_progress) {
      let targetId: string | null = execucaoIdCandidate;

      // Fallback para github_run_id/corretora_id quando EXECUCAO_ID vem vazio/ inválido
      if (!targetId && corretora_id) {
        const { data: config } = await supabase
          .from("cobranca_automacao_config")
          .select("id")
          .eq("corretora_id", corretora_id)
          .maybeSingle();

        if (config?.id && githubRunIdStr) {
          const { data: existingByRun } = await supabase
            .from("cobranca_automacao_execucoes")
            .select("id")
            .eq("config_id", config.id)
            .eq("github_run_id", githubRunIdStr)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          targetId = existingByRun?.id ?? null;
        }

        if (!targetId && config?.id) {
          const { data: lastRunning } = await supabase
            .from("cobranca_automacao_execucoes")
            .select("id")
            .eq("config_id", config.id)
            .eq("status", "executando")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          targetId = lastRunning?.id ?? null;
        }

        if (!targetId && config?.id) {
          const { data: created } = await supabase
            .from("cobranca_automacao_execucoes")
            .insert({
              config_id: config.id,
              corretora_id: corretora_id,
              status: "executando",
              etapa_atual: etapa_atual || "progresso",
              tipo_disparo: "automatico",
              github_run_id: githubRunIdStr,
              github_run_url: github_run_url || null,
            })
            .select("id")
            .single();
          targetId = created?.id ?? null;
        }
      }

      if (!targetId) {
        return new Response(
          JSON.stringify({ success: false, message: "Não foi possível identificar a execução para atualizar o progresso" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const updateData: Record<string, unknown> = {};
      
      if (progresso_download !== undefined) updateData.progresso_download = progresso_download;
      if (bytes_baixados !== undefined) updateData.bytes_baixados = bytes_baixados;
      if (bytes_total !== undefined) updateData.bytes_total = bytes_total;
      if (progresso_importacao !== undefined) updateData.progresso_importacao = progresso_importacao;
      if (etapa_atual !== undefined) updateData.etapa_atual = etapa_atual;
      if (total_registros !== undefined) updateData.registros_total = total_registros;
      if (github_run_id !== undefined) updateData.github_run_id = github_run_id;
      if (github_run_url !== undefined) updateData.github_run_url = github_run_url;
      
      const { error: updateError } = await supabase
        .from("cobranca_automacao_execucoes")
        .update(updateData)
        .eq("id", targetId);
      
      if (updateError) {
        console.error("Erro ao atualizar progresso:", updateError);
        return new Response(
          JSON.stringify({ success: false, message: "Erro ao atualizar progresso", error: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: true, message: "Progresso atualizado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Webhook cobrança recebido:", {
      corretora_id,
      corretora_slug,
      totalRegistros: dados?.length,
      nome_arquivo,
      mes_referencia
    });

    // Buscar corretora por ID ou slug
    let corretoraId = corretora_id;
    
    if (!corretoraId && corretora_slug) {
      const { data: corretora, error: corrError } = await supabase
        .from("corretoras")
        .select("id")
        .eq("slug", corretora_slug)
        .single();
      
      if (corrError || !corretora) {
        return new Response(
          JSON.stringify({ success: false, message: "Corretora não encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      corretoraId = corretora.id;
    }

    if (!corretoraId) {
      return new Response(
        JSON.stringify({ success: false, message: "corretora_id ou corretora_slug é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!dados || !Array.isArray(dados) || dados.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: "Dados não fornecidos ou vazios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================
    // Resolver/garantir execução (para aparecer no histórico mesmo em automáticos)
    // ============================================
    const { data: configExec } = await supabase
      .from("cobranca_automacao_config")
      .select("id")
      .eq("corretora_id", corretoraId)
      .maybeSingle();

    const configId = configExec?.id ?? null;
    let targetExecucaoId: string | null = execucaoIdCandidate;

    if (!targetExecucaoId && configId && githubRunIdStr) {
      const { data: existingByRun } = await supabase
        .from("cobranca_automacao_execucoes")
        .select("id")
        .eq("config_id", configId)
        .eq("github_run_id", githubRunIdStr)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      targetExecucaoId = existingByRun?.id ?? null;
    }

    if (!targetExecucaoId && configId) {
      const { data: lastRunning } = await supabase
        .from("cobranca_automacao_execucoes")
        .select("id")
        .eq("config_id", configId)
        .eq("status", "executando")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      targetExecucaoId = lastRunning?.id ?? null;
    }

    if (!targetExecucaoId && configId) {
      const { data: created, error: createExecError } = await supabase
        .from("cobranca_automacao_execucoes")
        .insert({
          config_id: configId,
          corretora_id: corretoraId,
          status: "executando",
          etapa_atual: "importacao",
          tipo_disparo: "automatico",
          github_run_id: githubRunIdStr,
          github_run_url: github_run_url || null,
        })
        .select("id")
        .single();

      if (createExecError) {
        console.error("Erro ao criar execução automática (fallback):", createExecError);
      }
      targetExecucaoId = created?.id ?? null;
    }

    // ============================================
    // Importação: modo único (payload completo) OU modo chunks (lotes)
    // ============================================
    const nomeArquivo = nome_arquivo || `Hinova_Auto_${new Date().toISOString().split('T')[0]}.json`;

    let importacao: any = null;

    if (importacao_id) {
      // Reutilizar importação existente (chunk mode)
      const { data: existing, error: exErr } = await supabase
        .from("cobranca_importacoes")
        .select("*")
        .eq("id", importacao_id)
        .single();

      if (exErr || !existing) {
        return new Response(
          JSON.stringify({ success: false, message: "importacao_id inválido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Garantir que pertence à corretora (segurança)
      if (existing.corretora_id !== corretoraId) {
        return new Response(
          JSON.stringify({ success: false, message: "importacao_id não pertence à corretora" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      importacao = existing;

      // Opcional: atualizar total_registros se veio no chunk
      if (typeof total_registros === 'number' && total_registros > 0 && importacao.total_registros !== total_registros) {
        await supabase
          .from("cobranca_importacoes")
          .update({ total_registros })
          .eq("id", importacao.id);
      }
    } else if (modo === 'atualizar_anterior' && mes_referencia && corretoraId) {
      // Modo atualizar_anterior: buscar importação existente do mês anterior e atualizar seus boletos
      console.log(`[Webhook] Modo atualizar_anterior para mês ${mes_referencia}`);
      
      // Buscar importação existente desse mês de referência
      const { data: existingImports } = await supabase
        .from("cobranca_importacoes")
        .select("*")
        .eq("corretora_id", corretoraId)
        .like("nome_arquivo", `%${mes_referencia}%`)
        .order("created_at", { ascending: false })
        .limit(5);
      
      // Também buscar por nome_arquivo do mês
      let targetImport = existingImports?.[0] || null;
      
      if (!targetImport) {
        // Fallback: buscar qualquer importação inativa mais recente que não seja a ativa
        const { data: inactiveImports } = await supabase
          .from("cobranca_importacoes")
          .select("*")
          .eq("corretora_id", corretoraId)
          .eq("ativo", false)
          .order("created_at", { ascending: false })
          .limit(1);
        targetImport = inactiveImports?.[0] || null;
      }
      
      if (targetImport) {
        // Deletar boletos existentes dessa importação
        const { error: deleteError } = await supabase
          .from("cobranca_boletos")
          .delete()
          .eq("importacao_id", targetImport.id);
        
        if (deleteError) {
          console.error("[Webhook] Erro ao deletar boletos antigos:", deleteError);
        } else {
          console.log(`[Webhook] Boletos antigos deletados da importação ${targetImport.id}`);
        }
        
        // Atualizar metadados da importação
        await supabase
          .from("cobranca_importacoes")
          .update({
            nome_arquivo: nomeArquivo,
            total_registros: dados.length,
            ativo: false, // Manter inativa (a do mês atual é a ativa)
            updated_at: new Date().toISOString(),
          })
          .eq("id", targetImport.id);
        
        importacao = targetImport;
        console.log(`[Webhook] Reutilizando importação ${targetImport.id} para atualização do mês anterior`);
      } else {
        // Não existe importação anterior, criar uma nova inativa
        const totalReg = (typeof total_registros === 'number' && total_registros > 0)
          ? total_registros
          : dados.length;

        const { data: created, error: importError } = await supabase
          .from("cobranca_importacoes")
          .insert({
            corretora_id: corretoraId,
            nome_arquivo: nomeArquivo,
            ativo: false, // Inativa - é o mês anterior
            total_registros: totalReg,
          })
          .select()
          .single();

        if (importError) {
          console.error("Erro ao criar importação (mês anterior):", importError);
          return new Response(
            JSON.stringify({ success: false, message: "Erro ao criar importação", error: importError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        importacao = created;
        console.log("[Webhook] Importação criada para mês anterior:", importacao.id);
      }
    } else {
      // Modo tradicional (substituir): desativar importações anteriores e criar uma nova
      await supabase
        .from("cobranca_importacoes")
        .update({ ativo: false })
        .eq("ativo", true)
        .eq("corretora_id", corretoraId);

      const totalReg = (typeof total_registros === 'number' && total_registros > 0)
        ? total_registros
        : dados.length;

      const { data: created, error: importError } = await supabase
        .from("cobranca_importacoes")
        .insert({
          corretora_id: corretoraId,
          nome_arquivo: nomeArquivo,
          ativo: true,
          total_registros: totalReg,
        })
        .select()
        .single();

      if (importError) {
        console.error("Erro ao criar importação:", importError);
        return new Response(
          JSON.stringify({ success: false, message: "Erro ao criar importação", error: importError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      importacao = created;
      console.log("Importação criada:", importacao.id);
    }

    // ============================================
    // Processar dados em lotes (inserção no banco)
    // ============================================
    const BATCH_SIZE = 100;
    let processados = 0;
    let erros = 0;

    // Data de referência para cálculo de atraso
    const hojeStr = getTodayInSaoPaulo(); // YYYY-MM-DD em São Paulo

    // 1) Processar TODAS as linhas primeiro (precisamos da visão completa para deduplicar)
    const allBoletos: any[] = dados.map((row: any) => {
        const boleto: any = {
          importacao_id: importacao.id,
        };

        // Mapear campos primários
        for (const [key, value] of Object.entries(row)) {
          const normalizedKey = normalizeColumnKey(key);
          const dbField = COLUMN_MAP[normalizedKey];

          if (dbField) {
            if (["data_pagamento", "data_vencimento_original", "data_vencimento"].includes(dbField)) {
              boleto[dbField] = parseDate(value);
            } else if (dbField === 'valor') {
              boleto[dbField] = parseMoneyValue(value);
            } else if (dbField === 'dia_vencimento_veiculo') {
              // Aceita qualquer dia válido (1-31) - pegar apenas primeiros 2 dígitos para evitar concatenação
              const dayStr = String(value).trim();
              const dayMatch = dayStr.match(/^\d{1,2}/);
              if (dayMatch) {
                const day = parseInt(dayMatch[0], 10);
                boleto[dbField] = (day >= 1 && day <= 31) ? day : null;
              } else {
                boleto[dbField] = null;
              }
            } else if (dbField === 'qtde_dias_atraso_vencimento_original') {
              boleto[dbField] = parseInt(String(value).replace(/\D/g, ''), 10) || null;
            } else {
              boleto[dbField] = value ? String(value).trim() : null;
            }
          }
        }

        // ============================================
        // FALLBACK: Derivar campos críticos quando vazios
        // ============================================

        // Dia Vencimento Veículo deve vir da coluna específica do relatório.
        // Não derivar de data_vencimento para evitar introduzir dias indevidos (ex: 12, 18, 23, 24).

        // Se tem data de pagamento, o boleto foi pago - dias de atraso = 0
        if (boleto.data_pagamento) {
          boleto.qtde_dias_atraso_vencimento_original = 0;
        } else if (boleto.qtde_dias_atraso_vencimento_original == null && boleto.data_vencimento_original) {
          // Dias de atraso = hoje - data_vencimento_original (>=0)
          const dvo = String(boleto.data_vencimento_original);
          const dtVencOrig = new Date(dvo + 'T00:00:00');
          const dtHoje = new Date(hojeStr + 'T00:00:00');
          if (!isNaN(dtVencOrig.getTime())) {
            const diffMs = dtHoje.getTime() - dtVencOrig.getTime();
            const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            boleto.qtde_dias_atraso_vencimento_original = diffDias >= 0 ? diffDias : 0;
          }
        }

        // Dados extras (campos não mapeados)
        const dadosExtras: any = {};
        for (const [key, value] of Object.entries(row)) {
          const normalizedKey = normalizeColumnKey(key);
          if (!COLUMN_MAP[normalizedKey] && value) {
            dadosExtras[key] = value;
          }
        }
        if (Object.keys(dadosExtras).length > 0) {
          boleto.dados_extras = dadosExtras;
        }

        return boleto;
      });

    // 2) Aplicar dedup fiel ao SGA
    const boletosFiel = dedupSGAFielServer(allBoletos);
    const removidosDedup = allBoletos.length - boletosFiel.length;
    console.log(`[Webhook Cobranca] ${allBoletos.length} brutos → ${boletosFiel.length} após dedup SGA (${removidosDedup} removidos)`);

    // 3) Inserir em batches
    for (let i = 0; i < boletosFiel.length; i += BATCH_SIZE) {
      const boletosBatch = boletosFiel.slice(i, i + BATCH_SIZE);
      const { error: batchError } = await supabase
        .from("cobranca_boletos")
        .insert(boletosBatch);

      if (batchError) {
        console.error(`Erro no lote ${i / BATCH_SIZE + 1}:`, batchError);
        erros += boletosBatch.length;
      } else {
        processados += boletosBatch.length;
      }

      // Atualizar progresso se temos execução resolvida
      if (targetExecucaoId && dados.length > 0) {
        // Buscar registros já processados de chunks anteriores
        const { data: currentExec } = await supabase
          .from("cobranca_automacao_execucoes")
          .select("registros_processados")
          .eq("id", targetExecucaoId)
          .single();
        
        const baseProcessados = currentExec?.registros_processados || 0;
        // Se estamos no mesmo chunk (baseProcessados não mudou desde o início), usar processados
        // Caso contrário, acumular
        const totalProcessadosAgora = baseProcessados + processados;
        
        // Usar total_registros do payload para calcular progresso global
        const totalGeral = (typeof total_registros === 'number' && total_registros > 0) 
          ? total_registros 
          : dados.length;
        
        const progressoImportacao = Math.round((totalProcessadosAgora / totalGeral) * 100);
        await supabase
          .from("cobranca_automacao_execucoes")
          .update({
            progresso_importacao: progressoImportacao,
            registros_processados: totalProcessadosAgora,
            registros_total: totalGeral,
            etapa_atual: 'importacao',
          })
          .eq("id", targetExecucaoId);
      }
    }

    // ============================================
    // Atualizar status de sucesso na config e execução
    // ============================================
    
    if (configId) {
      // Atualizar config com status de sucesso
      await supabase
        .from("cobranca_automacao_config")
        .update({
          ultimo_status: 'sucesso',
          ultimo_erro: null,
          ultima_execucao: new Date().toISOString(),
        })
        .eq("id", configId);

      // Atualizar execução mais recente com sucesso
      if (targetExecucaoId) {
        // Primeiro, pegar registros já processados anteriormente (para modo chunk)
        const { data: currentExec } = await supabase
          .from("cobranca_automacao_execucoes")
          .select("registros_processados")
          .eq("id", targetExecucaoId)
          .single();
        
        const previousProcessados = currentExec?.registros_processados || 0;
        const totalProcessados = previousProcessados + processados;
        
        // total_registros do payload tem o valor correto (total global)
        const totalGeral = (typeof total_registros === 'number' && total_registros > 0) 
          ? total_registros 
          : totalProcessados;
        
        // Verificar se é o último chunk
        const isLastChunk = !chunk_total || !chunk_index || chunk_index >= chunk_total;
        
        await supabase
          .from("cobranca_automacao_execucoes")
          .update({
            status: isLastChunk ? 'sucesso' : 'executando',
            erro: null,
            finalizado_at: isLastChunk ? new Date().toISOString() : null,
            registros_processados: totalProcessados,
            registros_total: totalGeral,
            nome_arquivo: nomeArquivo,
            progresso_download: 100,
            progresso_importacao: isLastChunk ? 100 : Math.round((totalProcessados / totalGeral) * 100),
            etapa_atual: isLastChunk ? 'concluido' : 'importacao',
          })
          .eq("id", targetExecucaoId);
      } else {
        // Se não veio execucao_id (comum em agendamentos), tentamos fechar a última execução em andamento.
        // Se não existir, criamos um registro de histórico para não perder o log.
        const { data: lastRunning } = await supabase
          .from("cobranca_automacao_execucoes")
          .select("id, registros_processados")
          .eq("config_id", configId)
          .eq("status", "executando")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const previousProcessados = lastRunning?.registros_processados || 0;
        const totalProcessados = previousProcessados + processados;
        const totalGeral = (typeof total_registros === 'number' && total_registros > 0) 
          ? total_registros 
          : totalProcessados;
        const isLastChunk = !chunk_total || !chunk_index || chunk_index >= chunk_total;

        if (lastRunning?.id) {
          await supabase
            .from("cobranca_automacao_execucoes")
            .update({
              status: isLastChunk ? 'sucesso' : 'executando',
              erro: null,
              finalizado_at: isLastChunk ? new Date().toISOString() : null,
              registros_processados: totalProcessados,
              registros_total: totalGeral,
              nome_arquivo: nomeArquivo,
              progresso_download: 100,
              progresso_importacao: isLastChunk ? 100 : Math.round((totalProcessados / totalGeral) * 100),
              etapa_atual: isLastChunk ? 'concluido' : 'importacao',
              github_run_id: githubRunIdStr,
              github_run_url: github_run_url || null,
            })
            .eq("id", lastRunning.id);
        } else if (isLastChunk) {
          // Só cria novo registro se for o último chunk
          await supabase
            .from("cobranca_automacao_execucoes")
            .insert({
              config_id: configId,
              corretora_id: corretoraId,
              status: 'sucesso',
              erro: null,
              finalizado_at: new Date().toISOString(),
              registros_processados: totalProcessados,
              registros_total: totalGeral,
              nome_arquivo: nomeArquivo,
              progresso_download: 100,
              progresso_importacao: 100,
              etapa_atual: 'concluido',
              tipo_disparo: 'automatico',
              github_run_id: githubRunIdStr,
              github_run_url: github_run_url || null,
            });
        }
      }
    }

    // Limpar execuções anteriores com erro/parado (manter apenas sucesso e executando)
    if (configId) {
      const successExecId = targetExecucaoId;
      if (successExecId) {
        const { error: cleanupError } = await supabase
          .from("cobranca_automacao_execucoes")
          .delete()
          .eq("config_id", configId)
          .in("status", ["erro", "parado", "cancelled"])
          .neq("id", successExecId);
        
        if (cleanupError) {
          console.warn("Erro ao limpar execuções antigas:", cleanupError);
        } else {
          console.log("Execuções com erro/parado anteriores removidas");
        }
      }
    }

    // Registrar log de auditoria
    const modoDescricao = modo === 'atualizar_anterior' ? ' (atualização mês anterior)' : '';
    await supabase.from("bi_audit_logs").insert({
      modulo: "cobranca",
      acao: modo === 'atualizar_anterior' ? "atualizacao_mes_anterior" : "importacao_automatica",
      descricao: `Importação automática via webhook${modoDescricao}: ${nomeArquivo} - ${processados} registros`,
      corretora_id: corretoraId,
        user_id: SYSTEM_USER_ID,
      user_nome: "Sistema (Webhook)",
      dados_novos: {
        importacao_id: importacao.id,
        total_registros: dados.length,
        processados,
        erros,
        mes_referencia,
        modo: modo || 'substituir',
      },
    });

    // ============================================
    // Auto-send WhatsApp report after successful import
    // ============================================
    const isLastChunkFinal = !chunk_total || !chunk_index || chunk_index >= chunk_total;
    if (isLastChunkFinal) {
      // Determine if today is a valid day for this association's WhatsApp dispatch
      const spNow = new Date(Date.now() - 3 * 60 * 60 * 1000); // UTC-3
      const currentDayOfWeek = spNow.getUTCDay(); // 0=Dom, 1=Seg, ..., 6=Sáb
      const diaDoMes = spNow.getUTCDate();
      
      // Check dias_agendados from hinova_credenciais
      let hojeDiaPermitido = true;
      const { data: credRow } = await supabase
        .from("hinova_credenciais")
        .select("dias_agendados")
        .eq("corretora_id", corretoraId)
        .maybeSingle();
      
      if (credRow?.dias_agendados && Array.isArray(credRow.dias_agendados) && credRow.dias_agendados.length > 0) {
        hojeDiaPermitido = credRow.dias_agendados.includes(currentDayOfWeek);
      }
      
      // Se modo é atualizar_anterior, o WhatsApp só deve disparar se:
      // - dia <= 6 (estamos no início do mês)
      // - E o dia é permitido para essa associação
      // Se modo é substituir (mês atual), o WhatsApp dispara normalmente se dia >= 7 e dia permitido
      // Nos dias 1-6, quem envia é o modo atualizar_anterior
      
      let deveEnviarWhatsApp = false;
      
      if (modo === 'atualizar_anterior') {
        // Mês anterior: enviar apenas até dia 6 e se dia é permitido
        if (diaDoMes <= 6 && hojeDiaPermitido) {
          deveEnviarWhatsApp = true;
          console.log(`[Webhook Cobrança] Dia ${diaDoMes} <= 6, enviando relatório do mês anterior via WhatsApp`);
        } else if (diaDoMes <= 6 && !hojeDiaPermitido) {
          console.log(`[Webhook Cobrança] Dia ${diaDoMes} <= 6 mas dia da semana ${currentDayOfWeek} não é permitido para esta associação, pulando WhatsApp`);
        }
      } else {
        // Mês atual (substituir): enviar apenas a partir do dia 7 e se dia é permitido
        if (diaDoMes >= 7 && hojeDiaPermitido) {
          deveEnviarWhatsApp = true;
          console.log(`[Webhook Cobrança] Dia ${diaDoMes} >= 7, enviando relatório do mês atual via WhatsApp`);
        } else if (diaDoMes < 7) {
          console.log(`[Webhook Cobrança] Dia ${diaDoMes} < 7, mês atual será enviado a partir do dia 7 (mês anterior está sendo enviado)`);
        } else if (!hojeDiaPermitido) {
          console.log(`[Webhook Cobrança] Dia da semana ${currentDayOfWeek} não é permitido para esta associação, pulando WhatsApp`);
        }
      }
      
      if (deveEnviarWhatsApp) {
        try {
          const { data: waConfig } = await supabase
            .from("whatsapp_config")
            .select("*")
            .eq("corretora_id", corretoraId)
            .eq("ativo", true)
            .maybeSingle();

          if (waConfig?.envio_automatico_cobranca) {
            console.log("[Webhook Cobrança] Envio automático de WhatsApp ativado, disparando...");
            
            // Determinar qual mês de referência usar para o relatório
            const mesRefParaRelatorio = modo === 'atualizar_anterior' ? mes_referencia : undefined;
            
            const fluxoId = (waConfig as any).fluxo_cobranca_id;
            const phoneNumbers = (waConfig.telefone_whatsapp || "").split(",").map((p: string) => p.trim()).filter(Boolean);
            const metaToken = Deno.env.get("META_WHATSAPP_TOKEN");
            const metaPhoneNumberId = Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID");

            if (fluxoId && phoneNumbers.length > 0) {
              // Trigger saved flow for each phone number
              for (const phone of phoneNumbers) {
                const cleanPhone = phone.replace(/\D/g, "");
                const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
                try {
                  await supabase.functions.invoke("whatsapp-flow-engine", {
                    body: { contact_phone: formattedPhone, flow_id: fluxoId, trigger: "auto_import", mes_referencia: mesRefParaRelatorio },
                  });
                  console.log(`[Webhook Cobrança] Flow disparado para ${formattedPhone}`);
                } catch (flowErr) {
                  console.error(`[Webhook Cobrança] Erro ao disparar flow para ${formattedPhone}:`, flowErr);
                }
              }
              await supabase.from("whatsapp_config").update({
                ultimo_envio_automatico: new Date().toISOString(),
                ultimo_erro_envio: null,
              }).eq("id", waConfig.id);
            } else if (metaToken && metaPhoneNumberId && phoneNumbers.length > 0) {
              // Fallback: direct report send (legacy behavior)
              const { data: resumoData } = await supabase.functions.invoke("gerar-resumo-cobranca", {
                body: { corretora_id: corretoraId, mes_referencia: mesRefParaRelatorio },
              });
              const messageContent = resumoData?.resumo || "Resumo de cobrança não disponível";

              for (const phone of phoneNumbers) {
                const cleanPhone = phone.replace(/\D/g, "");
                const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
                try {
                  const metaResponse = await fetch(
                    `https://graph.facebook.com/v22.0/${metaPhoneNumberId}/messages`,
                    {
                      method: "POST",
                      headers: { Authorization: `Bearer ${metaToken}`, "Content-Type": "application/json" },
                      body: JSON.stringify({ messaging_product: "whatsapp", to: formattedPhone, type: "text", text: { preview_url: false, body: messageContent } }),
                    }
                  );
                  const metaData = await metaResponse.json();
                  const metaMessageId = metaData?.messages?.[0]?.id || null;

                  await supabase.from("whatsapp_historico").insert({
                    corretora_id: corretoraId, telefone_destino: formattedPhone, mensagem: messageContent,
                    tipo: "cobranca", status: metaResponse.ok ? "enviado" : "erro",
                    status_entrega: metaResponse.ok ? "enviado" : "erro", meta_message_id: metaMessageId,
                    enviado_em: new Date().toISOString(), enviado_por: null,
                  });

                  const { data: waContact } = await supabase.from("whatsapp_contacts").select("id").eq("phone", formattedPhone).maybeSingle();
                  if (waContact) {
                    await supabase.from("whatsapp_messages").insert({ contact_id: waContact.id, direction: "out", body: messageContent, type: "text", status: metaResponse.ok ? "sent" : "failed", meta_message_id: metaMessageId, sent_by: null });
                    await supabase.from("whatsapp_contacts").update({ last_message_at: new Date().toISOString(), last_message_preview: messageContent.substring(0, 100) }).eq("id", waContact.id);
                  }
                  console.log(`[Webhook Cobrança] WhatsApp enviado para ${formattedPhone}: ${metaResponse.ok ? "sucesso" : "erro"}`);
                } catch (sendErr) {
                  console.error(`[Webhook Cobrança] Erro ao enviar WhatsApp para ${formattedPhone}:`, sendErr);
                }
              }
              await supabase.from("whatsapp_config").update({ ultimo_envio_automatico: new Date().toISOString(), ultimo_erro_envio: null }).eq("id", waConfig.id);
            }
          }
        } catch (waError) {
          console.error("[Webhook Cobrança] Erro no envio automático WhatsApp:", waError);
        }
      }
    }

    console.log(`Importação concluída: ${processados} processados, ${erros} erros`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Importação concluída com sucesso: ${processados} registros`,
        importacao_id: importacao.id,
        total: typeof total_registros === 'number' && total_registros > 0 ? total_registros : dados.length,
        processados,
        erros,
        chunk_index: chunk_index || null,
        chunk_total: chunk_total || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Erro no webhook:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
