# Painel inicial

Página: `src/pages/Dashboard.tsx`. Blocos em `src/components/painel/`.

| Bloco | Quem vê | De onde vem |
|---|---|---|
| Radar do mercado | todos | `mercado_noticias` + `comunicados` |
| Avisos e alertas | todos (itens conforme o módulo) | contratos, cotações, WhatsApp, mensagens |
| Agenda e reuniões | módulos Agenda / Uon1 Talk | `eventos` do usuário + `meeting_rooms` |
| Comercial | módulo Comercial com nível no funil | `comercial_leads`, `comercial_cotacoes` |
| Contratos | módulo Uon1 Sign | `contratos` |
| Painel operacional | administrador e superintendente | automações, e-mails, WhatsApp, radar |

Os números de Comercial e Contratos vêm filtrados pela RLS: vendedor vê os
próprios, líder e gerente a equipe, administrador tudo. A tela não filtra nada
por conta própria.

## Radar do mercado

Migration `0045_painel_radar_mercado.sql`. A coleta roda no banco, sem edge
function: `pg_cron` chama `mercado_radar_buscar()` (minutos 11 e 41) e
`mercado_radar_processar()` (13 e 43).

- **Fontes** (`mercado_fontes`): buscas do Google Notícias restritas por site
  (gov.br/SUSEP, Câmara, Senado, STJ, STF; CQCS, CNseg, Revista Apólice, Sonho
  Seguro) e os feeds diretos do CQCS, Revista Apólice e Sonho Seguro. A SUSEP
  não publica RSS no portal gov.br, por isso entra pela busca restrita.
- **Filtro**: host na lista da fonte, palavra-chave no título
  (`mercado_radar_config.palavras`), publicado nos últimos 365 dias e título
  com pelo menos 6 palavras. Notícia repetida entra uma vez (chave = título).
- **Guardamos** título, fonte, data e link. O texto fica no site de origem.
- Administrador pode ocultar uma notícia (ícone no cartão). Para trocar
  fontes ou palavras-chave, edite `mercado_fontes` / `mercado_radar_config`.
- O status de cada fonte aparece no Painel operacional.
