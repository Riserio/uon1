-- Templates internos (referência) das mensagens de WhatsApp do Uon1 Sign.
-- O envio real usa os templates aprovados na Meta; estes servem de consulta na
-- tela WhatsApp → Templates internos. Idempotente.

alter table public.whatsapp_templates drop constraint if exists whatsapp_templates_tipo_check;
alter table public.whatsapp_templates add constraint whatsapp_templates_tipo_check
  check (tipo in ('cobranca', 'eventos', 'mgf', 'geral', 'manual', 'contrato'));

insert into public.whatsapp_templates (nome, tipo, formato, mensagem, ativo)
select $n$Uon1 Sign — Convite para assinatura$n$, 'contrato', 'texto', $m$Olá, {nome}!

Você recebeu um contrato para assinatura eletrônica.

📄 Contrato
- Documento: {contrato}
- Número: {numero}
- Enviado por: {empresa}

⏳ Prazo
- Assine até: {prazo}

Toque no botão abaixo para revisar e assinar.$m$, true
where not exists (select 1 from public.whatsapp_templates where nome = $n$Uon1 Sign — Convite para assinatura$n$);

insert into public.whatsapp_templates (nome, tipo, formato, mensagem, ativo)
select $n$Uon1 Sign — Lembrete de assinatura$n$, 'contrato', 'texto', $m$Olá, {nome}!

Seu contrato ainda aguarda assinatura.

📄 Contrato
- Documento: {contrato}
- Número: {numero}
- Enviado há: {dias} dia(s)

⏳ Prazo
- Assine até: {prazo}

Toque no botão abaixo para revisar e assinar.$m$, true
where not exists (select 1 from public.whatsapp_templates where nome = $n$Uon1 Sign — Lembrete de assinatura$n$);

insert into public.whatsapp_templates (nome, tipo, formato, mensagem, ativo)
select $n$Uon1 Sign — Código de confirmação$n$, 'contrato', 'texto', $m${codigo} é seu código de verificação. Para sua segurança, não o compartilhe.

Este código expira em 10 minutos.$m$, true
where not exists (select 1 from public.whatsapp_templates where nome = $n$Uon1 Sign — Código de confirmação$n$);

insert into public.whatsapp_templates (nome, tipo, formato, mensagem, ativo)
select $n$Uon1 Sign — Aviso sobre o contrato$n$, 'contrato', 'texto', $m$Olá, {nome}!

Há uma atualização sobre o seu contrato.

📄 Contrato
- Documento: {contrato}
- Número: {numero}

⚠️ Situação
- {assunto}

O link de assinatura anterior deixou de valer. Em caso de dúvida, fale com quem enviou o contrato.$m$, true
where not exists (select 1 from public.whatsapp_templates where nome = $n$Uon1 Sign — Aviso sobre o contrato$n$);

