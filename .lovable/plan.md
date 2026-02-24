
Objetivo
- Garantir que os badges de não lidas atualizem em tempo real em 3 pontos: ícone da sidebar, título “Central” e lista/conversa.
- Corrigir a automação do WhatsApp para não travar e permitir reinício por palavra e por tempo (caso do número 31 98313-1491).

Diagnóstico já confirmado no projeto
1) Badge/conversa
- O badge da sidebar já usa `useWhatsAppUnread`.
- O badge do título “Central” (aba em `src/pages/Emails.tsx`) já usa `useWhatsAppUnread`.
- Na conversa (`src/pages/CentralAtendimento.tsx`), há badge na lista de contatos, mas não no cabeçalho da conversa aberta.
- O “zerar não lidas” está tardio: hoje zera no estado local apenas no `.then()` do update no banco, não imediatamente.

2) Automação travando (raiz do problema)
- Tabela `whatsapp_contact_flow_state` tem constraint de status:
  - permitido: `active`, `completed`, `paused`, `cancelled`
- O código do flow engine tenta salvar `status='expired'` em reset/timeout.
- Resultado: updates de reset/timeout falham silenciosamente (status inválido), e o estado fica ativo.
- Também existe unique atual `UNIQUE(contact_id, flow_id, status)`:
  - isso impede múltiplos “completed” por mesmo fluxo/contato;
  - ao completar novamente pode dar conflito e deixar estado ativo.
- No número citado (31 98313-1491), há múltiplos estados ativos para o mesmo contato, confirmando travamento de sessão.
- Há ainda duplicidade de contato por variação do 9º dígito (`5531983131491` e `553183131491`), fragmentando histórico/badges.

Escopo da implementação
A) Frontend – badge em tempo real e UX imediata
Arquivos:
- `src/hooks/useWhatsAppUnread.ts`
- `src/pages/CentralAtendimento.tsx`
- `src/pages/Emails.tsx` (ajuste fino se necessário)
- `src/components/AppSidebar.tsx` (somente se precisar sincronização visual adicional)

Mudanças planejadas:
1. `useWhatsAppUnread`
- Fortalecer realtime + fallback por polling leve (ex.: 8–15s) para evitar “silêncio” se subscription falhar.
- Manter toast apenas em incremento real.
- Adicionar deduplicação de eventos e proteção de race.

2. `CentralAtendimento`
- Inserir badge também no cabeçalho da conversa aberta (ao lado do nome), para atender “na conversa”.
- Zerar unread local de forma otimista imediatamente ao selecionar contato:
  - atualizar `contacts` local na hora;
  - atualizar também `selectedContact` local na hora;
  - depois persistir no backend (com rollback apenas se erro).
- Melhorar atualização de lista em realtime:
  - aplicar patch incremental via payload quando possível;
  - manter `loadContacts()` como fallback.
- (Opcional recomendado) dedupe visual por número canônico na lista para não mostrar “duas conversas” da mesma pessoa por variação de número.

3. `Emails` (título Central)
- Garantir que continue refletindo exatamente o mesmo contador global do hook (sem estado duplicado local).

B) Backend – correção estrutural do fluxo (principal)
Arquivos:
- Migration SQL em `supabase/migrations/*`
- `supabase/functions/whatsapp-flow-engine/index.ts`
- `supabase/functions/webhook-whatsapp-meta/index.ts`

Mudanças planejadas no banco (migration):
1. Ajustar enum/check de status da tabela `whatsapp_contact_flow_state`
- Incluir `expired` no check constraint.

2. Corrigir regra de unicidade de sessão
- Remover `UNIQUE(contact_id, flow_id, status)` (modelo atual gera conflito funcional).
- Criar índice único parcial para garantir no máximo 1 sessão ativa por contato:
  - `UNIQUE(contact_id) WHERE status='active'`.

3. Saneamento de dados existentes
- Para cada `contact_id` com múltiplos ativos:
  - manter apenas o mais recente como `active`;
  - marcar os demais como `expired` com `completed_at=now()`.
