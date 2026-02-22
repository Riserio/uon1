
## Melhorias na Agenda

### 1. Botao de desconectar direto (sem menu 3 pontinhos)
Substituir o `DropdownMenu` com `MoreVertical` por um botao direto de desconectar (icone de `Unlink2` ou `Trash2`) com cor vermelha, visivel e funcional ao lado do Switch. Isso elimina o clique extra nos 3 pontinhos que atualmente nao funcionam corretamente.

### 2. Visualizacao padrao como Lista
- Alterar o estado inicial de `activeView` de `'month'` para `'list'`.
- Reordenar o array `viewButtons` para que "Lista" seja o primeiro item, seguido de Mes, Semana e Dia.

### Detalhes tecnicos

**Arquivo:** `src/pages/Agenda.tsx`

**Mudanca 1 - Desconectar direto (linhas 408-423):**
Remover o `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem` e substituir por um simples `Button` com icone `Unlink2` e tooltip ou title "Desconectar", com `onClick={() => disconnectAccount(integration.id)}` e estilo `text-destructive`.

**Mudanca 2 - View padrao e ordem (linhas 114 e 320-325):**
- Linha 114: `useState<CalendarView>('list')` em vez de `'month'`
- Reordenar `viewButtons` para: Lista, Mes, Semana, Dia

**Imports:** Remover `MoreVertical` do import de lucide-react (nao sera mais usado).
