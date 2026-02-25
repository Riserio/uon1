

## Problem

The "Boletos por Dia de Vencimento" table sums to 3,750 instead of the expected 4,729. The missing 979 boletos have `dia_vencimento_veiculo = NULL` and get grouped as `'N/I'`, which is then filtered out at line 379.

## Solution

Change line 401 to use a fallback: when `dia_vencimento_veiculo` is NULL, extract the day from `data_vencimento_original` instead.

### Change in `src/components/cobranca/CobrancaDashboard.tsx`

**Line 401** — replace:
```js
const groupedByVeiculo = buildGroupedData(b => b.dia_vencimento_veiculo);
```
with:
```js
const groupedByVeiculo = buildGroupedData(b => 
  b.dia_vencimento_veiculo ?? parseDayFromDate(b.data_vencimento_original)
);
```

The `parseDayFromDate` helper already exists at line 348. This ensures every boleto with at least one date reference gets assigned to the correct day, making the table total match the KPI total (4,729).

The same fallback should also be applied in the inadimplência calculations (lines ~218-220 and ~424-426) where `dia_vencimento_veiculo` is checked, so those boletos are not excluded from the real delinquency rate either.

### Additional lines to update (same fallback pattern)

- **Line 218-219**: `const diaVenc = b.dia_vencimento_veiculo;` → `const diaVenc = b.dia_vencimento_veiculo ?? parseDayFromDate(b.data_vencimento_original);`
- **Line 425**: Same change
- **Line 452**: Same change

This is a ~4-line change in a single file.

