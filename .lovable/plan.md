
Duas entregas independentes nesta tarefa.

---

## 1) Módulo "Formulários" (estilo Google Forms)

Construtor de formulários públicos com gestão interna completa. Inspirado no formulário compartilhado ("CHECKLIST DE CADASTRO") — perguntas de texto curto, texto longo, escolha única (radio), múltipla escolha (checkbox), dropdown, número, data, e-mail.

### Telas
- **Menu lateral "Formulários"** (item novo no `AppSidebar`, com permissão `formularios` em `role_menu_permissions`).
- **`/formularios`** — listagem (cards/tabela) com: título, status (rascunho/publicado), nº de respostas, link público, ações (editar, duplicar, publicar/despublicar, copiar link, excluir).
- **`/formularios/novo` e `/formularios/:id/editar`** — construtor:
  - Cabeçalho: título, descrição, cor do tema, logo opcional.
  - Lista de perguntas (drag-and-drop com `@dnd-kit`), cada uma com: enunciado, tipo, obrigatório, opções (quando aplicável), descrição/ajuda.
  - Configurações: aceitar múltiplas respostas do mesmo IP, exibir mensagem de agradecimento personalizada, redirecionar após enviar, fechar em data X, limitar nº respostas.
- **`/formularios/:id/respostas`** — visualização das respostas:
  - Aba "Resumo" (gráficos por pergunta de escolha — Recharts).
  - Aba "Individual" (navegação resposta-a-resposta).
  - Aba "Tabela" com exportação CSV/XLSX.
- **`/f/:slug`** — página pública de preenchimento (sem autenticação), branding da associação, validação Zod, captcha simples (honeypot), confirmação ao enviar.

### Backend (Lovable Cloud)
Tabelas novas:
- `formularios` (id, corretora_id, titulo, descricao, slug único, cor_tema, logo_url, status, config jsonb, criado_por, created_at, updated_at).
- `formulario_perguntas` (id, formulario_id, ordem, tipo, enunciado, descricao, obrigatorio, opcoes jsonb, validacao jsonb).
- `formulario_respostas` (id, formulario_id, ip, user_agent, enviado_em, dados jsonb).

RLS:
- `formularios`/`perguntas`: leitura pública apenas para `status='publicado'`; CRUD restrito a usuários autenticados da `corretora_id`.
- `formulario_respostas`: INSERT público (anon); SELECT apenas autenticados da corretora dona.

Edge function `submit-formulario` para receber respostas públicas (valida obrigatórios, rate-limit por IP via tabela `formulario_rate_limit`, registra no banco).

### Seed
Criar automaticamente o formulário "CHECKLIST DE CADASTRO" com as 10 perguntas exatas do link compartilhado, em rascunho, pronto para publicar.

---

## 2) Aprovação de dispositivo para bater ponto

Hoje qualquer dispositivo logado bate ponto. Vamos travar para **dispositivos aprovados** por colaborador.

### Comportamento
- Primeira batida de um colaborador em um navegador/dispositivo novo:
  - Gera um **fingerprint** do dispositivo (combinação de: hash do user-agent + plataforma + screen + timezone + canvas hash — via `@fingerprintjs/fingerprintjs` open-source) **e** captura o **IP** público.
  - Em vez de registrar o ponto, cria uma **solicitação de aprovação** (`dispositivos_ponto`, status `pendente`) e mostra: *"Este dispositivo precisa ser aprovado pelo gestor antes da primeira batida."*
  - Notifica o gestor (badge no menu + linha em "Aprovações de Dispositivo").
- Próximas batidas:
  - Recalcula fingerprint. Se bater com um dispositivo `aprovado` do colaborador → permite ponto.
  - Se for outro → bloqueia com a mesma mensagem e cria nova solicitação.
- Gestor aprova/recusa, podendo opcionalmente fixar o IP como obrigatório.

### Telas
- **Configurações → Ponto**: switches "Exigir aprovação de dispositivo" e "Travar também por IP".
- **Nova página `/ponto/dispositivos`** (menu dentro de Gestão/Ponto):
  - Tabs: **Pendentes** (com badge laranja no menu) | **Aprovados** | **Bloqueados**.
  - Por linha: colaborador, fingerprint resumido, navegador, SO, IP, data da solicitação, ações Aprovar/Recusar/Revogar.
- **Tela de bater ponto**: bloqueio com card explicando o motivo + botão "Solicitar aprovação".

### Backend
Tabela `dispositivos_ponto`:
- id, funcionario_id, fingerprint (texto, hash), user_agent, plataforma, ip, status (`pendente`/`aprovado`/`bloqueado`), aprovado_por, aprovado_em, exigir_ip (bool), observacao, created_at.
- Índice único parcial: `(funcionario_id, fingerprint)` quando `status <> 'bloqueado'`.

Edge function `validar-dispositivo-ponto` (chamada antes de inserir em `registros_ponto`):
- Recebe `funcionario_id`, `fingerprint`, `ip`, `user_agent`.
- Retorna `{ permitido: bool, motivo, dispositivo_id }`.
- Cria solicitação automática quando não permitido.

Ajustar o fluxo atual de bater ponto (`Gestao.tsx` / componentes relacionados) para chamar essa função antes de gravar.

RLS:
- Colaborador vê/cria seus próprios pedidos.
- Gestores (`admin`/`administrativo`/`superintendente`) veem/aprovam todos da sua `corretora_id`.

---

## Detalhes técnicos
- Stack já existente: React 18 + Vite + Tailwind + shadcn + React Router + Lovable Cloud.
- Drag-and-drop: `@dnd-kit/core` + `@dnd-kit/sortable`.
- Fingerprint: `@fingerprintjs/fingerprintjs` (versão open-source, suficiente para o caso).
- IP do cliente: capturado na edge function via header `x-forwarded-for`.
- Exportação XLSX: `xlsx` já presente.
- Rota pública `/f/:slug` adicionada antes das rotas autenticadas em `App.tsx`.
- Permissões: novos `menu_item` em `role_menu_permissions` — `formularios` e `aprovacao_dispositivos`.
- Memória do projeto: respeitar `corretora_id` em todas as queries, widgets `rounded-2xl bg-muted/40`, primária `#362C89`.

---

Posso começar pela parte **1 (Formulários)** ou **2 (Aprovação de dispositivo)** primeiro — ou seguir as duas em paralelo na mesma entrega. Confirme para eu implementar.
