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
  "OBSERVACAO": "observacoes",
  "OBSERVAÇÃO": "observacoes",
  "OBSERVACOES": "observacoes",
  "OBSERVAÇÕES": "observacoes",
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
      chunk_atual,
      total_chunks,
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
          const MAX_RETRIES = 3;
          
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
            updateData.proxima_tentativa_at = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
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

      // Se sucesso mas sem dados, tratar como erro para preservar importação anterior
      if (!dados || dados.length === 0) {
        if (status === 'sucesso') {
          console.error("[Webhook SGA] Sucesso reportado mas sem dados - convertendo para erro");
          await supabase
            .from("sga_automacao_execucoes")
            .update({
              status: 'erro',
              erro: 'Robô finalizou sem retornar registros. O arquivo baixado estava vazio ou não foi reconhecido pelo parser.',
              finalizado_at: new Date().toISOString(),
            })
            .eq("id", execucao_id);
        }
        return new Response(
          JSON.stringify({ success: true, message: "Status atualizado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Importação de dados
    if (dados && dados.length > 0 && corretora_id) {
      const isFirstChunk = !chunk_atual || chunk_atual === 1;
      console.log(`[Webhook SGA] Iniciando importação de ${dados.length} registros (chunk ${chunk_atual || 1}/${total_chunks || 1})`);

      let importacaoId: string;

      if (isFirstChunk) {
        // Desativar importações anteriores apenas no primeiro chunk
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
        importacaoId = importacao.id;
      } else {
        // Chunks subsequentes: buscar importação ativa existente
        const { data: existingImport } = await supabase
          .from("sga_importacoes")
          .select("id")
          .eq("ativo", true)
          .eq("corretora_id", corretora_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (!existingImport) {
          throw new Error("Importação ativa não encontrada para chunk subsequente");
        }
        importacaoId = existingImport.id;

        // Atualizar total de registros (acumular)
        const { data: currentImport } = await supabase
          .from("sga_importacoes")
          .select("total_registros")
          .eq("id", importacaoId)
          .single();

        await supabase
          .from("sga_importacoes")
          .update({ total_registros: (currentImport?.total_registros || 0) + dados.length })
          .eq("id", importacaoId);
      }

      // Processar dados
      const records = dados.map((row: any) => {
        const record: any = { importacao_id: importacaoId };
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

      // Inserir em batches (aumentado para 500 para performance)
      const batchSize = 500;
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

      const isLastChunk = !total_chunks || chunk_atual === total_chunks;

      // Finalizar apenas no último chunk
      if (execucao_id && isLastChunk) {
        const durationSeconds = Math.round((Date.now() - startTime) / 1000);
        
        await supabase
          .from("sga_automacao_execucoes")
          .update({
            status: 'sucesso',
            mensagem: `Importados ${records.length} registros com sucesso (chunk ${chunk_atual || 1}/${total_chunks || 1})`,
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

        // Limpar execuções anteriores com erro/parado
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

        // ============================================
        // Auto-send WhatsApp report after successful import
        // ============================================
        try {
          const { data: waConfig } = await supabase
            .from("whatsapp_config")
            .select("*")
            .eq("corretora_id", corretora_id)
            .eq("ativo", true)
            .maybeSingle();

          if (waConfig?.envio_automatico_eventos) {
            console.log("[Webhook SGA] Envio automático de WhatsApp ativado, disparando...");
            
            const fluxoId = (waConfig as any).fluxo_eventos_id;
            const phoneNumbers = (waConfig.telefone_whatsapp || "").split(",").map((p: string) => p.trim()).filter(Boolean);
            const metaToken = Deno.env.get("META_WHATSAPP_TOKEN");
            const metaPhoneNumberId = Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID");

            if (fluxoId && phoneNumbers.length > 0) {
              for (const phone of phoneNumbers) {
                const cleanPhone = phone.replace(/\D/g, "");
                const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
                try {
                  await supabase.functions.invoke("whatsapp-flow-engine", {
                    body: { contact_phone: formattedPhone, flow_id: fluxoId, trigger: "auto_import" },
                  });
                  console.log(`[Webhook SGA] Flow disparado para ${formattedPhone}`);
                } catch (flowErr) {
                  console.error(`[Webhook SGA] Erro ao disparar flow para ${formattedPhone}:`, flowErr);
                }
              }
              await supabase.from("whatsapp_config").update({ ultimo_envio_automatico: new Date().toISOString(), ultimo_erro_envio: null }).eq("id", waConfig.id);
            } else if (metaToken && metaPhoneNumberId && phoneNumbers.length > 0) {
              const { data: resumoData } = await supabase.functions.invoke("gerar-resumo-eventos", { body: { corretora_id } });
              const messageContent = resumoData?.resumo || "Resumo de eventos não disponível";

              for (const phone of phoneNumbers) {
                const cleanPhone = phone.replace(/\D/g, "");
                const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
                try {
                  const metaResponse = await fetch(`https://graph.facebook.com/v22.0/${metaPhoneNumberId}/messages`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${metaToken}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ messaging_product: "whatsapp", to: formattedPhone, type: "text", text: { preview_url: false, body: messageContent } }),
                  });
                  const metaData = await metaResponse.json();
                  const metaMessageId = metaData?.messages?.[0]?.id || null;

                  await supabase.from("whatsapp_historico").insert({ corretora_id, telefone_destino: formattedPhone, mensagem: messageContent, tipo: "eventos", status: metaResponse.ok ? "enviado" : "erro", status_entrega: metaResponse.ok ? "enviado" : "erro", meta_message_id: metaMessageId, enviado_em: new Date().toISOString(), enviado_por: null });
                  const { data: waContact } = await supabase.from("whatsapp_contacts").select("id").eq("phone", formattedPhone).maybeSingle();
                  if (waContact) {
                    await supabase.from("whatsapp_messages").insert({ contact_id: waContact.id, direction: "out", body: messageContent, type: "text", status: metaResponse.ok ? "sent" : "failed", meta_message_id: metaMessageId, sent_by: null });
                    await supabase.from("whatsapp_contacts").update({ last_message_at: new Date().toISOString(), last_message_preview: messageContent.substring(0, 100) }).eq("id", waContact.id);
                  }
                  console.log(`[Webhook SGA] WhatsApp enviado para ${formattedPhone}: ${metaResponse.ok ? "sucesso" : "erro"}`);
                } catch (sendErr) {
                  console.error(`[Webhook SGA] Erro ao enviar WhatsApp para ${formattedPhone}:`, sendErr);
                }
              }
              await supabase.from("whatsapp_config").update({ ultimo_envio_automatico: new Date().toISOString(), ultimo_erro_envio: null }).eq("id", waConfig.id);
            }
          }
        } catch (waError) {
          console.error("[Webhook SGA] Erro no envio automático WhatsApp:", waError);
        }
      }

      console.log(`[Webhook SGA] Chunk ${chunk_atual || 1}/${total_chunks || 1} concluído: ${records.length} registros`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `${records.length} registros importados (chunk ${chunk_atual || 1}/${total_chunks || 1})`,
          importacao_id: importacaoId,
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
