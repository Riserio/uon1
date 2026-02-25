

## Parecer: Comparação Excel vs Dados Importados

### Análise da Coluna G (Dia Vencimento Veículo)

Analisei o arquivo Excel enviado e comparei com os dados no banco.

**No Excel original**, a coluna G contém exclusivamente os dias: **5, 10, 15, 20, 25**.

**No banco de dados**, a distribuição atual é:

```text
Dia | Qtd Registros
----|------
  1 |     1  ← INCORRETO (não existe no Excel)
  2 |     3  ← INCORRETO (não existe no Excel)
  5 |    16  ✓
 10 | 2.161  ✓
 15 | 1.277  ✓
 20 | 1.193  ✓
 25 | 1.109  ✓
----|------
    | 5.760 total
```

### Diagnóstico

Existem **4 registros corrompidos** (dia 1 e dia 2) que não correspondem ao Excel original. Inclusive, os 3 registros com dia=2 possuem **placas concatenadas** (múltiplas placas grudadas numa string), confirmando erro de parsing.

Os demais 5.756 registros estão com o dia de vencimento correto em relação ao Excel.

### Plano de Correção

1. **Corrigir os 4 registros corrompidos via SQL** - atualizar o `dia_vencimento_veiculo` com base na `data_vencimento_original` (extraindo o dia correto) e limpar os campos de placas concatenadas.

2. **Nenhuma alteração de código necessária** - o parser atual já está correto (extrai apenas os primeiros 2 dígitos e aceita 1-31). Os 4 registros corrompidos vieram de importações anteriores com o parser antigo.

