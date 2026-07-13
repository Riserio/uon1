// lovable-deploy: deploy nudge 2026-07-13T03:31:21Z
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// As 7 categorias do PID (pid_estudo_base)
type Cat = "passeio" | "motocicletas" | "utilitarios_suvs_vans" | "caminhoes" | "taxi_app" | "especiais_importados" | "carretas";
const CATS: Cat[] = ["passeio", "motocicletas", "utilitarios_suvs_vans", "caminhoes", "taxi_app", "especiais_importados", "carretas"];

/**
 * Classificador por palavra-chave: mapeia os valores livres de tipo_veiculo/categoria
 * (dezenas de variacoes por associacao) para as 7 categorias do PID.
 * A ORDEM importa: casos mais especificos primeiro (taxi/app e moto antes de passeio).
 */
function classificar(tipo?: string | null, categoria?: string | null): Cat {
  const s = `${tipo || ""} ${categoria || ""}`
    .toUpperCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, ""); // remove acentos

  const has = (...ks: string[]) => ks.some((k) => s.includes(k));

  // 1) Taxi / aplicativo (antes de passeio/moto porque "MOTO APP" deve cair aqui)
  if (has("TAXI", "APLICATIV", "APLIC.", "UBER", "MOTORISTA", " APP", "APP ", "/APP", "APP/")) return "taxi_app";
  // 2) Carretas / reboques / agregados de carga
  if (has("CARRETA", "REBOQUE", "DOLY", "DOLLY", "BITREM", "IMPLEMENTO")) return "carretas";
  // 3) Caminhoes / pesados
  if (has("CAMINH", "TRUCK", "PESAD", "ACIMA DE 7", "7 TON", "7TON", "TON", "VUC", "CARGA")) return "caminhoes";
  // 4) Motocicletas
  if (has("MOTOCICL", "MOTO", "CICLOMOTOR", "SCOOTER")) return "motocicletas";
  // 5) Utilitarios / SUV / vans / pick-ups / comerciais leves
  if (has("SUV", "VAN", "UTILITARIO", "PICK-UP", "PICKUP", "PICK UP", "CAMINHONETE", "COMERCIAL", "FURGAO")) return "utilitarios_suvs_vans";
  // 6) Especiais / importados / executivos / vip
  if (has("IMPORTAD", "ESPECIA", "EXECUTIV", "VIP", "BLINDAD")) return "especiais_importados";
  // 7) Default: passeio (PASSEIO, AUTOMOVEL, PARTICULAR, LEVE, NACIONAL...)
  return "passeio";
}

// valor efetivo: protegido quando existe; senao FIPE (decisao do usuario)
const valorEfetivo = (protegido: unknown, fipe: unknown): number => {
  const p = Number(protegido) || 0;
  if (p > 0) return p;
  const f = Number(fipe) || 0;
  return f > 0 ? f : 0;
};

