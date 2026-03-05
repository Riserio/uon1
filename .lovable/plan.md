

# Plano: Ouvidoria no Portal + Acesso Independente + Melhorias do Backoffice

## Resumo

Três frentes: (1) adicionar aba Ouvidoria no portal parceiro, (2) criar acesso independente para usuários "só ouvidoria", (3) aprimorar o backoffice com base no documento de requisitos (SLA, checkpoints, drag & drop, relatórios).

---

## 1. Ouvidoria no Portal Parceiro

- Adicionar `'ouvidoria'` como módulo em `modulos_bi` no `corretora_usuarios`
- Criar rota `/portal/ouvidoria` dentro do `PortalLayout` com componente read-only mostrando Kanban simplificado + indicadores da associação do parceiro
- Adicionar "Ouvidoria" no carousel/header do portal (ao lado de Eventos, MGF, etc.)
- Filtrar automaticamente pela `corretora_id` do parceiro logado

## 2. Acesso Independente (Usuário Ouvidoria)

- Na tela de Usuários, ao criar/editar um parceiro, adicionar checkbox **"Acesso Ouvidoria"** (independente dos módulos BI)
- Novo campo `acesso_ouvidoria` (boolean) na tabela `corretora_usuarios`
- Permitir criar usuário com **apenas** acesso ouvidoria (sem módulos BI) — nesse caso o portal redireciona direto para `/portal/ouvidoria`
- Ou parceiro + ouvidoria (tem os módulos BI + ouvidoria)
- No `PortalLayoutContext`, incluir `acesso_ouvidoria` na query e disponibilizar para o layout
- Na lógica de redirecionamento do portal: se o usuário só tem ouvidoria, redirecionar para `/portal/ouvidoria`

## 3. Melhorias do Backoffice (baseado no documento)

### 3.1 Checkpoints por Etapa
- Migração DB: criar tabela `ouvidoria_checkpoints` com `registro_id`, `etapa`, `checkpoint_index`, `concluido`, `concluido_em`, `user_id`
- Definir checkpoints fixos por etapa conforme documento (2 para Recebimento, 4 para Levantamento, etc.)
- No modal de detalhes: exibir lista interativa de checkpoints da etapa atual com toggle
- No card do Kanban: barra de progresso dos checkpoints

### 3.2 SLA por Coluna
- Adicionar SLAs fixos: Recebimento (imediato/1h), Levantamento (6h), Acionamento Setor (12h), Contato Associado (6h), Monitoramento/Resolvido/Sem Resolução (sem SLA)
- Calcular tempo na etapa usando `status_changed_at` (adicionar campo na tabela se não existir)
- Indicador de cor no card: verde (<70% SLA), amarelo (70-100%), vermelho (>100%)

### 3.3 Campos Adicionais no Registro
- Migração: adicionar colunas `urgencia` (alta/media/baixa), `origem_reclamacao`, `setor_responsavel`, `possivel_motivo`, `analista_id`, `satisfacao_nota`
- Modal de detalhes: campos editáveis para origem, setor, motivo, analista
- Card: indicador de urgência (círculo colorido)

### 3.4 Drag & Drop
- Usar `@dnd-kit` (já instalado) para arrastar cards entre colunas do Kanban
- Ao soltar: atualizar status + registrar histórico

### 3.5 Aba Relatórios
- Adicionar aba "Relatórios" no backoffice com gráficos (Recharts já instalado):
  - Total manifestações por período (barras)
  - Distribuição por tipo (pizza)
  - Taxa resolução vs sem resolução
  - Tempo médio por etapa
  - SLAs vencidos por coluna

### 3.6 Modal de Detalhes Completo
- Cabeçalho com badge de etapa, protocolo, urgência
- Dados do associado
- Checkpoints interativos
- Seletor de etapa (botões para cada coluna)
- Timeline/histórico de atividades
- Botões de ação rápida (Resolvido / Sem Resolução)

### 3.7 Stats Bar Melhorada
- Total abertos, Urgência Alta/Média, No prazo, Vencidos, Resolvidos hoje

---

## Arquivos a Criar/Alterar

| Arquivo | Ação |
|---------|------|
| Migração SQL | Criar `ouvidoria_checkpoints`, adicionar colunas em `ouvidoria_registros`, adicionar `acesso_ouvidoria` em `corretora_usuarios` |
| `src/pages/portal/PortalOuvidoria.tsx` | Novo — visão read-only da ouvidoria para parceiros |
| `src/pages/OuvidoriaBackoffice.tsx` | Reescrever — SLA, checkpoints, drag&drop, tabs (Kanban/Tabela/Relatórios), modal completo |
| `src/components/portal/PortalLayout.tsx` | Adicionar rota e módulo ouvidoria |
| `src/components/portal/PortalHeader.tsx` | Incluir ouvidoria na navegação |
| `src/contexts/PortalLayoutContext.tsx` | Carregar `acesso_ouvidoria` |
| `src/pages/Usuarios.tsx` | Checkbox "Acesso Ouvidoria" no form de parceiro |
| `src/App.tsx` | Rota `/portal/ouvidoria` |

---

## Ordem de Execução

1. Migração DB (novos campos + tabela checkpoints)
2. Backoffice aprimorado (SLA, checkpoints, drag&drop, modal, relatórios)
3. Componente portal ouvidoria (read-only)
4. Integração no portal (rota, layout, redirecionamento)
5. Tela de usuários (checkbox acesso ouvidoria)

