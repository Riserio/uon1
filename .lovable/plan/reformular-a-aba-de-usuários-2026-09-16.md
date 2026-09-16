# Reformular a aba de Usuários

Hoje a área de Usuários tem 7 blocos lado a lado (Lista, Pendentes, Inativos, Equipes, Hierarquia, Cargos & Permissões, Logs) em um único arquivo gigante. O usuário precisa adivinhar em qual bloco está cada coisa, os cadastros falham com mensagens técnicas e não há um caminho claro de "criar pessoa → dar time → dar permissão".

## Nova organização (de 7 blocos para 4)

1. **Pessoas** — todos os usuários em uma lista só, com filtros rápidos por situação (Ativos / Pendentes / Inativos) e busca. Acaba a divisão em três abas separadas para a mesma lista.
2. **Estrutura** — equipes e a visão de hierarquia juntas: quem lidera quem, quem responde a quem, e a criação/edição de equipes no mesmo lugar.
3. **Permissões** — cargos, suas permissões de menu e o que cada perfil de sistema enxerga, com explicação da ordem de precedência (usuário > cargo > perfil).
4. **Histórico** — registro de ações, como já existe.

## Melhorias de usabilidade

- Cabeçalho com 4 indicadores (total, ativos, pendentes, equipes) mantido, mas cada indicador passa a filtrar a lista ao ser clicado.
- Linha de cada pessoa mostra em um golpe de vista: foto, nome, e-mail, perfil, cargo, equipe e situação. Ações (editar, ativar/inativar, redefinir senha, excluir) reunidas em um menu de três pontinhos.
- Assistente de novo usuário em 3 passos (já existente) com um resumo final antes de salvar e textos de ajuda explicando cada perfil.
- Ações em lote: selecionar várias pessoas e ativar, inativar ou mudar de equipe de uma vez.
- Estados vazios explicativos ("Nenhuma equipe cadastrada — crie a primeira aqui") em vez de listas em branco.

## Correções de erro

- **"duplicate key value violates unique constraint cargos_nome_key"**: ao cadastrar um cargo com nome já existente, mostrar "Já existe um cargo com esse nome" em vez do erro técnico, e checar o nome antes de salvar.
- Traduzir os demais erros de banco mais comuns (e-mail já cadastrado, campo obrigatório, registro em uso) para frases em português.

## Detalhes técnicos

- Quebrar `src/pages/Usuarios.tsx` (3.028 linhas) em componentes dentro de `src/components/usuarios/`: `PessoasTab`, `UsuarioWizard`, `EstruturaTab`, `PermissoesTab`, `HistoricoTab`, mantendo `Usuarios.tsx` só como casca com as abas e os indicadores.
- Reaproveitar `CargosPermissoesTab.tsx` dentro de Permissões; adicionar tratamento de `code === "23505"` nos `insert/update` de `cargos` e um helper `mensagemErroBanco()` compartilhado.
- Filtros de situação viram estado local derivado da mesma consulta de `profiles`, eliminando as três listas duplicadas.
- Nenhuma mudança de esquema no banco; regras de acesso (RLS) e a função `create-user` permanecem como estão.
