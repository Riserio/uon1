## Objetivo
Permitir escolher o **estilo visual** do formulário ao criar/editar: **Google Forms** (atual), **Typeform** (uma pergunta por vez, tela cheia) e **Sinistro** (formulário de análise antifraude com tipo, score, red flags, nexo causal).

## Escopo

### 1. Schema (migration)
- Adicionar coluna `estilo` na tabela `formularios`:
  - `text not null default 'google_forms'`
  - valores aceitos: `'google_forms' | 'typeform' | 'sinistro'`
- Regerar `types.ts` (automático).

### 2. Editor (`FormularioEditor.tsx`)
- Novo seletor **Estilo do formulário** no topo (3 cards visuais: Google Forms / Typeform / Sinistro).
- Para `google_forms` e `typeform`: editor de perguntas atual continua igual (mesmo schema de `formulario_perguntas`). A diferença é apenas a **renderização pública**.
- Para `sinistro`: o formulário é **predefinido** (gerado pelo prompt enviado) — esconde o editor de perguntas e mostra um aviso "Formulário de Análise de Sinistro — estrutura fixa, configurável apenas título/descrição/branding".

### 3. Renderização pública (`FormularioPublico.tsx`)
Roteamento por `estilo`:
- `google_forms` → layout atual (cards empilhados).
- `typeform` → componente novo `FormularioTypeform`:
  - Tela cheia, uma pergunta por vez
  - Botões "Anterior" / "Próximo" / Enter para avançar
  - Barra de progresso no topo (% perguntas respondidas)
  - Fundo no `cor_tema`, tipografia grande
  - Validação por pergunta antes de avançar
  - Mantém máscaras já implementadas (placa, CPF, CNPJ, CEP, telefone)
- `sinistro` → componente novo `FormularioSinistro` implementando exatamente a especificação do prompt:
  - Header fixo `bg-stone-900` com **logo Vangard + título "Formulário de Análise"** + score em tempo real (substitui o badge "SINISTRO")
  - `TipoSinistroSelector` (7 tipos)
  - 12 seções colapsáveis condicionais (`SECOES_POR_TIPO`, `BLOCOS_POR_TIPO`)
  - `RedFlagItem` com cálculo de `scoreRisco`
  - `NexoStep` (6 passos)
  - `ScoreAntifraude` com níveis Baixo/Atenção/Alto/Crítico
  - Submissão grava em `formulario_respostas` como JSON único (mesma tabela), preservando o pipeline atual.

### 4. Branding Vangard no estilo Sinistro
- Header usa o `BrandingCompartilhamento` já existente:
  - `og_titulo` (default "Vangard") como subtítulo
  - `og_imagem_url` (default logo Vangard) como logo no header
- Acessível em qualquer domínio; quando acessado via `vangard.uon1.com.br`, mostra branding da gestora.

### 5. Listagem (`Formularios.tsx`)
- Mostrar badge do estilo ("Google Forms" / "Typeform" / "Sinistro") em cada card.

## Estrutura de arquivos

```text
src/
├── pages/
│   ├── FormularioEditor.tsx          (editar: + seletor de estilo)
│   ├── FormularioPublico.tsx         (editar: roteia por estilo)
│   └── Formularios.tsx               (editar: badge de estilo)
├── components/formularios/
│   ├── FormularioGoogleForms.tsx     (extraído do publico atual)
│   ├── FormularioTypeform.tsx        (novo)
│   └── sinistro/
│       ├── FormularioSinistro.tsx    (orquestrador + estado global)
│       ├── Header.tsx
│       ├── TipoSinistroSelector.tsx
│       ├── SecaoFormulario.tsx
│       ├── CampoForm.tsx
│       ├── RadioGroup.tsx
│       ├── CheckGroup.tsx
│       ├── RedFlagItem.tsx
│       ├── ScoreAntifraude.tsx
│       ├── NexoStep.tsx
│       ├── constants.ts              (SECOES_POR_TIPO, BLOCOS_POR_TIPO, RED_FLAGS)
│       └── sections/S01..S12.tsx
└── supabase/migrations/<timestamp>_formularios_estilo.sql
```

## Pontos técnicos
- Estilo Sinistro grava `respostas` como JSON (mapa chave→valor + `_score` + `_redFlags`) em `formulario_respostas.respostas` (jsonb).
- Sem novas tabelas, sem mudança nas policies (a única alteração de schema é a coluna `estilo`).
- Mantém máscaras já implementadas para todos os estilos.
- Submit do Sinistro reaproveita a mesma edge function / insert atual.

## Fora do escopo
- Editor visual para Sinistro (estrutura é fixa, conforme pedido).
- Mudanças no PDF de respostas — o existente continua funcional para Google/Typeform; Sinistro também usa o mesmo `pdfExporter` com fallback genérico.

Confirma para implementar?
