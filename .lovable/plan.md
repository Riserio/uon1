## Backfill por período — Cobrança, Eventos e MGF

Nova aba **"Backfill"** no modal de Sincronização (`BISyncButton`), unificando os 3 módulos com uma experiência moderna e segura.

### 1. Interface (mais funcional e fácil)

Layout em 3 seções dentro de uma única tela com tabs por módulo (Cobrança / Eventos / MGF):

```text
┌─────────────────────────────────────────────────────┐
│ [ Cobrança ] [ Eventos ] [ MGF ]                    │
├─────────────────────────────────────────────────────┤
│ Presets rápidos:                                    │
│ [Mês anterior] [Mês atual] [Últimos 6 meses]        │
│ [Ano anterior] [Ano atual]  [Tudo]                  │
│                                                     │
│ Ou escolha um período:                              │
│  ( ) Por dia      [DatePicker único]                │
│  (•) Por período  [De ▼] [Até ▼]                    │
│                                                     │
│            [ + Adicionar à fila ]                   │
├─────────────────────────────────────────────────────┤
│ Fila de execução (1 por vez):                       │
│  ● 01/05/2026 → 31/05/2026  Em execução  45%        │
│  ○ 01/04/2026 → 30/04/2026  Aguardando              │
│  ✓ 01/06/2026 → 14/06/2026  Concluído   1.245 reg.  │
│  ✗ 01/03/2026 → 31/03/2026  Falhou      [Tentar]    │
└─────────────────────────────────────────────────────┘
```

- Cada item da fila mostra: período, status (aguardando / executando / concluído / falhou), progresso, registros importados.
- Botões: **Pausar fila**, **Limpar concluídos**, **Tentar novamente** (em itens falhos).
- Aviso visual quando o usuário tenta adicionar um período que **sobrepõe** outro já enfileirado/concluído no mesmo módulo+associação → bloqueio com mensagem clara.

### 2. Regras de período

- **Presets** calculados em America/Sao_Paulo (seguindo o padrão de datas do projeto).
- **MGF**: aceita período (o robô envia o range no portal Hinova; quando não houver filtro nativo no portal, o range é aplicado pós-extração no parser, mantendo o comportamento atual de "trazer tudo" como fallback de segurança).
- **Por dia**: cria 1 item na fila com `data_inicio = data_fim = dia escolhido`.
- **Tudo**: range fixo a partir de 01/01/2020 até hoje (configurável).
- **Não permitir duplicatas/overlap**: validação client-side + constraint no banco (`EXCLUDE USING gist` em `corretora_id + modulo + tstzrange`) para impedir 2 jobs concorrentes na mesma janela.

### 3. Execução automática, 1 por vez (mais seguro)

- Nova tabela `backfill_jobs` com fila persistente (sobrevive a F5 e troca de sessão).
- Edge function **`backfill-worker`** acionada via:
  - `pg_cron` a cada 1 minuto pegando o **próximo job pendente da associação** com `FOR UPDATE SKIP LOCKED` (garante 1 por vez por associação).
  - Trigger imediato após inserir um job (via `supabase.functions.invoke`) para começar na hora se a fila estiver vazia.
- O worker chama o robô existente (`hinova-cobranca-importar`, `hinova-eventos-importar`, `hinova-mgf-importar`) passando `data_inicio` e `data_fim`, atualiza `status`, `progresso`, `registros_importados`, `erro` em tempo real.
- Realtime do Supabase mantém a UI atualizada sem polling.
- Respeita a porta de integridade existente (extração 0 registros = falha, não sobrescreve dashboard).

### 4. Atualização incremental (uso diário)

Após o backfill histórico estar completo, o usuário usa a opção **"Por dia"** para puxar o dia anterior em segundos — mesma interface, mesmo motor. Não há tela separada para "diário" vs "histórico".

---

### Detalhes técnicos

**Migration (`backfill_jobs`)**
- `id`, `corretora_id`, `modulo` ('cobranca'|'eventos'|'mgf'), `data_inicio`, `data_fim`, `status` ('pendente'|'executando'|'concluido'|'falhou'|'cancelado'), `progresso` int, `registros_importados` int, `erro` text, `iniciado_em`, `concluido_em`, `created_by`, `created_at`, `updated_at`.
- Constraint de exclusão evitando overlap (`corretora_id`, `modulo`, `tstzrange(data_inicio, data_fim, '[]')` com `&&`) apenas para status em ('pendente','executando','concluido').
- RLS: admin/superintendente full; demais escopados por `corretora_id = get_user_corretora_id(auth.uid())`.
- GRANT padrão (`authenticated`, `service_role`).

**Edge functions**
- `backfill-enqueue`: valida overlap, insere job e dispara worker.
- `backfill-worker`: pega 1 job por associação com `SKIP LOCKED`, executa o robô correspondente, atualiza status. Idempotente, com timeout de 25 min.
- Reuso integral dos importadores Hinova existentes — só recebem o range adicional.

**Frontend**
- Novo componente `BackfillPanel.tsx` (tabs por módulo + presets + fila).
- Hook `useBackfillJobs(corretoraId)` com Realtime subscription.
- Integrado como 3ª aba no `BISyncButton` (mantém "Sincronização instantânea" e "Configurações" intactos).

**Memória**
- Salvar regra: "Backfill por período = 1 job por vez por associação; presets BR (mês/ano anterior, 6 meses, tudo); overlap bloqueado por constraint."
