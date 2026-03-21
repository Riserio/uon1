

## Plano: Acesso Nativo ao SGA Hinova + Correção de Build

Duas ações independentes neste plano.

---

### 1. Corrigir erro de build (cache stale)

O arquivo `src/data/treinamentoContent.ts` esta limpo — as referências a `imgPainel` etc. nao existem mais no código. O erro persiste por cache do bundler. A correção é um micro-edit: remover o campo `image?: string` da interface `HelpModule` (não é usado) para forçar invalidação do cache.

| Arquivo | Alteração |
|---|---|
| `src/data/treinamentoContent.ts` | Remover `image?: string` da interface `HelpModule` |

---

### 2. Proxy HTTP nativo para o SGA Hinova

Criar uma Edge Function que faz login no portal Hinova via HTTP (POST de formulário), captura cookies de sessão e executa operações nas URLs fornecidas. Isso permite consultar associados, veículos, eventos e gerar relatórios diretamente pela nossa interface, sem navegador headless.

**URLs mapeadas pelo usuário (exemplo Valecar):**

```text
Base: https://eris.hinova.com.br/sga/sgav4_valecar/
├── v5/Novoeventoitem/listar       → Eventos + Relatórios
├── veiculo/consultarVeiculo.php   → Consulta Veículos
└── associado/consultarAssociado.php → Consulta Associados
```

Cada associação tem sua própria URL base (ex: `sgav4_valecar`, `sgav4_outra`), credenciais já armazenadas em `hinova_credenciais`.

**Arquitetura:**

```text
┌──────────────┐     ┌──────────────────────┐     ┌──────────────┐
│  Interface   │────►│  Edge Function        │────►│ Portal       │
│  (React)     │     │  hinova-proxy         │     │ Hinova SGA   │
│              │◄────│  (fetch + cookies)    │◄────│              │
└──────────────┘     └──────────────────────┘     └──────────────┘
```

#### Componentes

**A. Edge Function `supabase/functions/hinova-proxy/index.ts`**

Recebe operações via POST:
- `action: "login"` — Faz POST no formulário de login do Hinova, retorna cookies de sessão
- `action: "consultar-associado"` — GET/POST na URL de consulta com parâmetros (nome, CPF, placa)
- `action: "consultar-veiculo"` — GET/POST na URL de consulta de veículos
- `action: "listar-eventos"` — GET na URL de listagem de eventos com filtros
- `action: "gerar-relatorio"` — POST para gerar relatório Excel, retorna dados parseados ou arquivo

Fluxo interno:
1. Recebe `corretora_id` + `action` + parâmetros
2. Busca credenciais em `hinova_credenciais` (usando service role)
3. Faz login HTTP (POST form-encoded com usuario/senha/codigo_cliente)
4. Captura cookies `Set-Cookie` da resposta
5. Executa a ação solicitada enviando cookies no header
6. Parseia a resposta HTML (regex/string parsing) e retorna JSON estruturado

**B. UI `src/components/sga/SGAConsultaHinova.tsx`**

Novo componente com abas:
- **Associados** — Campo de busca (nome/CPF) + tabela de resultados
- **Veículos** — Campo de busca (placa/modelo) + tabela de resultados
- **Eventos** — Filtros (data, situação) + tabela de eventos
- **Relatórios** — Seletor de layout + botão "Gerar em Excel" + download direto

Design seguindo padrão widget moderno (rounded-2xl, bg-muted/40).

**C. Integração no módulo SGA existente**

Adicionar nova aba "Consulta SGA" no componente de insights/dashboard do SGA, disponível quando a associação tem credenciais Hinova configuradas.

#### Arquivos a criar/modificar

| Arquivo | Ação |
|---|---|
| `supabase/functions/hinova-proxy/index.ts` | Criar — Edge Function proxy HTTP |
| `src/components/sga/SGAConsultaHinova.tsx` | Criar — Interface de consultas |
| `src/pages/SGAInsights.tsx` | Modificar — Adicionar aba "Consulta SGA" |
| `src/data/treinamentoContent.ts` | Modificar — Micro-edit para invalidar cache |
| `supabase/config.toml` | Adicionar `verify_jwt = false` para `hinova-proxy` |

#### Riscos e limitações

1. **Parsing HTML** — Se o Hinova mudar a estrutura das páginas, o parsing quebra. Mitigação: parsing resiliente com fallbacks.
2. **Sessão** — Cookies podem expirar rapidamente. Mitigação: re-login automático em caso de 401/302.
3. **Captcha/Rate-limit** — Se o Hinova implementar captcha, a abordagem HTTP pura não funciona. Nesse cenário, seria necessário voltar ao Playwright.
4. **Performance** — Cada operação requer login + request, ~3-8 segundos. Aceitável para consultas interativas.

Nenhuma migração de banco necessária — usa tabela `hinova_credenciais` existente.

