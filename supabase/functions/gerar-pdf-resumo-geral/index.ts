import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// Gera um PDF de 1 página com o Resumo executivo (Financeiro + Eventos + MGF +
// Destaques), sobe no Supabase Storage (bucket público "relatorios-whatsapp")
// e devolve uma URL pública + nome de arquivo prontos para anexar como
// header.document num template da Meta (WhatsApp).
//
// Layout "clean e moderno" aprovado pelo usuário: fundo branco, logo real da
// Vangard (/images/vangard-logo.png) no cabeçalho, seções em formato de
// tabela (linha + borda inferior) em vez de cards, acento laranja único.
// Rodapé discreto (uma linha pequena e cinza) com a assinatura da Vangard —
// sem botão. Pagina automaticamente (cabeçalho compacto repetido) quando o
// conteúdo passa de uma página. "Referência" = data de emissão do relatório.
//
// Reaproveita o mesmo agregador de dados já usado na mensagem de texto
// (gerar-resumo-geral), então o conteúdo do PDF é sempre consistente com o
// que já é enviado por WhatsApp/telas do BI — sem duplicar lógica de cálculo.
// ============================================================================

const BLACK = rgb(17 / 255, 17 / 255, 17 / 255); // #111111
const ORANGE = rgb(255 / 255, 107 / 255, 26 / 255); // #FF6B1A
const GRAY_TEXT = rgb(107 / 255, 114 / 255, 128 / 255); // #6B7280 (label)
const GRAY_MUTED = rgb(119 / 255, 119 / 255, 119 / 255); // #777777 (footer/legenda)
const CARD_BG = rgb(250 / 255, 250 / 255, 250 / 255); // #FAFAFA
const CARD_BORDER = rgb(239 / 255, 239 / 255, 239 / 255); // #EFEFEF
const ROW_BORDER = rgb(236 / 255, 236 / 255, 236 / 255); // #ECECEC
const GREEN_SUCCESS = rgb(22 / 255, 163 / 255, 74 / 255); // #16A34A
const WHITE = rgb(1, 1, 1);

