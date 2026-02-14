import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

function normalizeGithubRunId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function isUuidString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// Parse de data no formato DD/MM/YYYY ou YYYY-MM-DD
function parseDate(value: unknown): string | null {
  if (!value) return null;
  
  const strValue = String(value).trim();
  
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(strValue)) {
    const [day, month, year] = strValue.split('/');
    return `${year}-${month}-${day}`;
  }
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(strValue)) {
    return strValue;
  }
  
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(strValue)) {
    const parts = strValue.split('/');
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    let year = parts[2];
    if (year.length === 2) {
      year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
    }
    return `${year}-${month}-${day}`;
  }
  
  return null;
}

// Parse de valor monetário
function parseMoneyValue(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  
  let strValue = String(value).trim();
  strValue = strValue.replace(/R\$\s*/gi, '').trim();
  
  if (!/[.,]/.test(strValue)) {
    const parsed = parseFloat(strValue);
    return isNaN(parsed) ? 0 : parsed;
  }
  
  const lastComma = strValue.lastIndexOf(',');
  const lastDot = strValue.lastIndexOf('.');
  
  if (lastComma > lastDot) {
    strValue = strValue.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    strValue = strValue.replace(/,/g, '');
  }
  
  const parsed = parseFloat(strValue);
  return isNaN(parsed) ? 0 : parsed;
}

// Mapeamento de colunas
const COLUMN_MAP: { [key: string]: string } = {
  "OPERACAO": "operacao",
  "OPERAÇÃO": "operacao",
  "SUBOPERACAO": "sub_operacao",
  "SUBOPERAÇÃO": "sub_operacao",
  "SUB OPERACAO": "sub_operacao",
  "SUB OPERAÇÃO": "sub_operacao",
  "DESCRICAO": "descricao",
  "DESCRIÇÃO": "descricao",
  "NOTA FISCAL": "nota_fiscal",
  "VALOR": "valor",
  "VALOR TOTAL LANCAMENTO": "valor_total_lancamento",
  "VALOR TOTAL LANÇAMENTO": "valor_total_lancamento",
  "VALOR PAGAMENTO": "valor_pagamento",
  "DATA NOTA FISCAL": "data_nota_fiscal",
  "DATA VENCIMENTO": "data_vencimento",
  "SITUACAO": "situacao_pagamento",
  "SITUAÇÃO": "situacao_pagamento",
  "QUANTIDADE PARCELA": "quantidade_parcela",
  "FORMA PAGAMENTO": "forma_pagamento",
  "DATA VENCIMENTO ORIGINAL": "data_vencimento_original",
  "DATA PAGAMENTO": "data_pagamento",
  "CONTROLE INTERNO": "controle_interno",
  "VEICULO LANCAMENTO": "veiculo_lancamento",
  "VEÍCULO LANÇAMENTO": "veiculo_lancamento",
  "TIPO DE VEICULO": "tipo_veiculo",
  "TIPO DE VEÍCULO": "tipo_veiculo",
  "CLASSIFICACAO VEICULO LANCAMENTO": "classificacao_veiculo",
  "CLASSIFICAÇÃO VEÍCULO LANÇAMENTO": "classificacao_veiculo",
  "ASSOCIADO": "associado",
  "CNPJ FORNECEDOR": "cnpj_fornecedor",
  "CPF/CNPJ CLIENTE": "cpf_cnpj_cliente",
  "CPF CNPJ CLIENTE": "cpf_cnpj_cliente",
  "FORNECEDOR": "fornecedor",
  "NOME FANTASIA FORNECEDOR": "nome_fantasia_fornecedor",
  "VOLUNTARIO": "voluntario",
  "VOLUNTÁRIO": "voluntario",
  "COOPERATIVA": "cooperativa",
  "CENTRO DE CUSTO/DEPARTAMENTO": "centro_custo",
  "CENTRO DE CUSTO DEPARTAMENTO": "centro_custo",
  "MULTA": "multa",
  "JUROS": "juros",
  "MES REFERENTE": "mes_referente",
  "MÊS REFERENTE": "mes_referente",
  "REGIONAL": "regional",
  "CATEGORIA VEICULO": "categoria_veiculo",
  "CATEGORIA VEÍCULO": "categoria_veiculo",
  "IMPOSTOS": "impostos",
  "PROTOCOLO EVENTO": "protocolo_evento",
  "VEICULO EVENTO": "veiculo_evento",
  "VEÍCULO EVENTO": "veiculo_evento",
  "MOTIVO EVENTO": "motivo_evento",
  "TERCEIRO (EVENTO)": "terceiro_evento",
  "TERCEIRO EVENTO": "terceiro_evento",
  "DATA EVENTO": "data_evento",
  "REGIONAL EVENTO": "regional_evento",
  "PLACA TERCEIRO (EVENTO)": "placa_terceiro_evento",
  "PLACA TERCEIRO EVENTO": "placa_terceiro_evento",
};

