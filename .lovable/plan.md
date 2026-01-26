

# Plano: Marcar Checkboxes de Regionais e Voluntários

## Problema Identificado

O arquivo exportado tem 6.207 registros, mas as colunas **Voluntário**, **Cooperativa** e **Regional** estão vazias porque o script **não marca esses checkboxes** no portal Hinova.

A função `configurarCheckboxesSituacaoBoleto` (linhas 3120-3123) explicitamente diz:
```
// Outros checkboxes (Regional, Cooperativa, etc) permanecem inalterados
```

O portal Hinova provavelmente exige que os checkboxes de Regionais/Cooperativas e Voluntários estejam marcados para incluir esses dados no relatório.

---

## Solução

### 1. Criar função para marcar TODOS os checkboxes de Regionais/Cooperativas

```text
Nova funcao: configurarCheckboxesRegionaisVoluntarios(page)

Etapas:
1. Identificar secoes de filtros: Regional, Cooperativa, Voluntario
2. Marcar TODOS os checkboxes dessas secoes
3. Verificar e logar quantos foram marcados
```

### 2. Modificar o fluxo principal

Adicionar chamada da nova funcao ANTES da configuracao de Situacao Boleto:

```text
FILTROS (ordem atual):
1. Data Vencimento Original ✓
2. Layout ✓
3. Forma Exibicao Excel ✓
4. Situacao Boleto ✓

FILTROS (nova ordem):
1. Data Vencimento Original ✓
2. [NOVO] Regionais - MARCAR TODOS
3. [NOVO] Cooperativas - MARCAR TODOS  
4. [NOVO] Voluntarios - MARCAR TODOS
5. Layout ✓
6. Forma Exibicao Excel ✓
7. Situacao Boleto ✓
```

---

## Implementacao Tecnica

### Arquivo: `scripts/robo-cobranca-hinova.cjs`

#### Modificacao 1: Nova funcao `configurarCheckboxesRegionaisVoluntarios`

```javascript
async function configurarCheckboxesRegionaisVoluntarios(page) {
  log('Configurando checkboxes de Regionais, Cooperativas e Voluntarios...');
  
  const resultado = await page.evaluate(() => {
    const stats = { regional: 0, cooperativa: 0, voluntario: 0, total: 0 };
    
    // Funcao para identificar secao pelo texto
    const identificarSecao = (elemento) => {
      const texto = (elemento?.textContent || '').toUpperCase();
      if (texto.includes('REGIONAL')) return 'regional';
      if (texto.includes('COOPERATIVA')) return 'cooperativa';
      if (texto.includes('VOLUNTARIO') || texto.includes('VOLUNTÁRIO')) return 'voluntario';
      return null;
    };
    
    // Encontrar TODAS as TRs/TDs que contem checkboxes
    const todosCheckboxes = document.querySelectorAll('input[type="checkbox"]');
    
    for (const cb of todosCheckboxes) {
      // Verificar se ja esta marcado
      if (cb.checked) continue;
      
      // Encontrar container pai (tr ou td)
      const container = cb.closest('tr') || cb.closest('td') || cb.parentElement;
      const secao = identificarSecao(container);
      
      if (secao) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
        stats[secao]++;
        stats.total++;
      }
    }
    
    return stats;
  });
  
  log(`Checkboxes marcados: ${resultado.total} total`);
  log(`  - Regionais: ${resultado.regional}`);
  log(`  - Cooperativas: ${resultado.cooperativa}`);
  log(`  - Voluntarios: ${resultado.voluntario}`);
  
  return resultado;
}
```

#### Modificacao 2: Chamada da nova funcao no fluxo principal

Adicionar ANTES da linha 3117 (configuracao de Situacao Boleto):

```javascript
// ============================================
// CONFIGURACAO DE CHECKBOXES - REGIONAIS E VOLUNTARIOS
// ============================================
log('Marcando todos os checkboxes de Regionais e Voluntarios...');
try {
  await configurarCheckboxesRegionaisVoluntarios(page);
} catch (err) {
  log(`Aviso: Erro ao marcar regionais/voluntarios: ${err.message}`, LOG_LEVELS.WARN);
  // Nao interrompe - apenas aviso
}

await page.waitForTimeout(500);
```

#### Modificacao 3: Expandir debug de estado dos filtros

Modificar a funcao de debug (linhas 3138-3188) para incluir checkboxes de Regionais/Voluntarios:

```javascript
// Verificar checkboxes de TODAS as secoes (nao apenas Situacao Boleto)
const checkboxes = document.querySelectorAll('input[type="checkbox"]');
const secoes = {
  situacao: { marcados: [], desmarcados: [] },
  regional: { marcados: [], desmarcados: [] },
  cooperativa: { marcados: [], desmarcados: [] },
  voluntario: { marcados: [], desmarcados: [] },
  outros: { marcados: [], desmarcados: [] },
};

for (const cb of checkboxes) {
  const container = cb.closest('tr') || cb.closest('td') || cb.parentElement;
  const texto = (container?.textContent || '').toUpperCase();
  
  let secao = 'outros';
  if (texto.includes('SITUACAO') || texto.includes('SITUAÇÃO')) secao = 'situacao';
  else if (texto.includes('REGIONAL')) secao = 'regional';
  else if (texto.includes('COOPERATIVA')) secao = 'cooperativa';
  else if (texto.includes('VOLUNTARIO') || texto.includes('VOLUNTÁRIO')) secao = 'voluntario';
  
  const label = cb.value || cb.name || 'checkbox';
  if (cb.checked) {
    secoes[secao].marcados.push(label);
  } else {
    secoes[secao].desmarcados.push(label);
  }
}
```

---

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `scripts/robo-cobranca-hinova.cjs` | Adicionar funcao e chamada para marcar checkboxes |

---

## Resultado Esperado

1. O script marcara TODOS os checkboxes de Regionais, Cooperativas e Voluntarios
2. O relatorio baixado incluira dados nessas colunas
3. Logs mostrarao quantos checkboxes foram marcados em cada secao
4. Debug salvara estado completo de TODOS os filtros (nao apenas Situacao Boleto)

