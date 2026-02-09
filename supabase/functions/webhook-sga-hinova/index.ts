import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

// Mapeamento de colunas do Excel para campos do banco
const COLUMN_MAP: { [key: string]: string } = {
  "EVENTO ESTADO": "evento_estado",
  "DATA CADASTRO ITEM": "data_cadastro_item",
  "DATA EVENTO": "data_evento",
  "MOTIVO EVENTO": "motivo_evento",
  "TIPO EVENTO": "tipo_evento",
  "SITUACAO EVENTO": "situacao_evento",
  "SITUAÇÃO EVENTO": "situacao_evento",
  "MODELO VEICULO": "modelo_veiculo",
  "MODELO VEÍCULO": "modelo_veiculo",
  "MODELO VEICULO TERCEIRO": "modelo_veiculo_terceiro",
  "MODELO VEÍCULO TERCEIRO": "modelo_veiculo_terceiro",
  "PLACA": "placa",
  "PLACA TERCEIRO": "placa_terceiro",
  "DATA ULTIMA ALTERACAO SITUACAO": "data_ultima_alteracao_situacao",
  "DATA ÚLTIMA ALTERAÇÃO SITUAÇÃO": "data_ultima_alteracao_situacao",
  "VALOR REPARO": "valor_reparo",
  "DATA CONCLUSAO": "data_conclusao",
  "DATA CONCLUSÃO": "data_conclusao",
  "CUSTO EVENTO": "custo_evento",
  "DATA ALTERACAO": "data_alteracao",
  "DATA ALTERAÇÃO": "data_alteracao",
  "DATA PREVISAO ENTREGA": "data_previsao_entrega",
  "DATA PREVISÃO ENTREGA": "data_previsao_entrega",
  "SOLICITOU CARRO RESERVA": "solicitou_carro_reserva",
  "ENVOLVIMENTO TERCEIRO": "envolvimento_terceiro",
  "PASSIVEL RESSARCIMENTO": "passivel_ressarcimento",
  "PASSÍVEL RESSARCIMENTO": "passivel_ressarcimento",
  "VALOR MAO DE OBRA": "valor_mao_de_obra",
  "VALOR MÃO DE OBRA": "valor_mao_de_obra",
  "CLASSIFICACAO": "classificacao",
  "CLASSIFICAÇÃO": "classificacao",
  "PARTICIPACAO": "participacao",
  "PARTICIPAÇÃO": "participacao",
  "ENVOLVIMENTO": "envolvimento",
  "PREVISAO VALOR REPARO": "previsao_valor_reparo",
  "PREVISÃO VALOR REPARO": "previsao_valor_reparo",
  "USUARIO ALTERACAO": "usuario_alteracao",
  "USUÁRIO ALTERAÇÃO": "usuario_alteracao",
  "DATA CADASTRO EVENTO": "data_cadastro_evento",
  "COOPERATIVA": "cooperativa",
  "VALOR PROTEGIDO VEICULO": "valor_protegido_veiculo",
  "VALOR PROTEGIDO VEÍCULO": "valor_protegido_veiculo",
  "SITUACAO ANALISE EVENTO": "situacao_analise_evento",
  "SITUAÇÃO ANÁLISE EVENTO": "situacao_analise_evento",
  "REGIONAL": "regional",
  "ANO FABRICACAO": "ano_fabricacao",
  "ANO FABRICAÇÃO": "ano_fabricacao",
  "VOLUNTARIO": "voluntario",
  "VOLUNTÁRIO": "voluntario",
  "REGIONAL VEICULO": "regional_veiculo",
  "REGIONAL VEÍCULO": "regional_veiculo",
  "ASSOCIADO ESTADO": "associado_estado",
  "EVENTO CIDADE": "evento_cidade",
  "CIDADE EVENTO": "evento_cidade",
  "CIDADE": "evento_cidade",
  "PROTOCOLO": "protocolo",
  "EVENTO LOGRADOURO": "evento_logradouro",
  "CATEGORIA VEICULO": "categoria_veiculo",
  "CATEGORIA VEÍCULO": "categoria_veiculo",
  "TIPO VEICULO VEICULO TERCEIRO": "tipo_veiculo_terceiro",
  "TIPO VEÍCULO VEÍCULO TERCEIRO": "tipo_veiculo_terceiro",
};

// Normaliza header
const normalizeHeader = (header: string): string => {
  return header.trim().toUpperCase().replace(/\s+/g, " ");
};

