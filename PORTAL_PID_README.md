# Portal PID - Sistema de Gestão de Parceiros

## O que é o Portal PID?

O Portal PID (Painel de Indicadores e Demonstrativos) é uma interface dedicada para corretoras parceiras acessarem seus dados financeiros e de sinistros de forma segura e isolada.

## Características de Segurança (DECISÃO DEFINITIVA)

### Acesso Exclusivo
- Usuários com role `parceiro` têm acesso **EXCLUSIVO** ao Portal PID
- Eles **NÃO** podem acessar nenhuma outra parte do sistema
- Não veem sidebar, menu principal, ou qualquer funcionalidade administrativa
- Qualquer tentativa de acessar outras rotas resulta em redirecionamento automático para `/portal`

### Isolamento de Dados
- Cada parceiro vê **APENAS** os dados da sua corretora
- Políticas RLS (Row Level Security) garantem que:
  - `producao_financeira`: só veem registros da sua corretora
  - `vistorias` (sinistros): só veem sinistros da sua corretora
  - `corretoras`: só veem informações da própria corretora

### Permissões
- **Leitura**: Parceiros podem visualizar KPIs, extratos, indicadores, lançamentos e sinistros
- **Escrita Limitada**: Apenas podem editar deliberações do Comitê de Sinistros
- **Bloqueios**: Não podem inserir, editar ou deletar dados financeiros ou sinistros

## Fluxo de Login

1. Usuário parceiro acessa `/auth` (mesma tela de login do sistema)
2. Faz login com email e senha
3. Sistema detecta automaticamente que o role é `parceiro`
4. Redireciona automaticamente para `/portal`
5. Portal carrega dados específicos da corretora vinculada ao usuário

## Estrutura de Dados

### Tabela: `corretora_usuarios`
Vincula usuários do tipo `parceiro` às suas corretoras:
- `profile_id`: ID do usuário (referencia auth.users via profiles)
- `corretora_id`: ID da corretora
- `acesso_exclusivo_pid`: true (padrão)
- `ativo`: true/false

### Role: `parceiro`
Armazenado na tabela `user_roles`:
- `user_id`: ID do usuário
- `role`: 'parceiro'

## Criação de Usuários Parceiros

1. Acesse a página `/pid` (menu PID no sistema administrativo)
2. Clique em "Gerenciar Usuários PID"
3. Preencha:
   - Email do parceiro
   - Senha temporária
   - Selecione a corretora
4. Sistema cria automaticamente:
   - Usuário no auth.users
   - Profile em profiles
   - Role 'parceiro' em user_roles
   - Vínculo em corretora_usuarios

## Políticas RLS Implementadas

### producao_financeira
```sql
-- Parceiros só veem dados da sua corretora
"Parceiros podem ver producao da sua corretora"
-- Parceiros não podem modificar dados financeiros
"Parceiros não podem modificar producao_financeira"
```

### vistorias
```sql
-- Parceiros só veem sinistros da sua corretora
"Parceiros podem ver vistorias da sua corretora"
-- Parceiros podem atualizar apenas observacoes_ia (deliberações do comitê)
"Parceiros podem atualizar observacoes_ia de sinistros"
-- Parceiros não podem inserir ou deletar sinistros
"Parceiros não podem inserir sinistros"
"Parceiros não podem deletar sinistros"
```

### corretoras
```sql
-- Parceiros só veem sua própria corretora
"Parceiros podem ver own corretora data"
```

## Componentes do Portal

### Portal.tsx
Página principal do portal, contém:
- Header com nome e logo da corretora
- Tabs:
  - **KPI**: Indicadores financeiros mensais
  - **Extrato**: Listagem detalhada de produção financeira
  - **Indicadores**: Gráficos de produção (mensal, por produto, por seguradora)
  - **Lançamentos**: Lançamentos financeiros manuais
  - **Sinistros**: Lista de sinistros e valores
  - **Comitê**: Interface para deliberações sobre sinistros (única área editável)

### Componentes Filhos
- `PortalKPI`: Métricas agregadas (faturamento, comissões, repasses)
- `PortalExtrato`: Tabela de produção financeira
- `PortalIndicadores`: Gráficos de análise
- `PortalLancamentos`: Visualização de lançamentos manuais
- `PortalSinistros`: Lista e estatísticas de sinistros
- `PortalComite`: Interface de deliberação (aprovação/rejeição de indenizações)

## Segurança - Verificação em Múltiplas Camadas

1. **Autenticação**: Apenas usuários autenticados
2. **Routing**: `PortalRoute` valida role `parceiro`
3. **RLS Database**: Políticas garantem acesso apenas aos dados da corretora
4. **Frontend**: Componentes buscam apenas dados da corretora vinculada
5. **Edge Functions**: Validam role e corretora_id antes de operações

## Manutenção

### Adicionar Nova Funcionalidade
1. Criar política RLS apropriada na tabela
2. Garantir que a query filtra por `corretora_id = get_user_corretora_id(auth.uid())`
3. Adicionar componente no Portal.tsx como nova tab

### Remover Acesso de Parceiro
1. Desativar em `corretora_usuarios`: `ativo = false`
2. Ou deletar registro em `user_roles` onde `role = 'parceiro'`

### Debug
- Verificar logs de RLS: Settings → Database → Logs
- Verificar vínculo corretora: Query `corretora_usuarios` para o user_id
- Verificar role: Query `user_roles` para o user_id