const DATE_FIELDS = ["data_nota_fiscal", "data_vencimento", "data_vencimento_original", "data_pagamento", "data_evento"];
const MONEY_FIELDS = ["valor", "valor_total_lancamento", "valor_pagamento", "multa", "juros", "impostos"];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { 
      corretora_id, 
      dados,
      nome_arquivo,
      total_registros,
      chunk_index,
      chunk_total,
      execucao_id,
      update_progress,
      progresso_download,
      progresso_importacao,
      etapa_atual,
      status,
      registros_processados,
      github_run_id,
      github_run_url,
      action,
      error_message,
    } = body;

    const githubRunIdStr = normalizeGithubRunId(github_run_id);
    const execucaoIdCandidate = isUuidString(execucao_id) ? execucao_id : null;

    // ============================================
    // Ação: Iniciar execução
    // ============================================
    if (action === 'start' && corretora_id) {
      console.log("MGF: Iniciando execução para corretora:", corretora_id);
      
      const { data: config } = await supabase
        .from("mgf_automacao_config")
        .select("id")
        .eq("corretora_id", corretora_id)
        .single();

      if (!config) {
        return new Response(
          JSON.stringify({ success: false, message: "Configuração não encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Evitar duplicidade
      if (githubRunIdStr) {
        const { data: existing } = await supabase
          .from("mgf_automacao_execucoes")
          .select("id")
          .eq("config_id", config.id)
          .eq("github_run_id", githubRunIdStr)
          .limit(1)
          .maybeSingle();

        if (existing?.id) {
          await supabase
            .from("mgf_automacao_execucoes")
            .update({ status: "executando", etapa_atual: "login" })
            .eq("id", existing.id);

          return new Response(
            JSON.stringify({ success: true, execucao_id: existing.id }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const { data: execucao, error: execError } = await supabase
        .from("mgf_automacao_execucoes")
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
        return new Response(
          JSON.stringify({ success: false, message: "Erro ao criar execução" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabase
        .from("mgf_automacao_config")
        .update({
          ultimo_status: 'executando',
          ultimo_erro: null,
          ultima_execucao: new Date().toISOString(),
        })
        .eq("id", config.id);

      return new Response(
        JSON.stringify({ success: true, execucao_id: execucao.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================
    // Ação: Registrar erro
    // ============================================
    if (action === 'error' && corretora_id) {
      console.log("MGF: Registrando erro:", error_message);
      
      const { data: config } = await supabase
        .from("mgf_automacao_config")
        .select("id")
        .eq("corretora_id", corretora_id)
        .single();

      if (config) {
        await supabase
          .from("mgf_automacao_config")
          .update({
            ultimo_status: 'erro',
            ultimo_erro: error_message || 'Erro desconhecido',
            ultima_execucao: new Date().toISOString(),
          })
          .eq("id", config.id);

        // Atualizar execução
        let targetId = execucaoIdCandidate;
        if (!targetId && githubRunIdStr) {
          const { data: existingByRun } = await supabase
            .from("mgf_automacao_execucoes")
            .select("id")
            .eq("config_id", config.id)
            .eq("github_run_id", githubRunIdStr)
            .limit(1)
            .maybeSingle();
          targetId = existingByRun?.id ?? null;
        }

        // Limite máximo de retries para evitar loop infinito
        const MAX_RETRIES = 3;
        
        if (targetId) {
          // Buscar retry_count atual
          const { data: currentExec } = await supabase
            .from("mgf_automacao_execucoes")
            .select("retry_count")
            .eq("id", targetId)
            .single();
          
          const newRetryCount = (currentExec?.retry_count || 0) + 1;
          
          // Só agenda retry se não ultrapassou o limite
          const proximaTentativa = newRetryCount < MAX_RETRIES 
            ? new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
            : null;
          
          await supabase
            .from("mgf_automacao_execucoes")
            .update({
              status: "erro",
              erro: newRetryCount >= MAX_RETRIES 
                ? `${error_message || "Erro desconhecido"} (limite de ${MAX_RETRIES} tentativas atingido)`
                : (error_message || "Erro desconhecido"),
              finalizado_at: new Date().toISOString(),
              retry_count: newRetryCount,
              proxima_tentativa_at: proximaTentativa,
            })
            .eq("id", targetId);
            
          if (proximaTentativa) {
            console.log(`[Webhook MGF] Retry agendado para ${proximaTentativa} (tentativa ${newRetryCount}/${MAX_RETRIES})`);
          } else {
            console.log(`[Webhook MGF] Limite de retries atingido (${newRetryCount}/${MAX_RETRIES}) - retry automático desabilitado`);
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: "Erro registrado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================
    // Atualização de progresso
    // ============================================
    if (update_progress) {
      let targetId = execucaoIdCandidate;

      if (!targetId && corretora_id) {
        const { data: config } = await supabase
          .from("mgf_automacao_config")
          .select("id")
          .eq("corretora_id", corretora_id)
          .maybeSingle();

        if (config?.id && githubRunIdStr) {
          const { data: existingByRun } = await supabase
            .from("mgf_automacao_execucoes")
            .select("id")
            .eq("config_id", config.id)
            .eq("github_run_id", githubRunIdStr)
            .limit(1)
            .maybeSingle();
          targetId = existingByRun?.id ?? null;
        }
      }

      if (targetId) {
        const updates: Record<string, unknown> = {};
        if (status) updates.status = status;
        if (etapa_atual) updates.etapa_atual = etapa_atual;
        if (progresso_download !== undefined) updates.progresso_download = progresso_download;
        if (progresso_importacao !== undefined) updates.progresso_importacao = progresso_importacao;
        if (registros_processados !== undefined) updates.registros_processados = registros_processados;
        if (total_registros !== undefined) updates.registros_total = total_registros;
        if (nome_arquivo) updates.nome_arquivo = nome_arquivo;
        if (status === 'sucesso' || status === 'erro') {
          updates.finalizado_at = new Date().toISOString();
        }

        await supabase
          .from("mgf_automacao_execucoes")
          .update(updates)
          .eq("id", targetId);

        // Atualizar config
        if (corretora_id && status) {
          await supabase
            .from("mgf_automacao_config")
            .update({
              ultimo_status: status,
              ultimo_erro: status === 'erro' ? (body.erro || null) : null,
            })
            .eq("corretora_id", corretora_id);
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: "Progresso atualizado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================
    // Importação de dados
    // ============================================
    if (!corretora_id || !dados || !Array.isArray(dados)) {
      return new Response(
        JSON.stringify({ success: false, message: "Dados inválidos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`MGF Webhook: Recebendo ${dados.length} registros para ${corretora_id}`);

    // Verificar se é o primeiro chunk
    const isFirstChunk = chunk_index === 0 || chunk_index === undefined;

    if (isFirstChunk) {
      // Desativar importações anteriores
      await supabase
        .from("mgf_importacoes")
        .update({ ativo: false })
        .eq("corretora_id", corretora_id)
        .eq("ativo", true);
    }

    // Criar ou buscar importação
    let importacaoId: string;

    if (isFirstChunk) {
      const { data: importacao, error: impError } = await supabase
        .from("mgf_importacoes")
        .insert({
          nome_arquivo: nome_arquivo || `Automação_${new Date().toISOString()}`,
          total_registros: total_registros || dados.length,
          corretora_id: corretora_id,
          ativo: true,
        })
        .select()
        .single();

      if (impError) throw impError;
      importacaoId = importacao.id;
    } else {
      // Buscar importação existente
      const { data: existing } = await supabase
        .from("mgf_importacoes")
        .select("id")
        .eq("corretora_id", corretora_id)
        .eq("ativo", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      importacaoId = existing?.id || '';
    }

    if (!importacaoId) {
      throw new Error("Não foi possível criar/encontrar importação");
    }

    // Processar e inserir dados
    const records = dados.map((row: Record<string, unknown>) => {
      const record: Record<string, unknown> = {
        importacao_id: importacaoId,
        dados_extras: {},
      };

      const processedCols = new Set<string>();

      Object.entries(row).forEach(([excelCol, value]) => {
        const normalizedCol = excelCol.trim().toUpperCase().replace(/\s+/g, ' ');
        const dbCol = COLUMN_MAP[normalizedCol];

        if (dbCol && !processedCols.has(dbCol)) {
          processedCols.add(dbCol);

          if (DATE_FIELDS.includes(dbCol)) {
            record[dbCol] = parseDate(value);
          } else if (MONEY_FIELDS.includes(dbCol)) {
            record[dbCol] = parseMoneyValue(value);
          } else if (dbCol === "quantidade_parcela") {
            record[dbCol] = value ? parseInt(String(value)) || null : null;
          } else {
            record[dbCol] = value || null;
          }
        } else if (!dbCol) {
          (record.dados_extras as Record<string, unknown>)[excelCol] = value;
        }
      });

      return record;
    });

    // Inserir em batches
    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const { error: batchError } = await supabase
        .from("mgf_dados")
        .insert(batch);

      if (batchError) {
        console.error("Erro no batch:", batchError);
      }
    }

    // Atualizar contagem
    await supabase
      .from("mgf_importacoes")
      .update({ total_registros: total_registros || dados.length })
      .eq("id", importacaoId);

    // Atualizar execução com sucesso e limpar erros anteriores
    if (execucaoIdCandidate) {
      await supabase
        .from("mgf_automacao_execucoes")
        .update({
          status: 'sucesso',
          finalizado_at: new Date().toISOString(),
          registros_processados: records.length,
          registros_total: total_registros || records.length,
          progresso_importacao: 100,
          nome_arquivo: nome_arquivo,
          etapa_atual: 'concluido',
          proxima_tentativa_at: null,
        })
        .eq("id", execucaoIdCandidate);

      // Buscar config_id da execução
      const { data: execConfig } = await supabase
        .from("mgf_automacao_execucoes")
        .select("config_id")
        .eq("id", execucaoIdCandidate)
        .single();

      if (execConfig?.config_id) {
        // Atualizar config
        await supabase
          .from("mgf_automacao_config")
          .update({
            ultimo_status: 'sucesso',
            ultimo_erro: null,
            ultima_execucao: new Date().toISOString(),
          })
          .eq("id", execConfig.config_id);

        // Limpar execuções anteriores com erro/parado
        await supabase
          .from("mgf_automacao_execucoes")
          .delete()
          .eq("config_id", execConfig.config_id)
          .in("status", ["erro", "parado", "cancelled"])
          .neq("id", execucaoIdCandidate);
        
        console.log("[MGF Webhook] Execuções com erro/parado anteriores removidas");
      }
    }

    console.log(`MGF Webhook: ${records.length} registros importados`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${records.length} registros processados`,
        importacao_id: importacaoId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[MGF Webhook] Erro:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