- Para contatos duplicados por variação 9º dígito:
  - escolher registro canônico;
  - migrar `whatsapp_messages.contact_id` e `whatsapp_contact_flow_state.contact_id`;
  - remover contato duplicado remanescente.

Mudanças no flow engine:
1. Buscar múltiplos ativos, não `maybeSingle()`
- Resolver deterministicamente:
  - expirar excedentes;
  - trabalhar com apenas 1 estado ativo final.
2. Reset/timeout robustos
- Normalizar keywords de config e mensagem.
- Em reset/timeout, conferir resultado do update e logar erro.
3. Completar fluxo com tratamento de erro
- Validar update para `completed`; se falhar, logar e fallback para `expired`/`cancelled` conforme regra.
4. Observabilidade
- Logs com `contact_id`, `state_id`, transição de status e motivo (reset/timeout/match).

Mudanças no webhook WhatsApp:
1. Tratar retorno de `supabase.functions.invoke('whatsapp-flow-engine')`
- Verificar `error` e payload de erro, com log explícito.
2. Reforçar resolução canônica do contato
- Manter preferência do número canônico e evitar fragmentação.
- Quando houver múltiplos candidatos, consolidar seleção de forma estável.

C) Realtime publication (conferência)
- Validar publicação realtime para:
  - `whatsapp_contacts` (já está)
  - `whatsapp_messages` (já está)
- Não é obrigatório publicar `whatsapp_contact_flow_state` para esta tela, mas opcional para monitoria admin.

Plano de execução em fases
Fase 1 — Correção crítica de automação (prioridade máxima)
1. Migration de constraints/índices + saneamento de estados ativos.
2. Ajustes no flow-engine (múltiplos ativos, reset/timeout, logs).
3. Ajuste no webhook para checar erro de invoke.

Fase 2 — Badge realtime completo
1. Hook global com fallback polling.
2. Badge no cabeçalho da conversa.
3. Zero otimista imediato + sync backend.

Fase 3 — Consolidação de contatos duplicados
1. Script de merge por número canônico (9º dígito).
2. Blindagem para não recriar duplicidade.

Validação (checklist de aceite)
1. Badge
- Receber mensagem nova sem refresh:
  - Sidebar atualiza.
  - Aba “Central” atualiza.
  - Lista de conversas atualiza.
- Abrir conversa com não lidas:
  - badge some imediatamente em todos os pontos (sem esperar roundtrip).
- Com sidebar recolhida e expandida, contador consistente.

2. Fluxo
- Para 31 98313-1491:
  - enviar palavra gatilho -> fluxo responde.
  - enviar opção inválida -> recebe mensagem de opção inválida.
  - enviar `sair`/`menu` -> reinicia e permite novo gatilho.
  - esperar timeout configurado -> sessão expira e novo gatilho volta a funcionar.
- Confirmar que nunca há mais de 1 estado `active` por contato.

3. Regressão
- Envio manual continua funcionando.
- Mensagens de mídia continuam recebidas e exibidas.
- Relatórios (cobrança/eventos/mgf) continuam sendo disparados quando autorizados.

Riscos e mitigação
- Risco: migration em tabela de estado impactar sessões em andamento.
  - Mitigação: saneamento preserva estado mais recente por contato.
- Risco: merge de contatos afetar histórico.
  - Mitigação: migrar FKs antes de deletar duplicado, validar contagem pré/pós.

Detalhes técnicos (seu time)
- Erro funcional central identificado: inconsistência entre código (`expired`) e constraint de status.
- O unique atual por `(contact_id, flow_id, status)` é incompatível com múltiplas execuções históricas do mesmo fluxo.
- Modelo correto para operação conversacional:
  - histórico livre (`completed` múltiplos permitidos),
  - unicidade apenas de sessão ativa por contato via índice parcial.

Resultado esperado após implementação
- Badges totalmente reativos e consistentes no ícone da sidebar, título da Central e conversa.
- Fluxo reiniciando corretamente por palavra e por timeout.
- Fim do travamento para o número 31 98313-1491 e demais contatos com histórico semelhante.
