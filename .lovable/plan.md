
# Plano: Correção do Preenchimento de "Data Vencimento Original" na Automação Hinova

## Diagnóstico do Problema

O robô de automação está falhando ao tentar preencher os campos de "Data Vencimento Original" no portal Hinova, com o erro:
```
[ERROR] Campo Data Vencimento Original não encontrado - verifique a estrutura do formulário
```

### Análise da Screenshot do Portal
A screenshot mostra a estrutura do formulário com:
- Label "Data Vencimento Original:" na coluna da esquerda
- Dois campos de input separados por "à" (início e fim)
- Estrutura de tabela HTML tradicional

### Problema no Código Atual
O código em `scripts/robo-cobranca-hinova.cjs` (linhas 3093-3188) usa duas estratégias:

1. **Busca por label exato** - Procura elementos com texto `'Data Vencimento Original:'` e depois busca inputs na mesma linha `<tr>`
2. **Fallback por name** - Tenta encontrar inputs por nomes específicos (`dt_vencimento_original_ini`, etc.)

**O problema**: Ambas as estratégias estão falhando porque:
- A estrutura HTML do portal pode ter o label em uma TD e os inputs em TDs separadas na mesma linha
- O texto pode ter espaços extras ou caracteres não visíveis
- Os inputs podem não ter os `name` esperados

---

## Solução Proposta

### Estratégia Multi-Camada de Busca

Implementar 5 estratégias de busca em cascata, da mais específica para a mais genérica:

