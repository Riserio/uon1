import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

// Mapeamento de colunas do relatório Hinova para o banco
// Inclui variações do layout "BI - Vangard Cobrança"
const COLUMN_MAP: { [key: string]: string } = {
  // Nome
  "nome": "nome",
  "nome_associado": "nome",
  "associado": "nome",
  // Voluntário
  "voluntario": "voluntario",
  "voluntário": "voluntario",
  "vendedor": "voluntario",
  // Placas
  "placas": "placas",
  "placa": "placas",
  // Cooperativa
  "cooperativa": "cooperativa",
  // Regional
  "regional": "regional_boleto",
  "regional_boleto": "regional_boleto",
  // Situação
  "situacao": "situacao",
  "situação": "situacao",
  "situacao_boleto": "situacao",
  "situação_boleto": "situacao",
  "sit_boleto": "situacao",
  "status": "situacao",
  // Valor
  "valor": "valor",
  "valor_boleto": "valor",
  // Data Vencimento
  "data_vencimento": "data_vencimento",
  "vencimento": "data_vencimento",
  "dt_vencimento": "data_vencimento",
  // Data Vencimento Original
  "data_vencimento_original": "data_vencimento_original",
  "vencimento_original": "data_vencimento_original",
  "dt_vencimento_original": "data_vencimento_original",
  // Data Pagamento
  "data_pagamento": "data_pagamento",
  "pagamento": "data_pagamento",
  "dt_pagamento": "data_pagamento",
  // Dia Vencimento
  "dia_vencimento_veiculo": "dia_vencimento_veiculo",
  "dia_vencimento": "dia_vencimento_veiculo",
  "dia_venc": "dia_vencimento_veiculo",
  // Dias Atraso
  "qtde_dias_atraso_vencimento_original": "qtde_dias_atraso_vencimento_original",
  "dias_atraso": "qtde_dias_atraso_vencimento_original",
  "atraso": "qtde_dias_atraso_vencimento_original",
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
      mes_referencia 
    } = body;

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

    // Desativar importações anteriores
    await supabase
      .from("cobranca_importacoes")
      .update({ ativo: false })
      .eq("ativo", true)
      .eq("corretora_id", corretoraId);

    // Criar nova importação
    const nomeArquivo = nome_arquivo || `Hinova_Auto_${new Date().toISOString().split('T')[0]}.json`;
    
    const { data: importacao, error: importError } = await supabase
      .from("cobranca_importacoes")
      .insert({
        corretora_id: corretoraId,
        nome_arquivo: nomeArquivo,
        ativo: true,
        total_registros: dados.length,
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

    console.log("Importação criada:", importacao.id);

    // Processar dados em lotes
    const BATCH_SIZE = 100;
    let processados = 0;
    let erros = 0;

    for (let i = 0; i < dados.length; i += BATCH_SIZE) {
      const batch = dados.slice(i, i + BATCH_SIZE);
      
      const boletosBatch = batch.map((row: any) => {
        const boleto: any = {
          importacao_id: importacao.id,
        };

        // Mapear campos
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
        message: `Importação concluída: ${processados} registros processados`,
        importacao_id: importacao.id,
        total: dados.length,
        processados,
        erros,
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
