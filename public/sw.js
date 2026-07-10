// Service worker mínimo do PWA Vangard.
//
// Propósito: só ter um service worker ATIVO já é parte do critério de
// "instalabilidade real" que Android/Chrome (e outros navegadores) usam
// pra decidir se oferecem o app como instalável de verdade (ícone na tela
// inicial, abre em janela própria, aparece no seletor de apps do SO) em vez
// de tratá-lo como um simples atalho de navegador.
//
// DE PROPÓSITO não fazemos cache de nada aqui. O app é uma SPA (Vite) com
// nomes de arquivo com hash que mudam a cada deploy — se cachéssemos os
// chunks JS/CSS, um usuário que instalou o PWA ficaria preso numa versão
// antiga (tela branca / erro de chunk) até fechar e abrir o app de novo. A
// própria src/main.tsx já tem lógica de auto-reload pra esse cenário
// assumindo que NÃO existe cache de service worker no meio do caminho —
// então esse service worker só repassa a requisição pra rede, sempre.
self.addEventListener("install", () => {
  // Ativa a versão nova imediatamente, sem esperar todas as abas fecharem.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass-through puro: sem cache, sempre busca da rede. Mantém o app
  // sempre atualizado após cada deploy, mesmo com o service worker ativo.
  event.respondWith(fetch(event.request));
});