// Parse de data brasileira ou serial Excel
const parseDate = (value: any): string | null => {
  if (!value) return null;
  
  if (typeof value === "number") {
    if (value < 1 || value > 100000) return null;
    try {
      const date = new Date((value - 25569) * 86400 * 1000);
      if (isNaN(date.getTime()) || date.getFullYear() < 1900 || date.getFullYear() > 2100) {
        return null;
      }
      return date.toISOString().split("T")[0];
    } catch {
      return null;
    }
  }
  
  if (typeof value === "string") {
    const parts = value.split("/");
    if (parts.length === 3) {
      const [p1, p2, p3] = parts;
      const day = parseInt(p1);
      const month = parseInt(p2);
      let year = parseInt(p3);
      if (year < 100) year += 2000;
      
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
  }
  
  return null;
};

// Parse de valor monetário brasileiro
const parseMoneyValue = (value: any): number => {
  if (!value) return 0;
  if (typeof value === "number") return value;
  
  const cleaned = String(value)
    .replace(/R\$\s*/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verificar secret se configurado
    const requestSecret = req.headers.get('x-webhook-secret');
    if (webhookSecret && requestSecret !== webhookSecret) {
      console.warn("[Webhook SGA] Secret inválido");
      return new Response(
        JSON.stringify({ success: false, message: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { 
      corretora_id, 
      dados, 
      nome_arquivo, 
      execucao_id,
      github_run_id,
      status,
      erro,
      etapa,
      progresso_download,
      bytes_baixados,
      bytes_total,
      progresso_importacao,
      registros_processados,
      registros_total,
    } = body;

    console.log(`[Webhook SGA] Recebido: corretora=${corretora_id}, status=${status}, registros=${dados?.length || 0}`);

    // Atualização de progresso
    if (status && execucao_id) {
      const updateData: any = {
        status,
        etapa_atual: etapa,
      };

      if (erro) updateData.erro = erro;
      if (progresso_download !== undefined) updateData.progresso_download = progresso_download;
      if (bytes_baixados !== undefined) updateData.bytes_baixados = bytes_baixados;
      if (bytes_total !== undefined) updateData.bytes_total = bytes_total;
      if (progresso_importacao !== undefined) updateData.progresso_importacao = progresso_importacao;
      if (registros_processados !== undefined) updateData.registros_processados = registros_processados;
      if (registros_total !== undefined) updateData.registros_total = registros_total;
      if (nome_arquivo) updateData.nome_arquivo = nome_arquivo;

      if (status === 'sucesso' || status === 'erro') {
        updateData.finalizado_at = new Date().toISOString();
        updateData.duracao_segundos = Math.round((Date.now() - startTime) / 1000);
        
        // Se erro, agendar retry em 1 hora (com limite máximo)
        if (status === 'erro') {
          // Limite máximo de retries para evitar loop infinito
          const MAX_RETRIES = 10;
          
          // Buscar retry_count atual
          const { data: currentExec } = await supabase
            .from("sga_automacao_execucoes")
            .select("retry_count")
            .eq("id", execucao_id)
            .single();
          
          const newRetryCount = (currentExec?.retry_count || 0) + 1;
          updateData.retry_count = newRetryCount;
          
          // Só agenda retry se não ultrapassou o limite
          if (newRetryCount < MAX_RETRIES) {
            updateData.proxima_tentativa_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
            console.log(`[Webhook SGA] Retry agendado para ${updateData.proxima_tentativa_at} (tentativa ${newRetryCount}/${MAX_RETRIES})`);
          } else {
            updateData.proxima_tentativa_at = null;
            updateData.erro = `${erro || 'Erro desconhecido'} (limite de ${MAX_RETRIES} tentativas atingido)`;
            console.log(`[Webhook SGA] Limite de retries atingido (${newRetryCount}/${MAX_RETRIES}) - retry automático desabilitado`);
          }
        } else if (status === 'sucesso') {
          // Limpar agendamento de retry em caso de sucesso
          updateData.proxima_tentativa_at = null;
        }
      }

      await supabase
        .from("sga_automacao_execucoes")
        .update(updateData)
        .eq("id", execucao_id);

      // Atualizar config também
      const { data: configData } = await supabase
        .from("sga_automacao_execucoes")
        .select("config_id")
        .eq("id", execucao_id)
        .single();

      if (configData?.config_id) {
        await supabase
          .from("sga_automacao_config")
          .update({
            ultimo_status: status,
            ultimo_erro: erro || null,
            ultima_execucao: new Date().toISOString(),
          })
          .eq("id", configData.config_id);
      }

      // Se não há dados para importar, retornar
      if (!dados || dados.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: "Status atualizado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Importação de dados
    if (dados && dados.length > 0 && corretora_id) {
      console.log(`[Webhook SGA] Iniciando importação de ${dados.length} registros`);

      // Desativar importações anteriores
      await supabase
        .from("sga_importacoes")
        .update({ ativo: false })
        .eq("ativo", true)
        .eq("corretora_id", corretora_id);

      // Criar nova importação
      const { data: importacao, error: impError } = await supabase
        .from("sga_importacoes")
        .insert({
          nome_arquivo: nome_arquivo || `EVENTOS_${new Date().toISOString().slice(8,10)}${new Date().toISOString().slice(5,7)}${new Date().toISOString().slice(0,4)}.xlsx`,
          total_registros: dados.length,
          ativo: true,
          corretora_id: corretora_id,
        })
        .select()
        .single();

      if (impError) {
        console.error("[Webhook SGA] Erro ao criar importação:", impError);
        throw impError;
      }

      // Processar dados
      const records = dados.map((row: any) => {
        const record: any = { importacao_id: importacao.id };
        const processedDbCols = new Set<string>();

        // Processar cada coluna
        Object.keys(row).forEach(excelCol => {
          const normalizedCol = normalizeHeader(excelCol);
          const dbCol = COLUMN_MAP[normalizedCol];
          
          if (!dbCol || processedDbCols.has(dbCol)) return;
          
          const value = row[excelCol];
          processedDbCols.add(dbCol);

          // Campos de data
          if (dbCol.startsWith("data_")) {
            record[dbCol] = parseDate(value);
          }
          // Campos monetários
          else if (["valor_reparo", "custo_evento", "valor_mao_de_obra", "participacao", "previsao_valor_reparo", "valor_protegido_veiculo"].includes(dbCol)) {
            record[dbCol] = parseMoneyValue(value);
          }
          // Ano
          else if (dbCol === "ano_fabricacao") {
            record[dbCol] = value ? parseInt(String(value)) || null : null;
          }
          // Texto normal
          else {
            record[dbCol] = value || null;
          }
        });

        return record;
      });

      // Inserir em batches
      const batchSize = 100;
      let processedCount = 0;

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        
        const { error: batchError } = await supabase
          .from("sga_eventos")
          .insert(batch);

        if (batchError) {
          console.error(`[Webhook SGA] Erro no batch ${i}:`, batchError);
          throw batchError;
        }

        processedCount += batch.length;

        // Atualizar progresso
        if (execucao_id) {
          const progress = Math.round((processedCount / records.length) * 100);
          await supabase
            .from("sga_automacao_execucoes")
            .update({
              progresso_importacao: progress,
              registros_processados: processedCount,
              registros_total: records.length,
            })
            .eq("id", execucao_id);
        }
      }

      // Finalizar
      if (execucao_id) {
        const durationSeconds = Math.round((Date.now() - startTime) / 1000);
        
        await supabase
          .from("sga_automacao_execucoes")
          .update({
            status: 'sucesso',
            mensagem: `Importados ${records.length} registros com sucesso`,
            registros_processados: records.length,
            registros_total: records.length,
            progresso_importacao: 100,
            finalizado_at: new Date().toISOString(),
            duracao_segundos: durationSeconds,
            nome_arquivo: nome_arquivo,
          })
          .eq("id", execucao_id);

        // Atualizar config
        const { data: configData } = await supabase
          .from("sga_automacao_execucoes")
          .select("config_id")
          .eq("id", execucao_id)
          .single();

        if (configData?.config_id) {
          await supabase
            .from("sga_automacao_config")
            .update({
              ultimo_status: 'sucesso',
              ultimo_erro: null,
            })
            .eq("id", configData.config_id);
        }
      }

      // Limpar execuções anteriores com erro/parado
      if (execucao_id) {
        const { data: execConfig } = await supabase
          .from("sga_automacao_execucoes")
          .select("config_id")
          .eq("id", execucao_id)
          .single();
        
        if (execConfig?.config_id) {
          await supabase
            .from("sga_automacao_execucoes")
            .delete()
            .eq("config_id", execConfig.config_id)
            .in("status", ["erro", "parado", "cancelled"])
            .neq("id", execucao_id);
          
          console.log("[Webhook SGA] Execuções com erro/parado anteriores removidas");
        }
      }

      // Log de auditoria
      await supabase.from("bi_audit_logs").insert({
        modulo: "sga_insights",
        acao: "importacao",
        descricao: `Importação automática de ${records.length} registros - ${nome_arquivo}`,
        corretora_id: corretora_id,
        user_id: "system",
        user_nome: "Automação SGA Hinova",
        dados_novos: {
          arquivo: nome_arquivo,
          total_registros: records.length,
          execucao_id,
          github_run_id,
        },
      });

      console.log(`[Webhook SGA] Importação concluída: ${records.length} registros`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `${records.length} registros importados com sucesso`,
          importacao_id: importacao.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Webhook processado" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[Webhook SGA] Erro:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
