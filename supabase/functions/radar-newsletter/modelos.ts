// Radar do mercado — textos padrão dos e-mails da newsletter.
// Os modelos ficam em email_templates (tipos radar_confirmacao e radar_novidades),
// editáveis em Central de Atendimento → E-mails → Templates. Sem modelo ativo,
// vale o texto abaixo. Variáveis no formato {{nome}}.

export type Valores = Record<string, string | null | undefined>;

// Variáveis inseridas cruas (links e blocos HTML prontos)
const CRUAS = new Set(["link_confirmar", "link_cancelar", "link_radar", "noticias"]);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function preencher(texto: string, v: Valores, html: boolean): string {
  return (texto ?? "").replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k: string) => {
    const chave = k.toLowerCase();
    const valor = String(v[chave] ?? "");
    return !html || CRUAS.has(chave) ? valor : esc(valor);
  });
}

const LOGO_UON1 = "https://uon1.com.br/assets/uon1-logo-CPDoIAps.png";
const LOGO_VANGARD = "https://vangard.uon1.com.br/images/logo-vangard.png";

const casca = (titulo: string, cabecalho: string, conteudo: string, rodape: string) => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title>
</head>
<body style="margin:0;padding:0;background:#f3f5fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5fb;">
<tr><td align="center" style="padding:32px 12px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e6ebf5;border-radius:20px;overflow:hidden;">

  <!-- CABEÇALHO -->
  <tr><td style="background:#0b1220;padding:22px 28px;border-bottom:4px solid #F06F19;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:600;color:#ffffff;">${cabecalho}</td>
      <td align="right" style="font-size:12px;color:#cbd5f5;">Vangard Gestora</td>
    </tr></table>
  </td></tr>

  <!-- CONTEÚDO -->
  <tr><td style="padding:28px;">
${conteudo}
  </td></tr>

  <!-- RODAPÉ -->
  <tr><td style="padding:20px;border-top:1px solid #eef2ff;text-align:center;">
    <table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr>
      <td style="padding:0 12px;"><img src="${LOGO_UON1}" alt="UON1" height="28" style="height:28px;display:block;border:0;"></td>
      <td style="padding:0 6px;"><div style="width:1px;height:26px;background:#dbe3f3;"></div></td>
      <td style="padding:0 12px;"><img src="${LOGO_VANGARD}" alt="Vangard Gestora" height="28" style="height:28px;display:block;border:0;"></td>
    </tr></table>
    <div style="margin-top:12px;font-size:11px;line-height:1.6;color:#94a3b8;">${rodape}</div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

export const PADRAO_CONFIRMACAO = {
  nome: "Radar do mercado — Confirmação de inscrição",
  assunto: "Confirme sua inscrição no Radar do mercado",
  corpo: casca(
    "Confirme sua inscrição - Radar do mercado",
    "📡 Radar do mercado",
    `    <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#362C89;">Newsletter</div>

    <p style="margin:10px 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:600;color:#0f172a;">Falta só confirmar seu e-mail</p>

    <p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:#475569;">
      Olá{{saudacao}}.<br><br>
      Recebemos o pedido para enviar a este endereço as novidades do <strong>Radar do mercado</strong>: o que órgãos oficiais
      e o setor publicam sobre proteção patrimonial mutualista e proteção veicular, reunido pela Vangard Gestora.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:16px;">
      <tr><td style="padding:16px 20px;">
        <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:6px;">✅ O que você autorizou</div>
        <div style="font-size:13px;line-height:1.7;color:#475569;">{{aceite}}</div>
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
      <tr><td align="center" style="background:#362C89;border-radius:14px;">
        <a href="{{link_confirmar}}" style="display:block;padding:16px;font-size:16px;font-weight:800;color:#ffffff;text-decoration:none;">Confirmar inscrição</a>
      </td></tr>
    </table>
    <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#94a3b8;word-break:break-all;">
      Se o botão não funcionar, copie e cole no navegador:<br>{{link_confirmar}}
    </p>

    <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#64748b;">
      Não foi você? É só ignorar este e-mail: sem a confirmação, nada será enviado.
    </p>`,
    "Você recebeu este e-mail porque este endereço foi informado na página do Radar do mercado.<br>Vangard Gestora · plataforma desenvolvida por <strong>UON1</strong>.",
  ),
};

