
# Plano: Validação Completa de Checkboxes Antes de Gerar Relatório

## Objetivo
Garantir que **todos** os checkboxes visíveis estejam marcados antes de clicar em "Gerar Relatório", com log detalhado do antes e depois, e bloqueio do fluxo se algum checkbox não estiver marcado após a validação.

## Contexto do Problema
O arquivo atual (628 MB) indica que os filtros não estão sendo aplicados corretamente pelo portal Hinova. A lógica atual só manipula checkboxes da seção "Situação Boleto", mas pode haver outros checkboxes que afetam o resultado.

## Solução Proposta

### Nova Função: `validarEMarcarTodosCheckboxes(page)`

```text
┌─────────────────────────────────────────────────────────────┐
│  FLUXO DE VALIDAÇÃO DE CHECKBOXES                          │
├─────────────────────────────────────────────────────────────┤
│ 1. LISTAR todos os checkboxes visíveis na página           │
│    - Ignorar checkboxes hidden/disabled                    │
│    - Extrair: label, value, checked, seção                 │
│                                                            │
│ 2. LOGAR ESTADO INICIAL (ANTES)                            │
│    - Quantidade total de checkboxes                        │
│    - Quais estão marcados                                  │
│    - Quais estão desmarcados                               │
│                                                            │
│ 3. MARCAR TODOS os desmarcados                             │
│    - Usar .click() para cada checkbox desmarcado           │
│    - Não confiar em cache/estado anterior                  │
│                                                            │
│ 4. VALIDAR NOVAMENTE                                       │
│    - Re-listar todos os checkboxes                         │
│    - Verificar se 100% estão marcados                      │
│                                                            │
│ 5. LOGAR ESTADO FINAL (DEPOIS)                             │
│    - Quantidade marcados vs total                          │
│    - Se algum ainda desmarcado: log de alerta              │
│                                                            │
│ 6. RETORNO                                                 │
│    - Se 100% marcados: return true                         │
│    - Se <100% marcados: throw Error (bloqueia download)    │
└─────────────────────────────────────────────────────────────┘
```

---

## Alterações Técnicas

### 1. Criar função `listarCheckboxes(page)` 
Retorna array com informações de todos os checkboxes visíveis:
- `index`: posição no DOM
- `label`: texto do label associado
- `value`: valor do checkbox
- `checked`: estado atual (boolean)
- `section`: seção onde está localizado

### 2. Criar função `validarEMarcarTodosCheckboxes(page)`
Orquestra todo o processo:
1. Chama `listarCheckboxes()` para obter estado inicial
2. Loga estado inicial com `LOG_LEVELS.INFO`
3. Marca todos os desmarcados via `page.evaluate()`
4. Aguarda 500ms para estabilizar
5. Chama `listarCheckboxes()` novamente para validar
6. Loga estado final
7. Se algum checkbox ainda estiver desmarcado, lança erro
8. Retorna `true` se todos marcados

### 3. Modificar fluxo antes do download
Inserir chamada à nova função **imediatamente antes** de clicar em "Gerar Relatório", substituindo a lógica atual de checkboxes específicos.

### 4. Logs detalhados
Formato dos logs:
```
[INFO] [FILTROS] 📋 Listando checkboxes... Encontrados: 12
[INFO] [FILTROS] 📋 ANTES - Marcados: 8/12, Desmarcados: 4/12
[DEBUG] [FILTROS] 🔍 Desmarcados: "Cancelado", "Pago", "Vencido", "Renegociado"
[INFO] [FILTROS] ✅ Marcando 4 checkboxes desmarcados...
[INFO] [FILTROS] 📋 DEPOIS - Marcados: 12/12, Desmarcados: 0/12
[SUCCESS] [FILTROS] ✅ 100% dos checkboxes estão marcados - prosseguindo
```

---

## Arquivo a ser Modificado
- `scripts/robo-cobranca-hinova.cjs`

## Localização das Alterações
1. **Nova função** (após linha ~1600): `listarCheckboxes()` e `validarEMarcarTodosCheckboxes()`
2. **Substituir lógica** (linhas 2513-2556): Remover manipulação específica de "Situação Boleto" e usar nova função genérica
3. **Chamar validação** (antes da linha 2665 - clique em Gerar): Garantir que todos estão marcados

## Comportamento de Segurança
- Se após 3 tentativas de marcação ainda houver checkboxes desmarcados, o script:
  1. Salva screenshot de debug
  2. Lança erro descritivo
  3. Impede o download de arquivo incorreto

## Resultado Esperado
- Arquivo baixado terá tamanho reduzido (~5-20 MB ao invés de 600+ MB)
- Logs claros mostrando o estado de cada checkbox
- Falha explícita se filtros não puderem ser aplicados
