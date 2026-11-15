# Comercial → proposta → contrato (Uon1 Sign)

Liga a cotação do Comercial ao Uon1 Sign. Migration: `0044_comercial_proposta.sql`.
Código do servidor: ações `prop_*` em `supabase/functions/uonisign/index.ts`.

## Como funciona

1. **Tabela de preços** (Comercial → botão "Tabela de preços", só administrador):
   cada produto aponta para um modelo de contrato e ganha valores padrão. Os
   itens da proposta são os campos dos grupos **Valores** e **Vigência** do
   modelo (`campoComercial` em `modelo.ts`). Campo marcado como travado o
   vendedor não altera (o banco regrava o valor da tabela).
2. **Cotação**: ao escolher um produto com modelo, aparecem os "Valores da
   proposta". O total é calculado pelos campos `soma_valor` do modelo.
3. **Dois caminhos**:
   - **Enviar proposta ao cliente** (e-mail obrigatório, WhatsApp opcional):
     o cliente abre `/proposta/:token`, vê os valores, aceita com código de 6
     dígitos, preenche os dados cadastrais e cai direto em `/assinar/:token`.
   - **Preencher o contrato eu mesmo**: abre o assistente do Uon1 Sign com
     modelo e valores prontos; segue o envio normal.
4. **Amarração**: aceite → cotação "Aprovada"; contrato assinado por todos →
   cotação "Emitida" e lead na etapa de ganho (gatilho
   `comercial_contrato_assinado`).

## Regras

- Proposta vale 15 dias (`PROPOSTA_VALIDADE_DIAS`).
- O aceite guarda data, IP, dispositivo, canal, contato e um retrato dos
  valores (`aceite_termos`). Depois do aceite, produto e valores não mudam.
- Aceite, link, sessão e contrato da cotação só são gravados pelo servidor
  (gatilho `comercial_cotacao_proposta_guard`).
- O contrato gerado pela proposta pertence ao vendedor da cotação
  (`created_by`), então a visibilidade do Uon1 Sign vale igual: vendedor vê os
  próprios; líder e gerente, a equipe.
- Valores do contrato vêm sempre do que foi aceito, nunca do navegador.

## Limitação conhecida

O PDF do contrato é montado no navegador (mesmo código do assistente interno).
No caminho do cliente, isso acontece no navegador dele: o servidor guarda o
texto oficial (`contratos.conteudo_html`), mas não confere se o PDF enviado
corresponde a ele. A Contratada assina depois e vê o PDF antes de assinar.
Gerar o PDF no servidor elimina essa brecha.

## Mensagens

- E-mail: template `uonisign_proposta` (Central de Atendimento → Templates).
  Variáveis: `{{nome}}`, `{{contrato}}` (produto), `{{numero}}` (COT-000123),
  `{{valor}}`, `{{prazo}}`, `{{empresa}}`, `{{link}}`.
- WhatsApp: template Meta `uonisign_proposta` (6 variáveis + botão com
  `https://vangard.uon1.com.br/proposta/{{1}}`), ligado em Uon1 Sign →
  Mensagens → WhatsApp.
