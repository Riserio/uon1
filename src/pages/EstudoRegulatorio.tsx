/**
 * Estudo Regulatório — página pública (sem login).
 * Rota: /biblioteca/estudoregulatorio
 *
 * O conteúdo é servido como HTML estático de alta fidelidade
 * (public/estudo-regulatorio.html) e embutido aqui em tela cheia,
 * preservando exatamente o design (marinho/laranja, serifado) e as
 * interações (Consultar / Resumo / Modo estudo).
 */
export default function EstudoRegulatorio() {
  return (
    <iframe
      src="/estudo-regulatorio.html"
      title="Estudo Regulatório"
      className="fixed inset-0 h-full w-full border-0"
    />
  );
}
