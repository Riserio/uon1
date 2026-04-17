
The user wants:
1. Move "Gerenciar Ausências" button from Análise de Funcionário → Jornada de Trabalho.
2. Allow abonar **horas** (not just days) — accessible from:
   - Registro manual de ponto (the "+" / manual entry dialog)
   - Pencil/edit on history items
3. In Anexos de Ponto, when type = atestado → allow abonar **dias OU horas**.
4. Análise de Funcionário must still consume these abono records (already does for days; needs to discount hours from "atrasos" or add to saldo).

## Plan

### 1. Database — extend abono support to hours
- Add to `ausencias_funcionario`:
  - `tipo_abono` (`dia` | `hora`) default `dia`
  - `horas_abonadas` (numeric, default 0) — used when `tipo_abono = 'hora'`
  - `data_referencia` (date) — single date when it's an hour-abono
- Add to `anexos_ponto`:
  - `horas_abonadas` (numeric, default 0) — already has `dias_abonados`

### 2. Move "Gerenciar Ausências" to Jornada de Trabalho
- Remove the button from `AnaliseFuncionario.tsx`.
- Add it to `GestaoJornada.tsx` header (visible only to admin/administrativo/superintendente), opening `GerenciarAusenciasDialog`.

### 3. Extend `GerenciarAusenciasDialog`
- Add toggle: "Abonar dia(s) inteiro(s)" vs "Abonar horas"
- When "horas": show single date + hours input (instead of date range).
- List view: show "X horas abonadas em DD/MM" for hour-type entries.

### 4. Hour abono in `AjusteManualPontoDialog`
- Add a new mode/checkbox: "Registrar abono de horas" (instead of a clock-in record).
- When checked: hides tipo/hora fields, shows hours input → on save, inserts into `ausencias_funcionario` as `tipo_abono='hora'`.
- When editing existing register (pencil): keep current behavior, but if the underlying record is an abono, allow editing hours.

### 5. Anexos de Ponto — atestado with hours
- In `AnexosPontoDialog.tsx`, when `tipo === 'atestado'`:
  - Add radio: "Abonar dias" | "Abonar horas"
  - Show `dias_abonados` OR `horas_abonadas` accordingly.
- Update insert logic.
- History: show both metrics per anexo.

### 6. Análise de Funcionário — consume hour abonos
- Already adds full days to `abonadosSet` (skip lateness/absence).
- For hour-abonos: subtract `horas_abonadas` from total `atrasoMin` (or add to `saldo`) for that date.
- Pull `horas_abonadas` from both `ausencias_funcionario` (tipo='hora') and `anexos_ponto` (atestado).

### Files to modify
- New migration: schema changes on `ausencias_funcionario` and `anexos_ponto`.
- `src/components/gestao/GerenciarAusenciasDialog.tsx` — add hours mode.
- `src/components/gestao/GestaoJornada.tsx` — add gerenciar ausências button.
- `src/components/gestao/AnaliseFuncionario.tsx` — remove button; consume horas_abonadas.
- `src/components/gestao/AjusteManualPontoDialog.tsx` — add abono-de-horas mode.
- `src/components/gestao/AnexosPontoDialog.tsx` — atestado: dias OU horas.

### Access control
All abono-related actions remain restricted to `admin`, `administrativo`, `superintendente`.

<lov-actions>
<lov-suggestion message="Aprovar o plano e implementar tudo">Aprovar e implementar</lov-suggestion>
<lov-suggestion message="Após implementar, teste registrando um abono de horas e verifique se o atraso é descontado corretamente na Análise">Testar fluxo de abono de horas</lov-suggestion>
</lov-actions>