// Situacao normalizada (uppercase, sem acentos)
const normSit = (situacao?: string | null): string =>
  (situacao || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

// "veiculo ativo" (conta no total de 4909): ATIVO/REATIVACAO ou legado sem
// situacao. Inadimplente, inativo, pendente, cancelado, negado NAO entram.
const isAtivo = (situacao?: string | null): boolean => {
  const s = normSit(situacao);
  if (!s) return true;
  if (/INADIMPL/.test(s)) return false;
  if (/INATIV|CANCEL|EXCLU|SUSPEN|BAIXAD|DESLIG|NEGAD|PENDENT|REVISTORIA/.test(s)) return false;
  return /ATIVO|REATIV/.test(s);
};
const isInadimplente = (situacao?: string | null): boolean => /INADIMPL/.test(normSit(situacao));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const corretora_id: string = body.corretora_id;
    if (!corretora_id) {
      return new Response(JSON.stringify({ success: false, message: "corretora_id é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Mês de referência (primeiro dia do mês); default = mês atual
    const ref = typeof body.data_referencia === "string" && /^\d{4}-\d{2}/.test(body.data_referencia)
      ? `${body.data_referencia.slice(0, 7)}-01`
      : `${new Date().toISOString().slice(0, 7)}-01`;
    const refAno = Number(ref.slice(0, 4));
    const refMes = Number(ref.slice(5, 7));
    const inicioMesStr = `${ref.slice(0, 7)}-01`;
    const fimMesStr = new Date(Date.UTC(refAno, refMes, 1)).toISOString().slice(0, 10);

    // 1) importação ativa de Estudo de Base da associação
    const { data: imp } = await supabase
      .from("estudo_base_importacoes")
      .select("id")
      .eq("corretora_id", corretora_id)
      .eq("ativo", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!imp?.id) {
      return new Response(JSON.stringify({ success: false, message: "Nenhuma base de Estudo de Base ativa para agregar" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) ler registros da base em lotes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = [];
    let offset = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("estudo_base_registros")
        .select("tipo_veiculo, categoria, valor_protegido, valor_fipe, situacao_veiculo, voluntario, data_contrato")
        .eq("importacao_id", imp.id)
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < PAGE) break;
      offset += PAGE;
    }

    // 3) agregação por categoria
    type Ac = { qtd: number; protegido: number; valorProt: number; valorTotal: number };
    const acc: Record<Cat, Ac> = Object.fromEntries(CATS.map((c) => [c, { qtd: 0, protegido: 0, valorProt: 0, valorTotal: 0 }])) as Record<Cat, Ac>;
    let totalGeral = 0, totalAtivos = 0, totalInadimplentes = 0;

    // 3b) total de associados (voluntário) únicos e cadastros novos no mês -
    // calculado automaticamente a partir da base ativa, em vez de depender de
    // upload manual da planilha "Associados" no PID (que parou de ser enviada
    // a partir de jan/2026 e deixava total_associados/cadastros_realizados
    // zerados). Fonte: estudo_base_registros.voluntario (nome do associado
    // responsável pelo veículo) + data_contrato.
    const voluntariosAtivos = new Set<string>();
    const voluntariosNovosNoMes = new Set<string>();

    for (const r of rows) {
      totalGeral++; // total inclui TODAS as situacoes importadas
      if (isInadimplente(r.situacao_veiculo)) totalInadimplentes++;
      if (!isAtivo(r.situacao_veiculo)) continue; // categorias/valor: só ativos
      totalAtivos++;
      const cat = classificar(r.tipo_veiculo, r.categoria);
      const vProt = Number(r.valor_protegido) || 0;
      const vEf = valorEfetivo(r.valor_protegido, r.valor_fipe);
      const a = acc[cat];
      a.qtd++;
      if (vEf > 0) { a.protegido++; a.valorTotal += vEf; }
      if (vProt > 0) a.valorProt += vProt;

      const voluntario = (r.voluntario || "").trim();
      if (voluntario) {
        voluntariosAtivos.add(voluntario);
        const dataContrato: string | null = r.data_contrato;
        if (dataContrato && dataContrato >= inicioMesStr && dataContrato < fimMesStr) {
          voluntariosNovosNoMes.add(voluntario);
        }
      }
    }

    const totalAssociados = voluntariosAtivos.size;
    const cadastrosRealizados = voluntariosNovosNoMes.size;

    // Inadimplentes do MÊS CORRENTE via Cobrança: boletos JÁ VENCIDOS e ainda em
    // aberto, por placa distinta. Só calcula/gera quando o mês de referência é o
    // corrente (não sobrescreve inadimplência de meses passados no histórico).
    let inadimplentesCobranca: number | null = null;
    {
      const hoje = new Date();
      const refIsCurrent = refAno === hoje.getUTCFullYear() && refMes === hoje.getUTCMonth() + 1;
      if (refIsCurrent) {
        const firstISO = `${refAno}-${String(refMes).padStart(2, "0")}-01`;
        const todayISO = hoje.toISOString().slice(0, 10);
        const placasInad = new Set<string>();
        let offC = 0;
        const PAGEC = 1000;
        while (true) {
          const { data: bc, error: ec } = await supabase
            .from("cobranca_boletos_ativos")
            .select("placas")
            .eq("corretora_id", corretora_id)
            .ilike("situacao", "ABERTO")
            .is("data_pagamento", null)
            .gte("data_vencimento", firstISO)
            .lt("data_vencimento", todayISO)
            .range(offC, offC + PAGEC - 1);
          if (ec) break;
          if (!bc || bc.length === 0) break;
          for (const r of bc) {
            const pl = (r as { placas?: string | null }).placas;
            if (pl) placasInad.add(String(pl).trim().toUpperCase());
          }
          if (bc.length < PAGEC) break;
          offC += PAGEC;
          if (offC >= 100000) break;
        }
        inadimplentesCobranca = placasInad.size;
      }
    }
    const inadimplentesPersistir = inadimplentesCobranca ?? totalInadimplentes;

    // 4) montar linha do pid_estudo_base (qtd, protegido, valor e ticket médio por categoria)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linha: any = {
      corretora_id,
      data_referencia: ref,
      total_veiculos_geral: totalGeral,
      total_veiculos_ativos: totalAtivos,
      updated_at: new Date().toISOString(),
    };
    for (const c of CATS) {
      const a = acc[c];
      linha[`qtd_${c}`] = a.qtd;
      linha[`protegido_${c}`] = a.protegido;
      linha[`valor_protegido_${c}`] = Math.round(a.valorTotal);
      // ticket médio = valor total ÷ nº de veículos com valor (protegido/FIPE)
      linha[`tm_${c}`] = a.protegido > 0 ? Math.round(a.valorTotal / a.protegido) : 0;
    }
    // agregados "geral"
    const somaQtd = CATS.reduce((s, c) => s + acc[c].qtd, 0);
    const somaProt = CATS.reduce((s, c) => s + acc[c].protegido, 0);
    const somaValor = CATS.reduce((s, c) => s + acc[c].valorTotal, 0);
    linha["protegido_geral"] = somaProt;
    linha["valor_protegido_geral"] = Math.round(somaValor);
    linha["tm_geral"] = somaProt > 0 ? Math.round(somaValor / somaProt) : 0;

    // 5) upsert: um registro por associação/mês (pid_estudo_base)
    const { data: existente } = await supabase
      .from("pid_estudo_base")
      .select("id")
      .eq("corretora_id", corretora_id)
      .eq("data_referencia", ref)
      .maybeSingle();

    if (existente?.id) {
      const { error } = await supabase.from("pid_estudo_base").update(linha).eq("id", existente.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("pid_estudo_base").insert(linha);
      if (error) throw error;
    }

    // 5b) upsert total_associados/cadastros_realizados em pid_operacional
    // (mesmo mês/associação). Não mexe nos demais campos dessa tabela.
    const { data: pidExistente } = await supabase
      .from("pid_operacional")
      .select("id")
      .eq("corretora_id", corretora_id)
      .eq("ano", refAno)
      .eq("mes", refMes)
      .maybeSingle();

    if (pidExistente?.id) {
      const { error: pidErr } = await supabase
        .from("pid_operacional")
        .update({
          total_associados: totalAssociados,
          cadastros_realizados: cadastrosRealizados,
          placas_ativas: totalAtivos,
          inadimplentes: inadimplentesPersistir,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pidExistente.id);
      if (pidErr) throw pidErr;
    } else {
      const { error: pidErr } = await supabase.from("pid_operacional").insert({
        corretora_id,
        ano: refAno,
        mes: refMes,
        total_associados: totalAssociados,
        cadastros_realizados: cadastrosRealizados,
        placas_ativas: totalAtivos,
        inadimplentes: inadimplentesPersistir,
      });
      if (pidErr) throw pidErr;
    }

    // Snapshot DIÁRIO da frota (placas ativas + inadimplentes) para o gráfico
    // "Evolução da Frota Protegida" no modo Dia. Uma linha por associação/dia.
    try {
      const hojeStr = new Date().toISOString().slice(0, 10);
      const { data: snapExist } = await supabase
        .from("pid_placas_diario")
        .select("id")
        .eq("corretora_id", corretora_id)
        .eq("data", hojeStr)
        .maybeSingle();
      const snapRow = {
        corretora_id,
        data: hojeStr,
        placas_ativas: totalAtivos,
        inadimplentes: inadimplentesPersistir ?? 0,
        updated_at: new Date().toISOString(),
      };
      if (snapExist?.id) {
        await supabase.from("pid_placas_diario").update(snapRow).eq("id", snapExist.id);
      } else {
        await supabase.from("pid_placas_diario").insert(snapRow);
      }
    } catch (_snapErr) {
      /* snapshot diário é best-effort */
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Estudo de Base agregado (${totalGeral} veículos, mês ${ref.slice(0, 7)})`,
      data_referencia: ref,
      total: totalGeral,
      total_ativos: totalAtivos,
      total_inadimplentes: totalInadimplentes,
      total_associados: totalAssociados,
      cadastros_realizados: cadastrosRealizados,
      por_categoria: Object.fromEntries(CATS.map((c) => [c, acc[c].qtd])),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: String((e as Error)?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
