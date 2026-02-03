
# Plano: Teste de Importação SGA Mantendo Formato XLS Original

## Diagnóstico do Problema

Analisando o arquivo `relatorio-38.xls` fornecido:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ ESTRUTURA DO ARQUIVO                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ Linha 1: CABEÇALHO (EVENTO ESTADO | DATA CADASTRO ITEM | ... | AÇÕES)       │
│ Linha 2: VAZIA (todos os campos em branco)                                  │
│ Linha 3-9: DADOS (7 eventos da ASSPAS)                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

Problemas identificados:
1. **Coluna "EVENTO ESTADO" sempre vazia** - é a primeira coluna mas nunca tem valor
2. **Linha 2 completamente vazia** - entre cabeçalho e dados
3. **Arquivo é HTML disfarçado de .xls** - comum no portal Hinova

## Solução Proposta

Ajustar o parser HTML no robô para:

### 1. Detectar Cabeçalho na Linha 1
O cabeçalho está claramente na primeira linha com "EVENTO ESTADO" como primeira coluna.

### 2. Ignorar Linha Vazia Após Cabeçalho
Pular a linha 2 que está completamente vazia antes de começar a processar dados.

### 3. Aceitar Registros com Primeira Coluna Vazia
A coluna "EVENTO ESTADO" está vazia em todos os 7 registros, mas os outros campos (DATA, PLACA, etc.) estão preenchidos.

### 4. Validação Mais Flexível
Considerar registro válido se tiver ao menos 2 campos significativos preenchidos (PLACA ou DATA).

## Alterações Técnicas

### Arquivo: `scripts/robo-sga-hinova.cjs`

#### Função `processarTabelaHtml()`

```javascript
// ANTES: Aceita linha se tiver >= 2 campos preenchidos (genérico)
if (filledCells >= 2) {
  dados.push(rowData);
}

// DEPOIS: Verifica campos-chave específicos (PLACA ou DATA)
const hasPlaca = rowData['PLACA'] || Object.values(rowData).some(v => 
  /^[A-Z]{3}[\d][A-Z\d][\d]{2}$/i.test(String(v).trim())
);
const hasData = Object.keys(rowData).some(k => 
  k.includes('DATA') && rowData[k] && rowData[k].includes('/')
);

if (filledCells >= 2 && (hasPlaca || hasData)) {
  dados.push(rowData);
}
```

#### Função `isHeaderRow()`

```javascript
// Melhorar detecção incluindo primeira coluna vazia
const isHeaderRow = (cells) => {
  if (!Array.isArray(cells) || cells.length < 5) return false;
  
  // Procurar palavras-chave em TODAS as células (não apenas primeiras)
  const allText = cells.join(' ').toUpperCase();
  
  // Cabeçalho deve ter "EVENTO" ou "PLACA" E algum suporte como "DATA"
  const hasMain = ['PLACA', 'EVENTO', 'SINISTRO', 'PROTOCOLO', 'COOPERATIVA']
    .some(k => allText.includes(k));
  const hasSupport = ['DATA', 'SITUACAO', 'MODELO', 'VALOR', 'REGIONAL']
    .some(k => allText.includes(k));
  
  return hasMain && hasSupport;
};
```

#### Função `isEmptyRow()` - Ajuste

```javascript
// Considerar linha vazia apenas se TODAS células estiverem vazias
// (incluindo espaços em branco que Hinova coloca)
const isEmptyRow = (cells) => {
  if (!Array.isArray(cells)) return true;
  return cells.every(c => {
    const val = String(c || '').trim();
    return val === '' || val === '-' || val === '&nbsp;';
  });
};
```

## Fluxo de Teste

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FLUXO DE TESTE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Executar automação SGA para ASSPAS                                      │
│     └─> Robô faz login, configura filtros, clica em Gerar                   │
│                                                                             │
│  2. Portal retorna arquivo .xls (HTML disfarçado)                           │
│     └─> Robô detecta que é HTML via magic bytes                             │
│                                                                             │
│  3. Parser HTML processa o arquivo                                          │
│     └─> Linha 1 = Cabeçalho detectado (tem PLACA, DATA, EVENTO)            │
│     └─> Linha 2 = Ignorada (está vazia)                                     │
│     └─> Linhas 3-9 = 7 registros processados                                │
│                                                                             │
│  4. Dados enviados ao webhook                                               │
│     └─> webhook-sga-hinova normaliza headers e insere no banco              │
│                                                                             │
│  5. Dashboard atualiza via Realtime                                         │
│     └─> Mostrar 7 eventos importados na ASSPAS                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Benefícios

| Aspecto | Situação Atual | Após Correção |
|---------|----------------|---------------|
| Registros importados | 0 | 7 |
| Formato do arquivo | XLS (HTML disfarçado) | Mantido como está |
| Conversão necessária | Tentativa falha | Não precisa converter |
| Primeira coluna vazia | Falha na validação | Aceita normalmente |

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `scripts/robo-sga-hinova.cjs` | Ajustar funções de parsing para aceitar registros com primeira coluna vazia |

## Resultado Esperado

Após a correção, ao executar a automação para ASSPAS:
- O robô processará o arquivo `.xls` original sem conversão
- Detectará corretamente os 7 eventos
- O dashboard mostrará os 7 registros importados
