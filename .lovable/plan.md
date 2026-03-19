

## Plano: Pagina "Ajuda" — Central de Treinamento

Criar uma pagina completa `/ajuda` com conteudo didatico preenchido para todos os 19 modulos do sistema, acessivel pelo menu lateral como "Ajuda".

### Arquivos

**1. `src/data/treinamentoContent.ts`** — Conteudo completo de todos os modulos

Array com 19 modulos, cada um contendo:
- Icone, titulo, descricao geral
- Lista de topicos (accordion), cada topico com:
  - Titulo da funcionalidade
  - Explicacao passo a passo (texto didatico, simples)
  - Dicas praticas ("Voce sabia que...")

Modulos cobertos:
1. Painel — KPIs, graficos, alertas, agenda semanal
2. Atendimentos — Kanban, fluxos, criar/editar, historico, anexos, prazos
3. Associacoes — Cadastro, slug, parceiros, upload em massa, historico
4. Termos de Aceite — Criar, visualizar, gerenciar termos
5. Contatos — Busca, cadastro, edicao
6. Sinistros — Abertura, deliberacao, vistoria digital/manual, acompanhamento publico
7. Financeiro — Lancamentos, contas pagar/receber, fluxo de caixa, conciliacao, notas fiscais
8. Agenda — Criar reuniao, convites, Google Calendar
9. Documentos — Upload, organizacao, busca
10. Central de Atendimento — WhatsApp, email, templates, fluxos automaticos
11. Mensagens — Chat interno entre usuarios
12. BI Indicadores — PID, SGA (Eventos), MGF, Cobranca, Estudo de Base, importacao, dashboards
13. Ouvidoria — Backoffice, formulario publico, widgets, links, configuracao
14. Uon1 Sign — Contratos digitais, templates, assinatura, status
15. Uon1 Talk — Video chamadas, salas
16. Comunicados — Criar e enviar comunicados internos
17. Gestao — Funcionarios, contratos, jornada, ponto, fechamento mensal
18. Configuracoes — Aparencia, logos, seguranca 2FA, notificacoes, permissoes
19. Usuarios — Aprovacao, roles, permissoes de menu e fluxo

**2. `src/pages/Treinamento.tsx`** — Pagina principal

- Header com titulo "Ajuda" e subtitulo "Aprenda a usar cada area do sistema"
- Campo de busca que filtra modulos e topicos em tempo real
- Grid responsivo de cards (1 col mobile, 2 cols tablet, 3 cols desktop)
- Cada card: icone colorido + titulo + descricao curta
- Ao clicar no card, abre uma area expandida com accordions dos topicos
- Cada topico tem explicacao em texto claro + caixa de "Dica" destacada
- Design seguindo o padrao widget moderno (rounded-2xl, bg-muted/40)

**3. `src/App.tsx`** — Adicionar rota `/ajuda` (lazy loaded, protegida)

**4. `src/components/AppSidebar.tsx`** — Adicionar item "Ajuda" com icone `HelpCircle` no grupo "ferramentas", antes de Configuracoes

### Sem alteracoes no banco de dados
Todo o conteudo e estatico/hardcoded. Nao requer migracao.

