# Uon1 Trust

Camada de confiança digital do UONI: **autenticidade, integridade e
rastreabilidade** dos documentos emitidos (hoje, pela Vangard). O primeiro
módulo a usar é o Uon1 Sign; qualquer outro pode registrar documentos.

## O que existe

| Recurso | Situação |
|---|---|
| Registro do documento com **código de verificação** (12 caracteres, sem letras ambíguas) | pronto |
| **Versões** identificadas por SHA-256 (original, assinado, selado) | pronto |
| **Histórico de autenticidade encadeado**: cada evento guarda o hash do anterior; `trust_verificar_cadeia()` aponta o primeiro evento adulterado, mesmo que alguém altere o banco direto | pronto |
| **Validação pública** em `/validar` e `/validar/:codigo`: por código ou pelo PDF (o hash é calculado no navegador; o arquivo não é enviado) | pronto |
| **QR + código + link** no rodapé de cada página dos contratos | pronto |
| **Painel interno** em `/trust` (Admin/Operador Uon1 Sign): documentos, versões, histórico com hashes, verificar cadeia, registrar documento avulso, revogar | pronto |
| **Carimbo do tempo** (ACT credenciada na ICP-Brasil, RFC 3161) | preparado, desligado |
| **Selo ICP-Brasil** (PAdES com o certificado do emissor) | preparado, desligado |
| Assinatura eletrônica de contratos | é do **Uon1 Sign**, que usa o Trust para a prova |

## Regras

- **Imutável no banco**: eventos não mudam nem são excluídos; versões não trocam arquivo/hash; carimbo concluído não muda; documento não é excluído e, se sair de "válido" (cancelado, revogado, substituído), não volta.
- **Consulta pública mínima (LGPD)**: emissor (nome e CNPJ), título público, situação, datas, hashes e eventos marcados como públicos. Nunca CPF, e-mail, valores ou nome das partes. O título público dos contratos é "Contrato nº X — modelo".
- **Linguagem honesta**: a página só diz "Selo ICP-Brasil" ou "Carimbo do tempo" quando foram aplicados à versão. Sem eles, o que existe é registro com hash e histórico encadeado (assinatura eletrônica avançada com evidências, no caso dos contratos). O Uon1 Trust **não** é prestador credenciado pelo ITI; quem dá a validade ICP-Brasil é o certificado do emissor e a ACT.
- Por código, a página diz "documento registrado" e sugere conferir o arquivo; só pelo upload do PDF diz "autêntico e íntegro".

## Peças

- `drizzle/migrations/0041_uon1_trust.sql` — tabelas `trust_emissores`, `trust_documentos`, `trust_versoes`, `trust_eventos`, encadeamento, imutabilidade, RLS, bucket `uon1-trust`, cron horário.
- `supabase/functions/uon1-trust/` — `index.ts` (validar, validar_hash, verificar_cadeia, registrar, revogar, processar) e `nucleo.ts` (usado também pelo Uon1 Sign).
- `src/pages/ValidarDocumento.tsx`, `src/pages/Uon1Trust.tsx`, `src/lib/trust/`.

## Colocar em produção

1. Aplicar `0041_uon1_trust.sql` (depois da 0039/0040).
2. Publicar `uon1-trust` **e** `uonisign` (que agora importa o núcleo do Trust).
3. Publish do front.
4. Preencher o CNPJ da Vangard em `trust_emissores` (aparece na validação pública).

## Ligar o carimbo do tempo (Fase 2)

Contratar uma ACT credenciada e expor um endpoint (direto ou por um pequeno serviço intermediário):

- `UON1TRUST_CARIMBO_URL` — `POST {hash, algoritmo:"SHA-256"}` → `{token_base64, carimbo_em}` (token RFC 3161 em DER);
- `UON1TRUST_CARIMBO_TOKEN` — Bearer.

O token fica guardado no bucket `uon1-trust` (`carimbos/<versão>.tsr`). Versões já registradas recebem o carimbo na rotina horária.

## Ligar o selo ICP-Brasil (Fase 3)

O selo deve usar o certificado **do emissor** (a Vangard), não o da UON1. A forma mais simples no Lovable Cloud é um **certificado em nuvem** de um prestador credenciado no ITI, com assinatura remota por API, sem a chave sair do cofre:

- `UON1TRUST_SELO_URL` — `POST {emissor:{slug,cnpj}, documento_codigo, hash, pdf_base64}` → `{pdf_base64, carimbo_tempo_em}` (PDF com assinatura PAdES);
- `UON1TRUST_SELO_TOKEN` — Bearer.

Cada emissor novo entra em `trust_emissores` (o campo `selo_config` guarda só referências, nunca segredos).

## Próximos usos sugeridos

Deliberações (`pdfDeliberacao`), relatórios de cobrança e termos de vistoria podem chamar `garantirDocumento` + `registrarVersao` (ou, enquanto isso, ser registrados pelo painel em "Registrar documento").
