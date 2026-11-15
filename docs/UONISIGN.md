# uoniSign v2 — geração e assinatura de contratos

Implementa a especificação v2.1 (14/11/2026, PO Miriam M. Soares), com os ajustes
abaixo. Contratos criados antes continuam no **fluxo 1** (tela e link antigos)
até terminarem; todo contrato novo nasce no **fluxo 2**.

## Peças

| Onde | O quê |
|---|---|
| `drizzle/migrations/0039_uonisign_v2.sql` | colunas, status, códigos, versões de modelo, imutabilidade, RLS por hierarquia, bucket privado `uonisign`, cron horário |
| `drizzle/migrations/0040_uonisign_modelos.sql` | 3 modelos de adesão (gerado por `scripts/gerar-seed-uonisign.mjs` a partir de `docs/uonisign/modelos/*.html`) |
| `supabase/functions/uonisign/` | edge function única: `index.ts` (ações), `servicos.ts` (e-mail, WhatsApp, lacre, relatório), `modelo.ts` (validações, extenso, render — também usado pelas telas) |
| `src/components/uonisign/` | assistente de novo contrato, detalhe/ações, configuração de modelos, visualizador de PDF |
| `src/pages/AssinarContrato.tsx` | página pública `/assinar/:token` (um link por signatário) |

## Fluxo

1. **Modelo → Dados → Conferência → Signatários.** Validações de CPF/CNPJ (dígito), e-mail, telefone, CEP (ViaCEP com 3 s e preenchimento manual), valores > 0 com até 2 casas e extenso automático.
2. Na conferência o PDF é gerado **uma vez** (texto real, não imagem); o servidor calcula o SHA-256 e guarda o arquivo. A tela mostra esse mesmo arquivo. "Voltar e editar" descarta o PDF.
3. Envio: Contratante (nome e CPF do formulário, bloqueados; e-mail editável; WhatsApp opcional) e Contratada (pessoa fixa do modelo). Convite por e-mail sempre; WhatsApp opcional.
4. Assinatura: o signatário abre o próprio link, lê o PDF, marca o aceite, pede o código (e-mail ou WhatsApp), digita e assina. O hash é conferido antes de abrir e antes de assinar.
5. Ordem: 1º Contratante, 2º Contratada. A Contratada só recebe o convite depois.
6. Conclusão: relatório de assinaturas anexado ao PDF → lacre (quando configurado) → status **Assinado** → cópia a cada signatário (canais do convite) e ao vendedor.

## Regras (números da spec)

| Regra | Implementação |
|---|---|
| RN02/RN21 código | 6 dígitos, 10 min, uso único, hash no banco, 5 tentativas → bloqueio de 15 min, 5 códigos/hora |
| RN04 visibilidade | RLS: vendedor/parceiro → próprios; líder/gerente → equipe (mesma hierarquia do Comercial, `comercial_no_alcance`); operador/admin → todos. Contrato de outro pela URL → "não encontrado" |
| RN05 versão | trigger gera nova versão do modelo quando muda texto, campos ou signatário; contrato guarda versão e texto |
| RN09/RN24 hash | SHA-256 dos bytes do PDF calculado no servidor; conferido ao abrir, antes de assinar e na conclusão; divergência bloqueia e alerta admins |
| RN12 ordem | convite da Contratada só após a assinatura do Contratante |
| RN15 prazo | 15 dias **por convite** (a Contratada também tem o prazo inteiro); lembretes D+3, D+7, D+12; depois, "Expirado" |
| RN16 edição | contrato enviado não pode ser editado (trigger no banco) |
| RN17 cancelamento | vendedor cancela os próprios **só enquanto ninguém assinou**; depois disso, só o Admin. Sempre com motivo |
| RN19 reenvio | só pendentes, 3/dia por signatário; correção de contato só pelo Admin, com motivo e registro de antes/depois |
| RN20 | assinado não volta de status (trigger) |
| RN22 evidências | nome, CPF, contato validado, canal, data/hora do servidor, IP e user agent capturados no servidor, aceite e hash |
| RN25 guarda | `guardar_ate` = fim da vigência + 5 anos; trilha (`contrato_historico`) imutável; evidências congeladas; exclusão em cascata removida; bucket privado sem acesso direto |

## Perfis (proposta 8.1 — Q1 ainda em aberto)

Configurações → cargo/usuário → módulo **Uon1 Sign**:

