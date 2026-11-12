# Comercial — permissões por hierarquia

Regra aplicada **no banco** (RLS + triggers, migration `0038_comercial_hierarquia_cotacoes.sql`).
A tela só se adapta; chamada direta à API sem permissão não devolve/grava nada.

## Níveis (reaproveita o cadastro de usuários)

| Nível no Comercial | Quem é no UONI | Vínculo usado |
|---|---|---|
| Administrador | papel `superintendente`/`admin`, ou cargo com o subitem **Visão geral (todos os leads e cotações)** liberado | — |
| Gerente | papel `administrativo` | líderes com *Administrativo responsável* = ele |
| Líder | papel `lider` | diretos com *Líder direto* = ele **ou** da equipe que ele lidera |
| Vendedor (Direto) | demais internos (papel `comercial` etc.) | — |

O dono de um lead/cotação é o **usuário vinculado ao vendedor** (Comercial → Vendedores).
Vendedor sem usuário vinculado: os registros dele só aparecem para o administrador.

## O que cada um faz

| Ação | Vendedor | Líder | Gerente | Admin |
|---|---|---|---|---|
| Ver | próprios | próprios + equipe | próprios + suas equipes | tudo |
| Criar lead/cotação | para si | para si | para si e suas equipes | todos |
| Editar | próprios | só próprios (equipe: leitura) | suas equipes | todos |
| Comentar | próprios | equipe | suas equipes | todos |
| Transferir lead | — | — | dentro das suas equipes | todos |
| Cancelar cotação | solicita | solicita | aprova/cancela com justificativa | todos |
| Excluir | ninguém — gerente/admin **arquivam** | | | |
| Painel / exportar | próprio / — | equipe / — | suas equipes / CSV | geral / CSV |
| Auditoria | — | — | suas equipes | completa |
| Funis e vendedores | — | — | cadastra/edita | cadastra/edita |

Cotação: Vendedor/Líder editam até *Aprovada*, *Emitida*, *Cancelada* ou *Cancelamento solicitado*; depois só o gerente.

## Casos especiais

- **Troca de equipe** (mudou líder/equipe/administrativo do usuário, ou o líder da equipe):
  registros **em aberto** passam para a nova cadeia; leads fechados e cotações emitidas/canceladas
  continuam com a equipe de origem (colunas `lider_id`/`gerente_id` gravadas no registro).
- **Inativação**: usuário inativo perde acesso na hora (o nível vira "nenhum").
- **Transferência do lead** leva junto as cotações em aberto.
- **Proteção**: ninguém (exceto superintendente/admin) altera o próprio cargo, equipe, vínculos ou status.
- **Auditoria** (`comercial_auditoria`): criação, edição, mudança de etapa/status, transferência,
  arquivamento, cancelamento, pedido de cancelamento, comentário, cadastro, mudança de vínculo e de nível.
- **Notificações** (`comercial_notificacoes`): comentário → vendedor responsável; pedido de cancelamento →
  gerente (ou admins, se não houver); mudança de status feita por outra pessoa → vendedor.

## Pendências conhecidas

- "Leads órfãos" de usuário inativado: o gerente/admin continua vendo e pode transferir,
  mas ainda não há alerta automático para redistribuição.
- Regra "Direto sem Líder / Líder sem Gerente" continua validada só no cadastro (tela).
