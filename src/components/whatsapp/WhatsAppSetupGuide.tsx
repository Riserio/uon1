/**
 * Guia de configuração do WhatsApp em 3 passos — DESATIVADO.
 *
 * Foi criado para orientar quem estava começando ("por onde eu começo?"), mas
 * com a integração já em produção ele só ocupava o topo da tela repetindo
 * informação que as próprias abas mostram (números conectados, templates
 * criados). Sem finalidade prática no uso diário.
 *
 * Mantido como componente que devolve null em vez de removido: quem chama
 * (a página da Central de Atendimento) continua compilando sem alteração, e
 * reativar é trocar uma linha caso um dia faça sentido para onboarding.
 */
export function WhatsAppSetupGuide(_props: { onNavigate: (aba: string) => void }) {
  return null;
}