- **Administrador uoniSign** (`contratos:admin`) — vê todos, cancela, corrige contato, configura modelos, vê IP na trilha. Superintendente/admin já são.
- **Operador uoniSign** (`contratos:operador`) — vê todos, reenvia, baixa.
- Sem nenhum dos dois: vendedor (hierarquia acima).

Esses dois subitens (e o `comercial:todos-leads`) só valem quando **liberados**: sem marcação = não. Antes a tela de permissões mostrava como herdado do módulo, mas o banco tratava como bloqueado.

## O que foi mantido do sistema atual (melhor que a spec)

- **Vários modelos** e a tela de templates: a spec deixava para a fase 2. A seleção só aparece quando há mais de um modelo ativo.
- **Rascunho**: dá para fechar o assistente e continuar depois (botão ▶ no card).
- Contratos do fluxo 1 continuam funcionando até o fim.

## Diferenças em relação à spec

- **Login do vendedor**: usa o login do UONI (cargo e hierarquia já existentes), não um cadastro paralelo por código. RN01–RN03 ficam com a autenticação do UONI.
- **WhatsApp**: reaproveita a integração Meta já usada pelo UONI (secrets `META_WHATSAPP_TOKEN` e `META_WHATSAPP_PHONE_NUMBER_ID`).
- **Extenso** segue a norma, sem vírgula: "mil duzentos e cinquenta reais e cinquenta centavos"; "mil e cem", "dois mil e quinhentos", "um milhão de reais".
- **Vigência**: campos de data de início e vigência em meses (a spec não tinha, mas a RN25 dependia deles).

## Para colocar em produção

1. Aplicar `0039_uonisign_v2.sql` e depois `0040_uonisign_modelos.sql` (Lovable, sem modificações).
2. Publicar as funções `uonisign` e `enviar-lembretes-assinatura`.
3. Publish do front.
4. **uoniSign → Modelos → Configurar**: CNPJ, endereço e representante da Vangard e o **signatário fixo** (Q3). Enquanto isso, o envio fica bloqueado com aviso.
5. **Templates de WhatsApp** na Meta (Mensagens → Templates), idioma `pt_BR`. Até serem aprovados, o WhatsApp falha e o e-mail segue normalmente:
   - `uonisign_convite` (Utilidade): "Olá, {{1}}. Você recebeu o contrato {{2}} para assinatura eletrônica. Acesse: {{3}}"
   - `uonisign_codigo` (Autenticação): código {{1}} com botão "copiar código"
   - `uonisign_lembrete` (Utilidade): "Olá, {{1}}. O contrato {{2}} aguarda sua assinatura há {{3}} dia(s). Acesse: {{4}}"
   - `uonisign_concluido` (Utilidade): "Olá, {{1}}. O contrato {{2}} foi assinado por todas as partes. Baixe sua cópia: {{3}}"
   - `uonisign_aviso` (Utilidade): "Olá, {{1}}. Atualização sobre o contrato {{2}}: {{3}}."
   Os nomes podem ser trocados pelos secrets `UONISIGN_WA_TEMPLATE_<TIPO>`.
6. Opcional: `UONISIGN_EMAIL_FROM` (remetente padrão quando o vendedor não tem `resend_config`).
7. Aplicar também `0041_uon1_trust.sql` e publicar `uon1-trust` (ver `docs/UON1_TRUST.md`).

## Lacre ICP-Brasil, carimbo do tempo e validação pública → Uon1 Trust

Desde 14/11/2026 essa parte é do **Uon1 Trust** (`docs/UON1_TRUST.md`). O uoniSign:

- reserva o **código de verificação** ao gerar o contrato e imprime código, link e QR no rodapé do PDF;
- registra no Trust a versão **original** ao enviar, cada **assinatura** (evento público, sem dados pessoais) e a versão **assinada** (ou **selada**) na conclusão;
- marca o documento como **sem validade** no Trust quando o contrato é recusado, cancelado ou expira;
- pede o selo ao Trust (`UON1TRUST_SELO_URL`; os nomes antigos `UONISIGN_LACRE_URL/TOKEN` continuam aceitos). Com o selo ligado, o contrato só vira "Assinado" depois dele.

## Pendências da spec que continuam abertas

Q1 (perfis definitivos), Q2 (parecer jurídico sobre plataforma própria e dispensa de testemunhas), Q3 (signatário da Vangard), Q4 (certificado e ACT), Q6 (descarte após a guarda) e Q7 (linha de base).
