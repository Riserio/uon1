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
// Paleta e tipografia seguem o design system do app (src/index.css):
// --primary 247 51% 35% (indigo), --foreground 222 47% 11% (navy escuro),
// --muted 220 14% 96%, --border 220 13% 91%, --muted-foreground 220 9% 46%,
// --chart-1..4 (azul, verde-água, âmbar, roxo) — mesmas cores usadas nos
// gráficos e cards das telas de Eventos/Cobrança/MGF.
//
// Reaproveita o mesmo agregador de dados já usado na mensagem de texto
// (gerar-resumo-geral), então o conteúdo do PDF é sempre consistente com o
// que já é enviado por WhatsApp/telas do BI — sem duplicar lógica de cálculo.
// ============================================================================

// Cores convertidas de HSL (design system) para RGB 0-1
const PRIMARY = rgb(54 / 255, 44 / 255, 135 / 255); // --primary 247 51% 35% (indigo)
const NAVY_TEXT = rgb(15 / 255, 23 / 255, 41 / 255); // --foreground 222 47% 11%
const AMBER = rgb(250 / 255, 177 / 255, 30 / 255); // --chart-3 40 96% 55%
const CHART_BLUE = rgb(43 / 255, 108 / 255, 238 / 255); // --chart-1 220 85% 55%
const CHART_TEAL = rgb(26 / 255, 188 / 255, 156 / 255); // --chart-2 168 76% 42%
const CHART_PURPLE = rgb(153 / 255, 82 / 255, 224 / 255); // --chart-4 270 70% 60%
const MUTED_BG = rgb(243 / 255, 244 / 255, 246 / 255); // --muted 220 14% 96%
const BORDER = rgb(229 / 255, 231 / 255, 235 / 255); // --border 220 13% 91%
const MUTED_TEXT = rgb(107 / 255, 114 / 255, 128 / 255); // --muted-foreground 220 9% 46%
const WHITE = rgb(1, 1, 1);
const PRIMARY_TINT = rgb(0.86, 0.85, 0.94); // indigo bem clarinho p/ texto sobre fundo primary

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
        color: opts.color ?? NAVY_TEXT,
      });
    };

    const drawTextRight = (
      text: string,
      xRight: number,
      yy: number,
      opts: { size?: number; font?: typeof fontRegular; color?: ReturnType<typeof rgb> } = {},
    ) => {
      const size = opts.size ?? 10;
      const font = opts.font ?? fontRegular;
      const w = font.widthOfTextAtSize(text, size);
      drawText(text, xRight - w, yy, { size, font, color: opts.color });
    };

    // ----- Cabeçalho (faixa indigo — cor --primary do design system) -----
    const headerHeight = 108;
    page.drawRectangle({ x: 0, y: y - headerHeight, width, height: headerHeight, color: PRIMARY });
    // linha de destaque âmbar no rodapé do cabeçalho, mesmo acento usado em cards de destaque do app
    page.drawRectangle({ x: 0, y: y - headerHeight, width, height: 3, color: AMBER });
    drawText("RESUMO VANGARD", marginX, y - 38, { size: 21, font: fontBold, color: WHITE });
    drawText(nomeAssociacao.toUpperCase(), marginX, y - 60, { size: 12, font: fontBold, color: AMBER });
    drawText(`Gerado em ${dados.data_geracao || "-"}`, marginX, y - 82, {
      size: 9,
      font: fontRegular,
      color: PRIMARY_TINT,
    });
    y -= headerHeight + 26;

    // ----- Helper: desenha uma seção (card) com barra colorida + grid label/valor -----
    const drawSection = (
      title: string,
      accent: ReturnType<typeof rgb>,
      rows: { label: string; value: string }[],
      periodo?: string,
    ) => {
      const rowH = 32;
      const titleAreaH = 32;
      const bottomPad = 16;
      const numRows = Math.ceil(rows.length / 2);
      const sectionH = titleAreaH + numRows * rowH + bottomPad;

      // fundo do card + borda sutil (mesmo padrão dos cards do app: fundo muted, borda leve)
      page.drawRectangle({
        x: marginX,
        y: y - sectionH,
        width: width - marginX * 2,
        height: sectionH,
        color: MUTED_BG,
        borderColor: BORDER,
        borderWidth: 1,
      });
      // barra de destaque à esquerda (mesma cor do chart da seção)
      page.drawRectangle({ x: marginX, y: y - sectionH, width: 4, height: sectionH, color: accent });

      // título
      drawText(title, marginX + 18, y - 23, { size: 12.5, font: fontBold, color: accent });
      if (periodo) {
        drawTextRight(periodo, width - marginX - 18, y - 23, { size: 8.5, color: MUTED_TEXT });
      }

      // linha divisória entre título e grid
      page.drawRectangle({
        x: marginX + 1,
        y: y - titleAreaH,
        width: width - marginX * 2 - 2,
        height: 0.75,
        color: BORDER,
      });

      let ry = y - titleAreaH - 20;
      const colX2 = marginX + (width - marginX * 2) / 2 + 10;
      rows.forEach((r, i) => {
        const cx = i % 2 === 0 ? marginX + 18 : colX2;
        if (i % 2 === 0 && i > 0) ry -= rowH;
        drawText(r.label, cx, ry, { size: 8.5, font: fontRegular, color: MUTED_TEXT });
        drawText(r.value, cx, ry - 16, { size: 12.5, font: fontBold, color: NAVY_TEXT });
      });
      y -= sectionH + 20;
    };

    // ----- Financeiro / Cobrança -----
    if (modulos.cobranca) {
      drawSection(
        "FATURAMENTO & COBRANÇA",
        CHART_TEAL,
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
        CHART_BLUE,
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
      drawSection("MGF — LANÇAMENTOS DO MÊS", CHART_PURPLE, [
        { label: "Total de lançamentos", value: String(dados.mgf_total_lancamentos ?? "-") },
        { label: "Valor total", value: `R$ ${dados.mgf_valor_total ?? "-"}` },
        { label: "Pagos", value: String(dados.mgf_pagos ?? "-") },
        { label: "Valor pago", value: `R$ ${dados.mgf_valor_pago ?? "-"}` },
        { label: "Em aberto", value: String(dados.mgf_em_aberto ?? "-") },
        { label: "Valor em aberto", value: `R$ ${dados.mgf_valor_aberto ?? "-"}` },
        { label: "Operação mais frequente", value: String(dados.mgf_top_operacao ?? "-") },
      ]);
    }

    // ----- Rodapé: CTA "Abrir Painel" (botão sólido cor --primary, igual aos botões do app) -----
    const slug = corretora?.slug;
    const painelUrl = slug ? `https://uon1.com.br/${slug}/dashboard` : null;

    const footerY = 92;
    page.drawRectangle({
      x: marginX,
      y: footerY - 0.75,
      width: width - marginX * 2,
      height: 0.75,
      color: BORDER,
    });

    if (painelUrl) {
      const btnH = 30;
      const btnW = 150;
      const btnY = footerY - 20 - btnH;
      page.drawRectangle({ x: marginX, y: btnY, width: btnW, height: btnH, color: PRIMARY });
      drawText("Abrir Painel  →", marginX + 18, btnY + 10.5, { size: 10.5, font: fontBold, color: WHITE });
      drawText(painelUrl, marginX + btnW + 14, btnY + 10.5, { size: 9, font: fontRegular, color: MUTED_TEXT });
    } else {
      drawText("Consulte o painel completo para mais detalhes e histórico.", marginX, footerY - 30, {
        size: 9,
        color: MUTED_TEXT,
      });
    }

    drawText("VANGARD · Business Intelligence Operacional", marginX, 22, { size: 8, color: MUTED_TEXT });

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
