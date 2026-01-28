
# Plano: Aumentar Tempo de Espera e Implementar Espera Inteligente Após Seleção do Layout

## Problema Identificado

Após selecionar o layout "BI - VANGARD COBRANÇA", o script aguarda apenas **10 segundos fixos** antes de prosseguir. Porém, as seções que aparecem apenas com este layout (como "Vencimento do Veículo", "Dias de Vencimento" e "Dias de Atraso") podem demorar mais para carregar completamente no portal Hinova.

Isso explica por que os campos "Dias de Vencimento" e "Dias de Atraso" não estão sendo exportados no Excel — o script prossegue antes que essas configurações estejam disponíveis.

---

## Solução Proposta

### 1. Aumentar o Tempo Base de Espera

Aumentar o tempo fixo de **10 segundos para 20 segundos** como margem de segurança inicial.

### 2. Implementar Espera Inteligente por Elemento

Após os 20 segundos iniciais, o script deve **verificar ativamente** se elementos específicos do layout BI já estão visíveis antes de prosseguir:

```text
┌─────────────────────────────────────────────────────────────┐
│           Espera Inteligente Após Layout BI                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Selecionar layout "BI - VANGARD COBRANÇA"               │
│                     ↓                                       │
│  2. Aguardar 20 segundos (tempo base)                       │
│                     ↓                                       │
│  3. Verificar se "Vencimento do Veículo" apareceu           │
│     ├── Se SIM → Configurações carregadas, prosseguir       │
│     └── Se NÃO → Aguardar mais 5s e verificar novamente     │
│                  (até 3 tentativas = +15s extra)            │
│                     ↓                                       │
│  4. Total máximo: 35 segundos                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3. Logs de Diagnóstico

Adicionar logs que informem:
- Quanto tempo foi aguardado
- Se a seção "Vencimento do Veículo" foi detectada
- Se campos dinâmicos do layout foram identificados

---

## Alterações no Código

**Arquivo:** `scripts/robo-cobranca-hinova.cjs`

**Localização:** Após a validação do layout (linha ~3303)

**Código a implementar:**

```javascript
// ========================================
// AGUARDAR CONFIGURAÇÕES CARREGAREM APÓS LAYOUT
// ========================================
log('⏳ Aguardando configurações do layout carregarem...', LOG_LEVELS.INFO);

// Tempo base de 20 segundos
await page.waitForTimeout(20000);

// Verificar se elementos específicos do layout BI apareceram
let layoutCarregado = false;
const maxTentativas = 3;
const intervaloExtra = 5000; // 5 segundos extras por tentativa

for (let tentativa = 1; tentativa <= maxTentativas && !layoutCarregado; tentativa++) {
  // Verificar se "Vencimento do Veículo" está visível (elemento exclusivo do layout BI)
  const vencimentoVeiculoVisivel = await page.evaluate(() => {
    const elementos = document.querySelectorAll('td, th, div, span, label');
    for (const el of elementos) {
      const texto = (el.textContent || '').toUpperCase();
      if (texto.includes('VENCIMENTO DO VEÍCULO') || texto.includes('VENCIMENTO DO VEICULO')) {
        return true;
      }
    }
    return false;
  });

  if (vencimentoVeiculoVisivel) {
    log('✅ Seção "Vencimento do Veículo" detectada - Layout BI carregado completamente!', LOG_LEVELS.SUCCESS);
    layoutCarregado = true;
  } else if (tentativa < maxTentativas) {
    log(`⏳ Seção não detectada ainda. Aguardando mais ${intervaloExtra/1000}s... (tentativa ${tentativa}/${maxTentativas})`, LOG_LEVELS.INFO);
    await page.waitForTimeout(intervaloExtra);
  }
}

if (!layoutCarregado) {
  log('⚠️ Seção "Vencimento do Veículo" não detectada após espera. Prosseguindo mesmo assim...', LOG_LEVELS.WARN);
  log('   Os campos "Dias de Vencimento" e "Dias de Atraso" podem não estar disponíveis.', LOG_LEVELS.WARN);
}

log('✅ Tempo de espera concluído!', LOG_LEVELS.SUCCESS);
```

---

## Resumo das Mudanças

| Aspecto | Antes | Depois |
|---------|-------|--------|
| **Tempo base** | 10 segundos fixos | 20 segundos base |
| **Espera extra** | Nenhuma | Até +15 segundos (3 × 5s) |
| **Total máximo** | 10 segundos | 35 segundos |
| **Validação** | Nenhuma | Verifica se "Vencimento do Veículo" apareceu |
| **Diagnóstico** | Básico | Logs detalhados sobre carregamento |

---

## Resultado Esperado

1. O portal terá tempo suficiente para carregar todas as seções dependentes do layout BI
2. As colunas "Dias de Vencimento" e "Dias de Atraso" serão incluídas no relatório Excel
3. Se o carregamento demorar demais, um aviso será exibido nos logs para diagnóstico
4. O script não ficará travado indefinidamente graças ao limite de 35 segundos