```text
┌─────────────────────────────────────────────────────────────────┐
│                   ESTRATÉGIAS DE BUSCA                          │
├─────────────────────────────────────────────────────────────────┤
│ 1. Busca por label exato na mesma TR                            │
│    └─> Encontra "Data Vencimento Original:" e busca inputs      │
│        na mesma linha <tr>                                      │
│                                                                 │
│ 2. Busca por label com texto parcial (contains)                 │
│    └─> Procura elementos que CONTENHAM "vencimento original"    │
│        (case-insensitive, sem acentos)                          │
│                                                                 │
│ 3. Busca em TRs adjacentes                                      │
│    └─> Label pode estar em uma TR e inputs na próxima TR        │
│                                                                 │
│ 4. Busca por placeholder/title dos inputs                       │
│    └─> Inputs podem ter atributos como placeholder="dd/mm/yyyy" │
│                                                                 │
│ 5. Busca por padrão de data (inputs com máscara de data)        │
│    └─> Encontra pares de inputs com formato de data que         │
│        estejam entre campos conhecidos                          │
│                                                                 │
│ 6. Fallback por name/id parcial                                 │
│    └─> input[name*="venc"][name*="orig"]                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Alterações no Código

### Arquivo: `scripts/robo-cobranca-hinova.cjs`

**Seção a ser modificada**: Linhas 3093-3201

```javascript
// NOVA IMPLEMENTAÇÃO - Preenchimento robusto de Data Vencimento Original
const preencheuDatas = await page.evaluate(({ inicio, fim }) => {
  const resultado = { sucesso: false, detalhes: [], inputsEncontrados: [] };
  
  // Função para normalizar texto (remover acentos, lowercase, trim)
  const normalizar = (texto) => {
    return (texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  };
  
  // Função para preencher inputs
  const preencherInputs = (inputIni, inputFim, origem) => {
    try {
      inputIni.value = inicio;
      inputIni.dispatchEvent(new Event('input', { bubbles: true }));
      inputIni.dispatchEvent(new Event('change', { bubbles: true }));
      
      inputFim.value = fim;
      inputFim.dispatchEvent(new Event('input', { bubbles: true }));
      inputFim.dispatchEvent(new Event('change', { bubbles: true }));
      
      resultado.sucesso = true;
      resultado.detalhes.push(`✅ Preenchido via ${origem}`);
      resultado.inputsEncontrados.push({
        ini: { name: inputIni.name, id: inputIni.id },
        fim: { name: inputFim.name, id: inputFim.id }
      });
      return true;
    } catch (e) {
      resultado.detalhes.push(`Erro ao preencher: ${e.message}`);
      return false;
    }
  };
  
  // ESTRATÉGIA 1: Busca por texto exato/parcial em TDs
  const termosBusca = [
    'Data Vencimento Original:',
    'Data Vencimento Original',
    'Vencimento Original:',
    'Vencimento Original'
  ];
  
  const tds = document.querySelectorAll('td, th');
  
  for (const td of tds) {
    const textoNorm = normalizar(td.textContent || '');
    
    const encontrou = termosBusca.some(termo => 
      textoNorm === normalizar(termo) || 
      textoNorm.includes(normalizar('vencimento original'))
    );
    
    if (!encontrou) continue;
    
    resultado.detalhes.push(`Label encontrado: "${td.textContent?.trim().substring(0, 50)}"`);
    
    // Buscar TR pai
    const tr = td.closest('tr');
    if (tr) {
      const inputs = tr.querySelectorAll('input[type="text"], input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"])');
      resultado.detalhes.push(`Inputs na TR: ${inputs.length}`);
      
      if (inputs.length >= 2) {
        if (preencherInputs(inputs[0], inputs[1], 'TR direta')) return resultado;
      }
      
      // Tentar TR seguinte (inputs podem estar na próxima linha)
      const nextTr = tr.nextElementSibling;
      if (nextTr && nextTr.tagName === 'TR') {
        const nextInputs = nextTr.querySelectorAll('input[type="text"], input:not([type="hidden"]):not([type="checkbox"])');
        if (nextInputs.length >= 2) {
          if (preencherInputs(nextInputs[0], nextInputs[1], 'TR seguinte')) return resultado;
        }
      }
    }
    
    // Tentar no próprio TD ou TD irmãs
    const tdsIrmas = td.parentElement?.querySelectorAll('td') || [];
    for (const tdIrma of tdsIrmas) {
      const inputs = tdIrma.querySelectorAll('input[type="text"], input:not([type="hidden"]):not([type="checkbox"])');
      if (inputs.length >= 2) {
        if (preencherInputs(inputs[0], inputs[1], 'TD irmã')) return resultado;
      }
    }
  }
  
  // ESTRATÉGIA 2: Buscar por name/id parcial
  resultado.detalhes.push('Tentando fallback por name/id...');
  
  const padroes = [
    // Padrão: prefixo_ini / prefixo_fim
    [/venc.*orig.*ini/i, /venc.*orig.*fim/i],
    [/dt_venc.*orig.*1/i, /dt_venc.*orig.*2/i],
    [/vencimento.*original.*de/i, /vencimento.*original.*ate/i],
  ];
  
  const todosInputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type="hidden"]):not([type="checkbox"])'));
  
  for (const [padraoIni, padraoFim] of padroes) {
    const inputIni = todosInputs.find(i => 
      padraoIni.test(i.name || '') || padraoIni.test(i.id || '')
    );
    const inputFim = todosInputs.find(i => 
      padraoFim.test(i.name || '') || padraoFim.test(i.id || '')
    );
    
    if (inputIni && inputFim) {
      if (preencherInputs(inputIni, inputFim, 'padrão regex')) return resultado;
    }
  }
  
  // ESTRATÉGIA 3: Buscar pares de inputs adjacentes com formato de data
  resultado.detalhes.push('Tentando busca por inputs adjacentes...');
  
  for (let i = 0; i < todosInputs.length - 1; i++) {
    const input1 = todosInputs[i];
    const input2 = todosInputs[i + 1];
    
    // Verificar se estão próximos no DOM (mesmo container)
    const container1 = input1.closest('td, div');
    const container2 = input2.closest('td, div');
    
    // Verificar se há texto "à" entre eles (comum no portal)
    const pai = input1.parentElement;
    if (pai && pai.textContent?.includes('à')) {
      // Verificar contexto - procurar "vencimento" ou "original" nas proximidades
      const contexto = pai.closest('tr')?.textContent?.toLowerCase() || '';
      if (contexto.includes('vencimento') && contexto.includes('original')) {
        resultado.detalhes.push(`Contexto encontrado: "${contexto.substring(0, 100)}"`);
        if (preencherInputs(input1, input2, 'contexto "à"')) return resultado;
      }
    }
  }
  
  // ESTRATÉGIA 4: Log de todos os inputs para debug
  resultado.detalhes.push(`Total de inputs de texto na página: ${todosInputs.length}`);
  todosInputs.slice(0, 20).forEach((input, idx) => {
    resultado.detalhes.push(`  Input ${idx}: name="${input.name}" id="${input.id}" value="${input.value}"`);
  });
  
  return resultado;
}, { inicio, fim });
```

### Melhorias Adicionais

1. **Log Detalhado de Debug**: Quando falhar, mostrar os primeiros 20 inputs encontrados para facilitar diagnóstico

2. **Screenshot de Alta Qualidade**: Capturar screenshot full-page quando falhar

3. **Dump de HTML Parcial**: Salvar apenas a seção do formulário ao invés da página inteira

---

## Resumo das Mudanças

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `scripts/robo-cobranca-hinova.cjs` | Modificar | Implementar 4 estratégias de busca em cascata para "Data Vencimento Original" |
| `scripts/robo-cobranca-hinova.cjs` | Adicionar | Log detalhado de todos os inputs quando falhar |
| `scripts/robo-cobranca-hinova.cjs` | Melhorar | Normalização de texto (acentos, espaços, case) |

---

## Benefícios

- **Resiliência**: Múltiplas estratégias garantem que mudanças pequenas no portal não quebrem a automação
- **Debug**: Logs detalhados facilitam diagnóstico de problemas futuros
- **Manutenção**: Código estruturado facilita adicionar novas estratégias se necessário
