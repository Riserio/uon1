// Identidade visual da Vangard usada em e-mails, PDFs e automações.
// As imagens ficam no armazenamento público (bucket app-config), assim os
// e-mails não dependem do site estar publicado. Ao trocar a marca, suba os
// arquivos com um NOME NOVO (programas de e-mail guardam cópia da imagem
// antiga pelo endereço) e atualize só estas constantes.
const BASE = "https://mnoczwmqgignmylbvpgp.supabase.co/storage/v1/object/public/app-config/marca";

/** Logo com a palavra escura — para fundo claro. Proporção ~2,23:1. */
export const LOGO_VANGARD_URL = `${BASE}/vangard-logo-2026.png`;
/** Logo com a palavra em branco — para fundo escuro. */
export const LOGO_VANGARD_BRANCA_URL = `${BASE}/vangard-logo-branca-2026.png`;
/** Só o símbolo. */
export const SIMBOLO_VANGARD_URL = `${BASE}/vangard-simbolo-2026.png`;

/** <img> pronto para e-mail. `fundo` escolhe a versão da palavra. */
export function imgLogoVangard(altura = 32, fundo: "claro" | "escuro" = "claro"): string {
  const src = fundo === "escuro" ? LOGO_VANGARD_BRANCA_URL : LOGO_VANGARD_URL;
  const largura = Math.round(altura * 2.23);
  return `<img src="${src}" alt="Vangard" width="${largura}" height="${altura}" style="height:${altura}px;width:${largura}px;display:inline-block;border:0;outline:none;text-decoration:none;" />`;
}
