

# Plano: Credenciais Dinâmicas por Associação na Automação Hinova

## Contexto

Atualmente, a automação Hinova usa credenciais fixas armazenadas como **Secrets do GitHub** (HINOVA_URL, HINOVA_USER, HINOVA_PASS, etc.). Isso impede que múltiplas associações usem portais Hinova diferentes, como:
- `https://eris.hinova.com.br/sga/sgav4_valecar/v5/login.php` (atual)
- `https://sga.hinova.com.br/sga/sgav4_asspas/v5/login.php` (sua nova)

## Solução Proposta

Modificar o fluxo para que as credenciais sejam buscadas **dinamicamente do banco de dados** com base no `corretora_id`, permitindo configuração independente por associação.

---

## Arquitetura Atual vs. Nova

```text
ATUAL:
┌────────────────┐     ┌─────────────────┐     ┌────────────────┐
│  Interface     │────▶│ Edge Function   │────▶│ GitHub Actions │
│ (UI Config)    │     │ disparar-github │     │ (Secrets fixos)│
└────────────────┘     └─────────────────┘     └────────────────┘
                               │                       │
                               ▼                       ▼
                        Passa apenas:           Usa secrets:
                        - corretora_id          - HINOVA_URL
                        - execucao_id           - HINOVA_USER
                                                - HINOVA_PASS
                                                - HINOVA_LAYOUT
```

```text
NOVA (proposta):
┌────────────────┐     ┌─────────────────┐     ┌────────────────┐
│  Interface     │────▶│ Edge Function   │────▶│ GitHub Actions │
│ (UI Config)    │     │ disparar-github │     │ (Inputs dinâm) │
└────────────────┘     └─────────────────┘     └────────────────┘
       │                       │                       │
       ▼                       ▼                       ▼
  Salva no DB:          Busca do DB e            Recebe inputs:
  - hinova_url          passa como inputs:       - hinova_url
  - hinova_user         - hinova_url             - hinova_user
  - hinova_pass         - hinova_user            - hinova_pass
  - hinova_layout       - hinova_pass            - hinova_layout
                        - hinova_layout
```

---

## Etapas de Implementação

### 1. Atualizar Workflow do GitHub

**Arquivo:** `.github/workflows/cobranca-hinova.yml`

Adicionar novos inputs para receber credenciais dinamicamente:

```yaml
workflow_dispatch:
  inputs:
    corretora_id:
      description: 'ID da associação'
      required: false
    execucao_id:
      description: 'ID do registro de execução'
      required: false
    hinova_url:
      description: 'URL do portal Hinova'
      required: false
    hinova_user:
      description: 'Usuário do portal'
      required: false
    hinova_pass:
      description: 'Senha do portal'
      required: false
    hinova_codigo_cliente:
      description: 'Código do cliente'
      required: false
    hinova_layout:
      description: 'Layout do relatório'
      required: false
```

Modificar o step de execução para priorizar inputs sobre secrets:

```yaml
- name: Executar robô de cobrança
  env:
    HINOVA_URL: ${{ github.event.inputs.hinova_url || secrets.HINOVA_URL }}
    HINOVA_USER: ${{ github.event.inputs.hinova_user || secrets.HINOVA_USER }}
    HINOVA_PASS: ${{ github.event.inputs.hinova_pass || secrets.HINOVA_PASS }}
    HINOVA_CODIGO_CLIENTE: ${{ github.event.inputs.hinova_codigo_cliente || secrets.HINOVA_CODIGO_CLIENTE }}
    HINOVA_LAYOUT: ${{ github.event.inputs.hinova_layout || secrets.HINOVA_LAYOUT }}
    # ... demais variáveis
```

---

### 2. Atualizar Edge Function `disparar-github-workflow`

**Arquivo:** `supabase/functions/disparar-github-workflow/index.ts`

Modificar para enviar as credenciais do banco como inputs do workflow:

```typescript
// Após buscar config do banco (linha ~63):
const githubResponse = await fetch(workflowDispatchUrl, {
  method: 'POST',
  headers: { /* ... */ },
  body: JSON.stringify({
    ref: 'main',
    inputs: {
      corretora_id: corretora_id,
      execucao_id: execucao?.id || '',
      // NOVOS: Passar credenciais do banco
      hinova_url: config.hinova_url || '',
      hinova_user: config.hinova_user || '',
      hinova_pass: config.hinova_pass || '',
      hinova_codigo_cliente: config.hinova_codigo_cliente || '',
      hinova_layout: config.layout_relatorio || 'BI - VANGARD COBRANÇA',
    },
  }),
});
```

---

### 3. Criar Edge Function de Validação de Credenciais

**Novo arquivo:** `supabase/functions/testar-hinova-login/index.ts`

Como o portal Hinova usa formulário de login (não API REST), criaremos uma Edge Function que:

1. Recebe URL, usuário e senha
2. Faz uma requisição HTTP ao portal
3. Analisa a resposta para validar se as credenciais estão corretas

Abordagem: Verificar se a URL é acessível e se retorna a página de login esperada.

```typescript
// Validação básica:
// 1. Testar se a URL responde (HTTP 200)
// 2. Verificar se contém elementos do portal Hinova
// 3. Opcionalmente, simular envio de formulário para validar credenciais
```

**Nota técnica:** Validação completa de login via formulário seria complexa em Edge Function. A alternativa mais segura é validar a URL e o formato das credenciais, deixando a validação real para a primeira execução do robô.

---

### 4. Adicionar Botão "Testar Conexão" na Interface

**Arquivo:** `src/components/cobranca/CobrancaAutomacaoConfig.tsx`

Adicionar um botão ao lado das credenciais que:

1. Valida localmente se os campos estão preenchidos
2. Chama a Edge Function de teste
3. Exibe feedback visual (sucesso/erro)

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={handleTestarConexao}
  disabled={!config.hinova_url || !config.hinova_user || !config.hinova_pass}
>
  <CheckCircle className="h-4 w-4 mr-2" />
  Testar Conexão
</Button>
```

---

## Considerações de Segurança

1. **Credenciais no banco:** Já estão armazenadas na tabela `cobranca_automacao_config` com os campos `hinova_user` e `hinova_pass`

2. **Transmissão para GitHub:** Os inputs do workflow_dispatch são criptografados em trânsito e não ficam visíveis em logs públicos

3. **Logs de auditoria:** A Edge Function já registra em `bi_audit_logs` para rastreabilidade

4. **Fallback para Secrets:** Se a configuração no banco estiver vazia, o workflow continua usando os Secrets do repositório (retrocompatibilidade)

---

## Resumo das Alterações

| Arquivo | Alteração |
|---------|-----------|
| `.github/workflows/cobranca-hinova.yml` | Adicionar inputs para credenciais; priorizar inputs sobre secrets |
| `supabase/functions/disparar-github-workflow/index.ts` | Incluir credenciais do banco nos inputs do workflow |
| `supabase/functions/testar-hinova-login/index.ts` | Nova Edge Function para validar URL/credenciais |
| `src/components/cobranca/CobrancaAutomacaoConfig.tsx` | Adicionar botão "Testar Conexão" |
| `supabase/config.toml` | Registrar nova Edge Function |

---

## Benefícios

- Cada associação pode configurar suas próprias credenciais Hinova
- URLs de portais diferentes são suportadas (sgav4_valecar, sgav4_asspas, etc.)
- Configuração centralizada na interface, sem necessidade de editar Secrets do GitHub
- Retrocompatibilidade com configurações existentes via fallback