export const PADRAO_NOVIDADES = {
  nome: "Radar do mercado — Novidades",
  assunto: "Radar do mercado: {{quantidade}} novidades de {{data}}",
  corpo: casca(
    "Radar do mercado - {{data}}",
    "📡 Radar do mercado",
    `    <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#F06F19;">Novidades de {{data}}</div>

    <p style="margin:10px 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:600;color:#0f172a;">{{quantidade}} matérias novas no Radar</p>

    <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#475569;">
      Olá{{saudacao}}. Estas são as publicações mais recentes de órgãos oficiais e do setor sobre proteção patrimonial
      mutualista e proteção veicular. Toque em uma matéria para ler no site de origem.
    </p>

{{noticias}}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
      <tr><td align="center" style="background:#362C89;border-radius:14px;">
        <a href="{{link_radar}}" style="display:block;padding:16px;font-size:16px;font-weight:800;color:#ffffff;text-decoration:none;">Ver o Radar completo</a>
      </td></tr>
    </table>`,
    `Você recebe este e-mail porque assinou a newsletter do Radar do mercado e autorizou comunicações da Vangard Gestora.<br>
    <a href="{{link_cancelar}}" style="color:#64748b;text-decoration:underline;">Cancelar inscrição</a> · Notícias de fontes públicas; o conteúdo pertence ao veículo de origem.`,
  ),
};

export interface Noticia {
  titulo: string;
  link: string | null;
  origem: string | null;
  categoria: string;
  publicado_em: string;
  /** comunicado: trecho da mensagem e imagem (opcionais) */
  resumo?: string | null;
  imagem?: string | null;
}

const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const trecho = (t: string, max = 220) => {
  const limpo = t.replace(/\s+/g, " ").trim();
  return limpo.length > max ? `${limpo.slice(0, max - 1).trimEnd()}…` : limpo;
};

const CHIPS: Record<string, { rotulo: string; fundo: string; cor: string; barra: string }> = {
  oficial: { rotulo: "ÓRGÃO OFICIAL", fundo: "#dbeafe", cor: "#1d4ed8", barra: "#362C89" },
  setor: { rotulo: "SETOR", fundo: "#f3e8ff", cor: "#7e22ce", barra: "#F06F19" },
  comunicado: { rotulo: "COMUNICADO", fundo: "#ffedd5", cor: "#c2410c", barra: "#F06F19" },
};

/**
 * Bloco HTML com a lista (vai em {{noticias}}). Notícias e comunicados
 * externos chegam já na ordem de publicação, do mais novo para o mais antigo.
 */
export function blocoNoticias(lista: Noticia[], linkRadar = ""): string {
  return lista
    .map((n) => {
      const c = CHIPS[n.categoria] ?? CHIPS.setor;
      const comunicado = n.categoria === "comunicado";
      const destino = n.link || (comunicado ? linkRadar : "");
      const chip = `<span style="display:inline-block;background:${c.fundo};color:${c.cor};padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;">${c.rotulo}</span>`;
      const imagem = comunicado && n.imagem
        ? `<img src="${esc(n.imagem)}" alt="" width="100%" style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:10px;margin-top:10px;">`
        : "";
      const titulo = destino
        ? `<a href="${esc(destino)}" style="display:block;margin-top:8px;font-size:15px;line-height:1.45;font-weight:700;color:#0f172a;text-decoration:none;">${esc(n.titulo)}</a>`
        : `<div style="margin-top:8px;font-size:15px;line-height:1.45;font-weight:700;color:#0f172a;">${esc(n.titulo)}</div>`;
      const resumo = comunicado && n.resumo
        ? `<div style="margin-top:6px;font-size:13px;line-height:1.5;color:#475569;">${esc(trecho(n.resumo))}</div>`
        : "";
      const acao = destino
        ? `<a href="${esc(destino)}" style="display:inline-block;margin-top:6px;font-size:12px;font-weight:700;color:#362C89;text-decoration:none;">${comunicado ? "Saiba mais" : "Ler na fonte"} ↗</a>`
        : "";
      return `    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;border:1px solid #e6ebf5;border-left:4px solid ${c.barra};border-radius:14px;">
      <tr><td style="padding:14px 18px;">
        <div style="font-size:12px;color:#64748b;">${chip}&nbsp; ${esc(n.origem ?? "")} · ${dataBR(n.publicado_em)}</div>
        ${imagem}${titulo}${resumo}${acao}
      </td></tr>
    </table>`;
    })
    .join("\n");
}
