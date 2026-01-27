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

// Parse de data no formato DD/MM/YYYY ou YYYY-MM-DD
function parseDate(value: any): string | null {
  if (!value) return null;
  
  const strValue = String(value).trim();
  
  // Formato DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(strValue)) {
    const [day, month, year] = strValue.split('/');
    return `${year}-${month}-${day}`;
  }
  
  // Formato YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(strValue)) {
    return strValue;
  }
  
  // Formato M/D/YY ou MM/DD/YY
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(strValue)) {
    const parts = strValue.split('/');
    let day = parts[0].padStart(2, '0');
    let month = parts[1].padStart(2, '0');
    let year = parts[2];
    if (year.length === 2) {
      year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
    }
    return `${year}-${month}-${day}`;
  }
  
  return null;
}

// Parse de valor monetário
function parseMoneyValue(value: any): number {
  if (!value) return 0;
  
  const strValue = String(value).trim();
  
  // Remove R$, espaços e converte vírgula para ponto
  const cleanValue = strValue
    .replace(/R\$\s*/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  
  const parsed = parseFloat(cleanValue);
  return isNaN(parsed) ? 0 : parsed;
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
    } = body;

    // ============================================
    // Atualização de progresso (sem inserção de dados)
    // ============================================
    if (update_progress && execucao_id) {
      const updateData: Record<string, unknown> = {};
      
      if (progresso_download !== undefined) updateData.progresso_download = progresso_download;
      if (bytes_baixados !== undefined) updateData.bytes_baixados = bytes_baixados;
      if (bytes_total !== undefined) updateData.bytes_total = bytes_total;
      if (progresso_importacao !== undefined) updateData.progresso_importacao = progresso_importacao;
      if (etapa_atual !== undefined) updateData.etapa_atual = etapa_atual;
      if (total_registros !== undefined) updateData.registros_total = total_registros;
      
      const { error: updateError } = await supabase
        .from("cobranca_automacao_execucoes")
        .update(updateData)
        .eq("id", execucao_id);
      
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
    } else {
      // Modo tradicional: desativar importações anteriores e criar uma nova
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
    const hojeStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    for (let i = 0; i < dados.length; i += BATCH_SIZE) {
      const batch = dados.slice(i, i + BATCH_SIZE);

      const boletosBatch = batch.map((row: any) => {
        const boleto: any = {
          importacao_id: importacao.id,
        };

        // Mapear campos primários
        for (const [key, value] of Object.entries(row)) {
          const normalizedKey = key.toLowerCase().trim().replace(/\s+/g, '_');
          const dbField = COLUMN_MAP[normalizedKey];

          if (dbField) {
            if (dbField.includes('data') || dbField.includes('vencimento') || dbField.includes('pagamento')) {
              boleto[dbField] = parseDate(value);
            } else if (dbField === 'valor') {
              boleto[dbField] = parseMoneyValue(value);
            } else if (dbField === 'dia_vencimento_veiculo' || dbField === 'qtde_dias_atraso_vencimento_original') {
              boleto[dbField] = parseInt(String(value)) || null;
            } else {
              boleto[dbField] = value ? String(value).trim() : null;
            }
          }
        }

        // ============================================
        // FALLBACK: Derivar campos críticos quando vazios
        // ============================================

        // Dia Vencimento Veículo = dia do mês de data_vencimento
        if (boleto.dia_vencimento_veiculo == null && boleto.data_vencimento) {
          const dv = String(boleto.data_vencimento); // YYYY-MM-DD
          const dia = parseInt(dv.split('-')[2], 10);
          if (!isNaN(dia) && dia >= 1 && dia <= 31) {
            boleto.dia_vencimento_veiculo = dia;
          }
        }

        // Dias de atraso = hoje - data_vencimento_original (>=0)
        if (boleto.qtde_dias_atraso_vencimento_original == null && boleto.data_vencimento_original) {
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
          const normalizedKey = key.toLowerCase().trim().replace(/\s+/g, '_');
          if (!COLUMN_MAP[normalizedKey] && value) {
            dadosExtras[key] = value;
          }
        }
        if (Object.keys(dadosExtras).length > 0) {
          boleto.dados_extras = dadosExtras;
        }

        return boleto;
      });

      const { error: batchError } = await supabase
        .from("cobranca_boletos")
        .insert(boletosBatch);

      if (batchError) {
        console.error(`Erro no lote ${i / BATCH_SIZE + 1}:`, batchError);
        erros += batch.length;
      } else {
        processados += batch.length;
      }

      // Atualizar progresso se temos execucao_id
      if (execucao_id && dados.length > 0) {
        const progressoImportacao = Math.round((processados / dados.length) * 100);
        await supabase
          .from("cobranca_automacao_execucoes")
          .update({
            progresso_importacao: progressoImportacao,
            registros_processados: processados,
            etapa_atual: 'importacao',
          })
          .eq("id", execucao_id);
      }
    }

    // Registrar log de auditoria
    await supabase.from("bi_audit_logs").insert({
      modulo: "cobranca",
      acao: "importacao_automatica",
      descricao: `Importação automática via webhook: ${nomeArquivo} - ${processados} registros`,
      corretora_id: corretoraId,
      user_id: "00000000-0000-0000-0000-000000000000", // Sistema
      user_nome: "Sistema (Webhook)",
      dados_novos: {
        importacao_id: importacao.id,
        total_registros: dados.length,
        processados,
        erros,
        mes_referencia,
      },
    });

    console.log(`Importação concluída: ${processados} processados, ${erros} erros`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Chunk processado: ${processados} registros inseridos`,
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
