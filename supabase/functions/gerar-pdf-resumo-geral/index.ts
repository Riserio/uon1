import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// Gera um PDF profissional de 1 página com o Resumo VANGARD (Eventos +
// Cobrança + MGF), sobe no Supabase Storage (bucket público "relatorios-
// whatsapp") e devolve uma URL pública + nome de arquivo prontos para anexar
// como header.document num template da Meta (WhatsApp).
//
// Reaproveita o mesmo agregador de dados já usado na mensagem de texto
// (gerar-resumo-geral), então o conteúdo do PDF é sempre consistente com o
// que já é enviado por WhatsApp/telas do BI — sem duplicar lógica de cálculo.
// ============================================================================

const NAVY = rgb(0.11, 0.15, 0.32);
const GOLD = rgb(0.78, 0.58, 0.14);
const GREEN = rgb(0.09, 0.55, 0.35);
const BLUE = rgb(0.14, 0.42, 0.75);
const PURPLE = rgb(0.45, 0.28, 0.68);
const GRAY_BG = rgb(0.96, 0.96, 0.97);
const GRAY_TEXT = rgb(0.35, 0.35, 0.38);
const DARK_TEXT = rgb(0.12, 0.12, 0.14);
const WHITE = rgb(1, 1, 1);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { corretora_id } = await req.json();
    if (!corretora_id) throw new Error("corretora_id é obrigatório");

    const { data: corretora } = await supabase
      .from("corretoras")
      .select("nome, slug")
      .eq("id", corretora_id)
      .single();
    const nomeAssociacao = corretora?.nome || "Associação";

    // Reaproveita o agregador oficial — mesma fonte de verdade da mensagem de texto.
    const resumoRes = await fetch(`${supabaseUrl}/functions/v1/gerar-resumo-geral`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
      body: JSON.stringify({ corretora_id }),
    });
    const resumoJson = await resumoRes.json();
    if (!resumoRes.ok || !resumoJson?.success) {
      throw new Error(resumoJson?.error || "Falha ao gerar dados do resumo");
    }
    const dados: Record<string, any> = resumoJson.dados || {};
    const modulos = resumoJson.modulos_incluidos || {};

    // ---- Monta o PDF ----
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const { width } = page.getSize();
    const marginX = 40;
    let y = 841.89;

    const drawText = (
      text: string,
      x: number,
      yy: number,
      opts: { size?: number; font?: typeof fontRegular; color?: ReturnType<typeof rgb> } = {},
    ) => {
      page.drawText(text, {
        x,
        y: yy,
        size: opts.size ?? 10,
        font: opts.font ?? fontRegular,
        color: opts.color ?? DARK_TEXT,
      });
    };

    // ----- Cabeçalho (faixa navy) -----
    const headerHeight = 96;
    page.drawRectangle({ x: 0, y: y - headerHeight, width, height: headerHeight, color: NAVY });
    drawText("RESUMO VANGARD", marginX, y - 34, { size: 20, font: fontBold, color: WHITE });
    drawText(`Operação: ${nomeAssociacao}`, marginX, y - 56, { size: 12, font: fontBold, color: GOLD });
    drawText(`Gerado em ${dados.data_geracao || "-"}`, marginX, y - 74, { size: 9, font: fontRegular, color: rgb(0.85, 0.85, 0.9) });
    y -= headerHeight + 24;

    // ----- Helper: desenha uma seção com barra colorida + grid label/valor -----
    const drawSection = (
      title: string,
      accent: ReturnType<typeof rgb>,
      rows: { label: string; value: string }[],
      periodo?: string,
    ) => {
      const rowH = 20;
      const sectionH = 34 + rows.length * rowH + 10;
      // fundo
      page.drawRectangle({ x: marginX, y: y - sectionH, width: width - marginX * 2, height: sectionH, color: GRAY_BG });
      // barra de destaque à esquerda
      page.drawRectangle({ x: marginX, y: y - sectionH, width: 5, height: sectionH, color: accent });
      // título
      drawText(title, marginX + 16, y - 22, { size: 13, font: fontBold, color: accent });
      if (periodo) {
        drawText(periodo, width - marginX - 16 - fontRegular.widthOfTextAtSize(periodo, 9), y - 22, {
          size: 9,
          color: GRAY_TEXT,
        });
      }
      let ry = y - 44;
      const colX2 = marginX + (width - marginX * 2) / 2 + 8;
      rows.forEach((r, i) => {
        const cx = i % 2 === 0 ? marginX + 16 : colX2;
        if (i % 2 === 0 && i > 0) ry -= rowH;
        drawText(r.label, cx, ry, { size: 9, color: GRAY_TEXT });
        drawText(r.value, cx, ry - 13, { size: 11.5, font: fontBold, color: DARK_TEXT });
      });
      y -= sectionH + 18;
    };

    // ----- Financeiro / Cobrança -----
    if (modulos.cobranca) {
      drawSection(
        "FATURAMENTO & COBRANÇA",
        GREEN,
        [
          { label: "Faturamento esperado", value: String(dados.cob_faturamento_esperado ?? "-") },
          { label: "Faturamento recebido", value: String(dados.cob_faturamento_recebido ?? "-") },
          { label: "Valor em aberto", value: String(dados.cob_total_aberto ?? "-") },
          { label: "Inadimplência geral", value: String(dados.cob_percentual_inadimplencia ?? "-") },
          { label: "Boletos gerados", value: String(dados.cob_total_gerados ?? "-") },
          { label: "Boletos baixados", value: String(dados.cob_total_baixados ?? "-") },
          { label: "Maior inadimplência", value: String(dados.cob_coop_maior_inadimplencia ?? "-") },
          { label: "Menor inadimplência", value: String(dados.cob_coop_menor_inadimplencia ?? "-") },
        ],
        dados.cob_mes_referencia ? `Ref: ${dados.cob_mes_referencia}` : undefined,
      );
    }

    // ----- Eventos -----
    if (modulos.eventos) {
      drawSection(
        "EVENTOS",
        BLUE,
        [
          { label: "Total de eventos", value: String(dados.ev_total ?? "-") },
          { label: "Colisão", value: String(dados.ev_colisao ?? "-") },
          { label: "Vidros", value: String(dados.ev_vidros ?? "-") },
          { label: "Furto/Roubo", value: String(dados.ev_furto_roubo ?? "-") },
          { label: "Outros", value: String(dados.ev_outros ?? "-") },
          { label: "Cidade com mais eventos", value: String(dados.ev_cidade_top ?? "-") },
          { label: "Cooperativa com mais eventos", value: String(dados.ev_cooperativa_top ?? "-") },
        ],
        dados.ev_mes_referencia ? `Ref: ${dados.ev_mes_referencia}` : undefined,
      );
    }

    // ----- MGF -----
    if (modulos.mgf) {
      drawSection("MGF — LANÇAMENTOS DO MÊS", PURPLE, [
        { label: "Total de lançamentos", value: String(dados.mgf_total_lancamentos ?? "-") },
        { label: "Valor total", value: `R$ ${dados.mgf_valor_total ?? "-"}` },
        { label: "Pagos", value: String(dados.mgf_pagos ?? "-") },
        { label: "Valor pago", value: `R$ ${dados.mgf_valor_pago ?? "-"}` },
        { label: "Em aberto", value: String(dados.mgf_em_aberto ?? "-") },
        { label: "Valor em aberto", value: `R$ ${dados.mgf_valor_aberto ?? "-"}` },
        { label: "Operação mais frequente", value: String(dados.mgf_top_operacao ?? "-") },
      ]);
    }

    // ----- Rodapé -----
    const slug = corretora?.slug;
    const painelUrl = slug ? `https://uon1.com.br/${slug}/dashboard` : null;
    drawText("Consulte o painel completo para mais detalhes e histórico.", marginX, 50, {
      size: 9,
      color: GRAY_TEXT,
    });
    if (painelUrl) {
      drawText(painelUrl, marginX, 36, { size: 9, font: fontBold, color: BLUE });
    }
    drawText("VANGARD · Business Intelligence Operacional", marginX, 20, { size: 8, color: GRAY_TEXT });

    const pdfBytes = await pdfDoc.save();

    // ----- Upload no Storage -----
    const now = new Date(Date.now() - 3 * 60 * 60 * 1000); // UTC-3
    const pad = (n: number) => String(n).padStart(2, "0");
    const dataLabel = `${pad(now.getUTCDate())}-${pad(now.getUTCMonth() + 1)}-${now.getUTCFullYear()}`;
    const displayFilename = `Resumo_VANGARD_${dataLabel}.pdf`;
    const storagePath = `${corretora_id}/${Date.now()}-${dataLabel}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("relatorios-whatsapp")
      .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw new Error(`Erro ao salvar PDF no storage: ${uploadError.message}`);

    const { data: publicUrlData } = supabase.storage.from("relatorios-whatsapp").getPublicUrl(storagePath);
    const url = publicUrlData?.publicUrl;
    if (!url) throw new Error("Falha ao gerar URL pública do PDF");

    return new Response(
      JSON.stringify({
        success: true,
        url,
        filename: displayFilename,
        path: storagePath,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("[gerar-pdf-resumo-geral] Erro:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
