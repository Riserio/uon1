

## Plano: Screenshots + Anotações na Central de Ajuda

### O que será feito

1. **Navegar por todas as telas principais do sistema**, tirar screenshots reais e salvá-las em `public/help/`
2. **Expandir a interface** para exibir imagens dentro dos tópicos, com lightbox para ampliar
3. **Vincular cada screenshot** ao tópico correspondente no conteúdo

### Alterações técnicas

**1. `src/data/treinamentoContent.ts`** — Adicionar campo `images` à interface
```typescript
export interface HelpTopic {
  title: string;
  steps: string[];
  tip?: string;
  images?: { src: string; caption: string }[];
}
```

**2. `src/pages/Treinamento.tsx`** — Renderizar imagens nos accordions
- Exibir imagens após os steps com bordas arredondadas, sombra e legenda
- Dialog lightbox ao clicar para ver em tamanho real
- Layout responsivo (1 coluna mobile, 2 colunas desktop quando há múltiplas imagens)

**3. Screenshots** — Capturas reais das telas
- Navegar pelo sistema e capturar as telas principais usando as ferramentas de browser
- Salvar em `public/help/` com nomes descritivos (ex: `painel-kpis.png`, `kanban-board.png`)
- Vincular aos tópicos relevantes no arquivo de conteúdo

### Telas a capturar (dependendo do acesso disponível)
- Painel/Dashboard, Kanban de Atendimentos, Sinistros, Financeiro, BI Indicadores, Agenda, Configurações, Usuários, Ouvidoria, Gestão, etc.

### Limitação
- Preciso que você esteja logado no preview para eu conseguir navegar e tirar os prints. Se a sessão não estiver ativa, vou pedir para você fazer login primeiro.

### Sem alterações no banco de dados