const PAINEL_BASE = "https://vangard.uon1.com.br";
const LOGO_URL = `${PAINEL_BASE}/images/vangard-logo.png`;

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

    // ----- Data de emissão (São Paulo, UTC-3) — usada no cabeçalho, no card
    // "Referência" e no nome do arquivo/caminho no Storage. -----
    const nowSP = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const dataEmissao = `${pad2(nowSP.getUTCDate())}/${pad2(nowSP.getUTCMonth() + 1)}/${nowSP.getUTCFullYear()}`;
    const dataLabelArquivo = `${pad2(nowSP.getUTCDate())}-${pad2(nowSP.getUTCMonth() + 1)}-${nowSP.getUTCFullYear()}`;

    // ----- Base: total de placas ativas + cadastros do mês por cooperativa -----
    let placasAtivas = 0;
    let cadastrosPorCoop: { coop: string; qtd: number }[] = [];
    let cadastrosTotalMes = 0;
    try {
      // Placas ativas: usa o valor AGREGADO (pid_operacional.placas_ativas),
      // mesma fonte do KPI do dashboard (isAtivo: exclui inadimplente/inativo).
      // Evita count ad-hoc que inflava o número.
      const { data: pidRow } = await supabase
        .from("pid_operacional")
        .select("placas_ativas")
        .eq("corretora_id", corretora_id)
        .order("ano", { ascending: false })
        .order("mes", { ascending: false })
        .limit(1)
        .maybeSingle();
      placasAtivas = Number((pidRow as { placas_ativas?: number } | null)?.placas_ativas ?? 0);

      // Cadastros do mês por cooperativa: veículos com data_contrato dentro do
      // mês corrente, na base ativa. (Depende de data_contrato preenchido — só
      // é gravado a partir do fix recente do importador; meses/bases antigas
      // podem vir sem data e portanto zerados.)
      const { data: impBase } = await supabase
        .from("estudo_base_importacoes")
        .select("id")
        .eq("corretora_id", corretora_id)
        .eq("ativo", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (impBase?.id) {
        const anoAtual = nowSP.getUTCFullYear();
        const mesAtual = nowSP.getUTCMonth() + 1;
        const primeiroDia = `${anoAtual}-${pad2(mesAtual)}-01`;
        const proxAno = mesAtual === 12 ? anoAtual + 1 : anoAtual;
        const proxMes = mesAtual === 12 ? 1 : mesAtual + 1;
        const primeiroDiaProx = `${proxAno}-${pad2(proxMes)}-01`;
        const { data: novos } = await supabase
          .from("estudo_base_registros")
          .select("cooperativa, data_contrato")
          .eq("importacao_id", impBase.id)
          .gte("data_contrato", primeiroDia)
          .lt("data_contrato", primeiroDiaProx)
          .limit(50000);
        const mapa = new Map<string, number>();
        (novos || []).forEach((r: any) => {
          const coop = ((r.cooperativa || "").toString().trim()) || "Sem cooperativa";
          mapa.set(coop, (mapa.get(coop) || 0) + 1);
        });
        cadastrosPorCoop = [...mapa.entries()]
          .map(([coop, qtd]) => ({ coop, qtd }))
          .sort((a, b) => b.qtd - a.qtd);
        cadastrosTotalMes = cadastrosPorCoop.reduce((acc, c) => acc + c.qtd, 0);
      }
    } catch (e) {
      console.warn("[gerar-pdf-resumo-geral] Falha ao buscar base/cadastros:", e);
    }

    // ---- Monta o PDF ----
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([595.28, 841.89]); // A4
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const { width } = page.getSize();
    const marginX = 48;
    let y = 841.89;

    // Logo real da Vangard — busca o PNG estático do próprio app e embute no PDF.
    // Se falhar (rede indisponível etc.), cai para um wordmark em texto.
    let logoImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
    try {
      const logoRes = await fetch(LOGO_URL);
      if (logoRes.ok) {
        const logoBytes = new Uint8Array(await logoRes.arrayBuffer());
        logoImage = await pdfDoc.embedPng(logoBytes);
      }
    } catch (_e) {
      logoImage = null;
    }

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
        color: opts.color ?? BLACK,
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

    // ----- Cabeçalho: logo à esquerda, título à direita, linha de baixo -----
    const topPad = 50;
    y -= topPad;

    if (logoImage) {
      const targetH = 44;
      const scale = targetH / logoImage.height;
      const logoW = logoImage.width * scale;
      page.drawImage(logoImage, { x: marginX, y: y - targetH, width: logoW, height: targetH });
    } else {
      drawText("VANGARD", marginX, y - 16, { size: 15, font: fontBold, color: BLACK });
      drawText("G E S T O R A", marginX, y - 28, { size: 7, font: fontRegular, color: GRAY_MUTED });
    }

    drawTextRight("Resumo executivo", width - marginX, y - 20, { size: 22, font: fontBold, color: BLACK });
    drawTextRight(dataEmissao, width - marginX, y - 36, {
      size: 11,
      color: GRAY_TEXT,
    });
    drawTextRight(`Gerado em ${dados.data_geracao || "-"}`, width - marginX, y - 50, {
      size: 9,
      color: GRAY_TEXT,
    });

    y -= 64;
    page.drawRectangle({ x: marginX, y: y - 2, width: width - marginX * 2, height: 2, color: rgb(236 / 255, 236 / 255, 236 / 255) });
    y -= 30;

    // ----- Cards de contexto: Operação | Referência (data de emissão) -----
    const cardW = (width - marginX * 2 - 16) / 2;
    const cardH = 54;
    const drawInfoCard = (x: number, label: string, value: string) => {
      page.drawRectangle({
        x,
        y: y - cardH,
        width: cardW,
        height: cardH,
        color: CARD_BG,
        borderColor: CARD_BORDER,
        borderWidth: 1,
      });
      drawText(label, x + 16, y - 20, { size: 9, color: GRAY_MUTED });
      drawText(value, x + 16, y - 38, { size: 14, font: fontBold, color: BLACK });
    };
    drawInfoCard(marginX, "Operação", nomeAssociacao.toUpperCase());
    drawInfoCard(marginX + cardW + 16, "Referência", dataEmissao);
    y -= cardH + 28;

    // ----- Paginação: cabeçalho compacto repetido nas páginas seguintes -----
    const PAGE_H = 841.89;
    const drawHeaderCompacto = () => {
      let hy = PAGE_H - 50;
      if (logoImage) {
        const targetH = 30;
        const scale = targetH / logoImage.height;
        page.drawImage(logoImage, { x: marginX, y: hy - targetH, width: logoImage.width * scale, height: targetH });
      } else {
        drawText("VANGARD", marginX, hy - 14, { size: 13, font: fontBold, color: BLACK });
      }
      drawTextRight("Resumo executivo", width - marginX, hy - 16, { size: 16, font: fontBold, color: BLACK });
      hy -= 42;
      page.drawRectangle({ x: marginX, y: hy - 2, width: width - marginX * 2, height: 2, color: rgb(236 / 255, 236 / 255, 236 / 255) });
      y = hy - 26;
    };
    const novaPagina = () => {
      page = pdfDoc.addPage([595.28, PAGE_H]);
      drawHeaderCompacto();
    };
    const garantirEspaco = (necessario: number) => {
      if (y - necessario < 70) novaPagina();
    };

    // ----- Helper: seção em formato de tabela (título com barra + linhas) -----
    type Row = { label: string; value: string; color?: ReturnType<typeof rgb> };
    const drawTableSection = (title: string, rows: Row[]) => {
      garantirEspaco(30 + rows.length * 26 + 12);
      page.drawRectangle({ x: marginX, y: y - 14, width: 4, height: 14, color: ORANGE });
      drawText(title.toUpperCase(), marginX + 14, y - 11, { size: 11, font: fontBold, color: BLACK });
      y -= 30;

      const rowH = 26;
      rows.forEach((r) => {
        drawText(r.label, marginX, y, { size: 10, color: GRAY_TEXT });
        drawTextRight(r.value, width - marginX, y, { size: 11.5, font: fontBold, color: r.color ?? BLACK });
        page.drawRectangle({ x: marginX, y: y - 10, width: width - marginX * 2, height: 0.75, color: ROW_BORDER });
        y -= rowH;
      });
      y -= 12;
    };

    // ----- Financeiro -----
    if (modulos.cobranca) {
      drawTableSection("Financeiro", [
        { label: "Faturamento esperado", value: String(dados.cob_faturamento_esperado ?? "-") },
        { label: "Faturamento recebido", value: String(dados.cob_faturamento_recebido ?? "-"), color: GREEN_SUCCESS },
        { label: "Valor em aberto", value: String(dados.cob_total_aberto ?? "-"), color: ORANGE },
        { label: "Boletos gerados", value: String(dados.cob_total_gerados ?? "-") },
        { label: "Boletos baixados", value: String(dados.cob_total_baixados ?? "-") },
        { label: "Inadimplência", value: String(dados.cob_percentual_inadimplencia ?? "-"), color: ORANGE },
      ]);
    }

    // ----- Eventos -----
    if (modulos.eventos) {
      drawTableSection("Eventos", [
        { label: "Total de eventos", value: String(dados.ev_total ?? "-") },
        { label: "Colisão", value: String(dados.ev_colisao ?? "-") },
        { label: "Vidros", value: String(dados.ev_vidros ?? "-") },
        { label: "Furto/Roubo", value: String(dados.ev_furto_roubo ?? "-") },
        { label: "Outros", value: String(dados.ev_outros ?? "-") },
        { label: "Cidade com mais eventos", value: String(dados.ev_cidade_top ?? "-") },
        { label: "Cooperativa com mais eventos", value: String(dados.ev_cooperativa_top ?? "-") },
      ]);
    }

    // ----- MGF -----
    if (modulos.mgf) {
      drawTableSection("MGF — lançamentos do mês", [
        { label: "Total de lançamentos", value: String(dados.mgf_total_lancamentos ?? "-") },
        { label: "Valor total", value: `R$ ${dados.mgf_valor_total ?? "-"}` },
        { label: "Pagos", value: String(dados.mgf_pagos ?? "-") },
        { label: "Valor pago", value: `R$ ${dados.mgf_valor_pago ?? "-"}`, color: GREEN_SUCCESS },
        { label: "Em aberto", value: String(dados.mgf_em_aberto ?? "-") },
        { label: "Valor em aberto", value: `R$ ${dados.mgf_valor_aberto ?? "-"}`, color: ORANGE },
        { label: "Operação mais frequente", value: String(dados.mgf_top_operacao ?? "-") },
      ]);
    }

    // ----- Destaques -----
    if (modulos.cobranca) {
      drawTableSection("Destaques", [
        { label: "Maior inadimplência", value: String(dados.cob_coop_maior_inadimplencia ?? "-") },
        { label: "Menor inadimplência", value: String(dados.cob_coop_menor_inadimplencia ?? "-"), color: GREEN_SUCCESS },
      ]);
    }

    // ----- Base -----
    drawTableSection("Base", [
      { label: "Total de placas ativas", value: placasAtivas.toLocaleString("pt-BR") },
    ]);

    // ----- Cadastros do mês (por cooperativa) -----
    {
      const rowsCad: Row[] = cadastrosPorCoop.length > 0
        ? cadastrosPorCoop.map((c) => ({ label: c.coop, value: `${c.qtd.toLocaleString("pt-BR")} placas` }))
        : [{ label: "Nenhum cadastro no mês", value: "0 placas" }];
      rowsCad.push({
        label: "Total",
        value: `${cadastrosTotalMes.toLocaleString("pt-BR")} placas`,
        color: ORANGE,
      });
      drawTableSection("Cadastros do mês (por cooperativa)", rowsCad);
    }

    // ----- Rodapé discreto (sem botão) na última página -----
    {
      const fy = 44;
      page.drawRectangle({
        x: marginX,
        y: fy + 14,
        width: width - marginX * 2,
        height: 0.75,
        color: rgb(236 / 255, 236 / 255, 236 / 255),
      });
      drawText(
        "VANGARD  ·  Business Intelligence Operacional  ·  vangard.uon1.com.br/portal",
        marginX,
        fy,
        { size: 7.5, color: GRAY_MUTED },
      );
    }

    // ----- Numeração de páginas (1/N ... N/N), centralizada no rodapé -----
    const paginas = pdfDoc.getPages();
    const totalPag = paginas.length;
    const carimboDataHora = `Gerado em ${dados.data_geracao || dataEmissao}`;
    paginas.forEach((pg, i) => {
      const rotulo = `${i + 1}/${totalPag}`;
      const w = fontRegular.widthOfTextAtSize(rotulo, 8);
      pg.drawText(rotulo, { x: (width - w) / 2, y: 26, size: 8, font: fontRegular, color: GRAY_MUTED });
      // Data/hora de geração à direita, no rodapé de cada página.
      const dw = fontRegular.widthOfTextAtSize(carimboDataHora, 7.5);
      pg.drawText(carimboDataHora, { x: width - marginX - dw, y: 26, size: 7.5, font: fontRegular, color: GRAY_MUTED });
    });

    const pdfBytes = await pdfDoc.save();

    // ----- Upload no Storage -----
    const displayFilename = `Resumo_VANGARD_${dataLabelArquivo}.pdf`;
    const storagePath = `${corretora_id}/${Date.now()}-${dataLabelArquivo}.pdf`;

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
