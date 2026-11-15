// uoniSign v2 — geração e assinatura de contratos (spec v2.1, 14/11/2026).
// Uma função só, com ações:
//   internas (JWT do usuário): criar, registrar_pdf, enviar, reenviar,
//     corrigir_contato, cancelar, url
//   públicas (token do signatário): pub_abrir, pub_solicitar_codigo,
//     pub_assinar, pub_recusar
//   rotina (cron horário): processar — lembretes, expiração, lacre, alertas
// Toda escrita do fluxo 2 passa por aqui (service role) e grava a trilha em
// contrato_historico (imutável).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import {
  CAMPOS_PADRAO,
  CampoModelo,
  ContratadaModelo,
  Dados,
  SignatarioContratada,
  cpfValido,
  derivarContrato,
  emailValido,
  mascarar,
  mascararEmail,
  mascararTelefone,
  pendenciasDoModelo,
  renderizarContrato,
  soDigitos,
  validarDados,
} from "./modelo.ts";
import {
  LinhaRelatorio,
  anexarRelatorio,
  deBase64,
  enviarEmail,
  enviarWhatsApp,
  layoutEmail,
  linkAssinatura,
  paraBase64,
  sha256Hex,
} from "./servicos.ts";
import {
  encerrarDocumento,
  garantirDocumento,
  gerarCodigo,
  registrarEvento,
  registrarVersao,
  selarPdf,
  seloConfigurado,
  urlValidacao,
} from "../_shared/uon1-trust-nucleo.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUCKET = "uonisign";
const DIA = 24 * 60 * 60 * 1000;
const CODIGO_VALIDADE_MIN = 10; // RN21
const CODIGO_MAX_TENTATIVAS = 5;
const CODIGO_MAX_POR_HORA = 5;
const BLOQUEIO_MIN = 15;
const REENVIOS_POR_DIA = 3; // RN19
const ALERTA_LACRE_MIN = 60;
const STATUS_ATIVOS = ["aguardando_assinatura", "parcialmente_assinado"];

class Erro extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

interface Ctx {
  db: SupabaseClient;
  req: Request;
  ip: string | null;
  ua: string | null;
  uid: string | null;
}

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------
function ipDe(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip");
}

async function evento(
  c: Ctx,
  contratoId: string,
  acao: string,
  descricao: string,
  extra: { assinatura_id?: string | null; canal?: string | null; dados?: unknown; sistema?: boolean } = {},
) {
  const { error } = await c.db.from("contrato_historico").insert({
    contrato_id: contratoId,
    acao,
    descricao,
    assinatura_id: extra.assinatura_id ?? null,
    canal: extra.canal ?? null,
    dados: extra.dados ?? null,
    user_id: extra.sistema ? null : c.uid,
    ip: extra.sistema ? null : c.ip,
    user_agent: extra.sistema ? null : c.ua,
  });
  if (error) console.error("[uonisign] falha ao gravar evento", acao, error.message);
}

async function nivel(c: Ctx): Promise<string> {
  if (!c.uid) return "nenhum";
  const { data } = await c.db.rpc("uonisign_nivel", { _uid: c.uid });
  return (data as string) ?? "nenhum";
}

async function podeVer(c: Ctx, owner: string): Promise<boolean> {
  const { data } = await c.db.rpc("uonisign_pode_ver", { _uid: c.uid, _owner: owner });
  return Boolean(data);
}

async function carregarContrato(c: Ctx, id: string): Promise<Row> {
  const { data, error } = await c.db.from("contratos").select("*").eq("id", id).maybeSingle();
  if (error) throw new Erro(500, error.message);
  if (!data || data.fluxo_versao < 2) throw new Erro(404, "Contrato não encontrado");
  return data;
}

async function contratoVisivel(c: Ctx, id: string): Promise<Row> {
  const k = await carregarContrato(c, id);
  if (!(await podeVer(c, k.created_by))) throw new Erro(404, "Contrato não encontrado"); // US09
  return k;
}

async function signatarios(c: Ctx, contratoId: string): Promise<Row[]> {
  const { data, error } = await c.db
    .from("contrato_assinaturas")
    .select("*")
    .eq("contrato_id", contratoId)
    .order("ordem", { ascending: true });
  if (error) throw new Erro(500, error.message);
  return data ?? [];
}

async function modeloDoContrato(c: Ctx, k: Row): Promise<Row> {
  const { data } = await c.db.from("contrato_templates").select("*").eq("id", k.template_id).maybeSingle();
  if (!data) throw new Erro(400, "Modelo do contrato não encontrado");
  return data;
}

async function remetente(c: Ctx, ownerId: string): Promise<string> {
  const { data } = await c.db.from("resend_config").select("from_name, from_email").eq("user_id", ownerId).maybeSingle();
  if (data?.from_email) return `${data.from_name || "Contratos"} <${data.from_email}>`;
  return Deno.env.get("UONISIGN_EMAIL_FROM") || "Contratos <vangard@uon1.com.br>";
}

async function emailDoUsuario(c: Ctx, uid: string): Promise<{ email: string | null; nome: string | null }> {
  const { data } = await c.db.from("profiles").select("email, nome").eq("id", uid).maybeSingle();
  return { email: data?.email ?? null, nome: data?.nome ?? null };
}

async function emailsAdmins(c: Ctx): Promise<string[]> {
  const { data: papeis } = await c.db.from("user_roles").select("user_id").in("role", ["admin", "superintendente"]);
  const ids = [...new Set((papeis ?? []).map((p: Row) => p.user_id))];
  // Administradores uoniSign por cargo/usuário
  const { data: flags } = await c.db
    .from("user_menu_permissions")
    .select("user_id")
    .eq("menu_item", "contratos:admin")
    .eq("pode_visualizar", true);
  (flags ?? []).forEach((f: Row) => ids.push(f.user_id));
  if (!ids.length) return [];
  const { data } = await c.db.from("profiles").select("email").in("id", [...new Set(ids)]).eq("ativo", true);
  return (data ?? []).map((p: Row) => p.email).filter(Boolean);
}

async function alertarAdmins(c: Ctx, k: Row, assunto: string, texto: string) {
  const para = await emailsAdmins(c);
  if (!para.length) return;
  await enviarEmail({
    from: await remetente(c, k.created_by),
    para,
    assunto: `[uoniSign] ${assunto} — ${k.numero}`,
    html: layoutEmail({ titulo: assunto, paragrafos: [esc(texto), `Contrato <strong>${esc(k.numero)}</strong> — ${esc(k.titulo)}`] }),
  });
}

const esc = (s: string) =>
  (s ?? "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const papelRotulo = (tipo: string) => (tipo === "contratada" ? "Contratada" : tipo === "contratante" ? "Contratante" : tipo);

async function baixar(c: Ctx, path: string): Promise<Uint8Array> {
  const { data, error } = await c.db.storage.from(BUCKET).download(path);
  if (error || !data) throw new Erro(500, "Documento indisponível");
  return new Uint8Array(await data.arrayBuffer());
}

async function urlAssinada(c: Ctx, path: string, segundos = 300, nomeArquivo?: string): Promise<string> {
  const { data, error } = await c.db.storage
    .from(BUCKET)
    .createSignedUrl(path, segundos, nomeArquivo ? { download: nomeArquivo } : undefined);
  if (error || !data) throw new Erro(500, "Não foi possível gerar o link do documento");
  return data.signedUrl;
}

/** RN24: o PDF guardado tem de bater com o hash registrado na geração. */
async function integridadeOk(c: Ctx, k: Row): Promise<boolean> {
  if (!k.pdf_original_path || !k.hash_original) return false;
  try {
    const bytes = await baixar(c, k.pdf_original_path);
    return (await sha256Hex(bytes)) === k.hash_original;
  } catch {
    return false;
  }
}

async function falhaIntegridade(c: Ctx, k: Row, assinaturaId: string | null) {
  await evento(c, k.id, "integridade_falhou", "O PDF armazenado não confere com o hash registrado na geração. Assinatura bloqueada.", {
    assinatura_id: assinaturaId,
  });
  await alertarAdmins(c, k, "Documento com integridade divergente", "O hash do PDF armazenado não confere com o registrado na geração. A assinatura foi bloqueada.");
}

// ---------------------------------------------------------------------------
// Uon1 Trust — registro de autenticidade (falha aqui não trava a assinatura;
// fica registrada na trilha do contrato para nova tentativa/ação do admin)
// ---------------------------------------------------------------------------
const EMISSOR = Deno.env.get("UON1TRUST_EMISSOR_PADRAO") || "vangard";

async function trustDocumento(c: Ctx, k: Row): Promise<string> {
  if (k.trust_documento_id) return k.trust_documento_id;
  let codigo = k.trust_codigo as string | null;
  if (!codigo) {
    codigo = gerarCodigo();
    await c.db.from("contratos").update({ trust_codigo: codigo }).eq("id", k.id);
  }
  const { data: t } = await c.db.from("contrato_templates").select("titulo").eq("id", k.template_id).maybeSingle();
  const docId = await garantirDocumento(c.db, {
    codigo,
    emissor: EMISSOR,
    origem: "uonisign",
    origem_id: k.id,
    tipo: "contrato",
    titulo_publico: `Contrato nº ${k.numero}${t?.titulo ? ` — ${t.titulo}` : ""}`,
    ator_id: c.uid,
  });
  await c.db.from("contratos").update({ trust_documento_id: docId, trust_codigo: codigo }).eq("id", k.id);
  k.trust_documento_id = docId;
  k.trust_codigo = codigo;
  return docId;
}

async function trustSeguro(c: Ctx, k: Row, rotulo: string, fn: (docId: string) => Promise<unknown>) {
  try {
    await fn(await trustDocumento(c, k));
  } catch (e) {
    await evento(c, k.id, "trust_falhou", `Uon1 Trust (${rotulo}): ${String((e as Error)?.message ?? e).slice(0, 300)}`, { sistema: true });
  }
}

// ---------------------------------------------------------------------------
// Mensagens aos signatários
// ---------------------------------------------------------------------------
async function enviarConvite(c: Ctx, k: Row, s: Row, motivo: "convite" | "reenvio" | "lembrete", diasAguardando = 0) {
  const link = linkAssinatura(s.link_token);
  const from = await remetente(c, k.created_by);
  const lembrete = motivo === "lembrete";
  const prazo = s.link_expires_at
    ? new Date(s.link_expires_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : null;
  const mail = await enviarEmail({
    from,
    para: s.email,
    assunto: lembrete ? `Lembrete: assine o contrato ${k.numero}` : `Contrato para assinatura: ${k.titulo}`,
    html: layoutEmail({
      titulo: lembrete ? "Seu contrato ainda aguarda assinatura" : "Você recebeu um contrato para assinar",
      paragrafos: [
        `Olá, ${esc(s.nome)}.`,
        lembrete
          ? `O contrato <strong>${esc(k.titulo)}</strong> (nº ${esc(k.numero)}) foi enviado há ${diasAguardando} dia(s) e ainda aguarda a sua assinatura.`
          : `O contrato <strong>${esc(k.titulo)}</strong> (nº ${esc(k.numero)}) está pronto para a sua assinatura.`,
        `Para assinar, abra o link, leia o documento e confirme com o código que enviaremos a você.${prazo ? ` O link vale até <strong>${prazo}</strong>.` : ""}`,
      ],
      botao: { texto: "Revisar e assinar", url: link },
    }),
  });
  await evento(
    c,
    k.id,
    mail.ok ? (motivo === "convite" ? "convite_enviado" : motivo === "reenvio" ? "convite_reenviado" : "lembrete_enviado") : "envio_falhou",
    mail.ok ? `${lembrete ? "Lembrete" : "Convite"} enviado por e-mail para ${s.email}` : `Falha no e-mail para ${s.email}: ${mail.erro}`,
    { assinatura_id: s.id, canal: "email", sistema: motivo === "lembrete" },
  );
  let whatsappOk: boolean | null = null;
  if ((s.canais ?? []).includes("whatsapp") && s.telefone) {
    const wa = lembrete
      ? await enviarWhatsApp(s.telefone, "lembrete", [s.nome, k.titulo, String(diasAguardando), link])
      : await enviarWhatsApp(s.telefone, "convite", [s.nome, k.titulo, link]);
    whatsappOk = wa.ok;
    await evento(
      c,
      k.id,
      wa.ok ? (motivo === "convite" ? "convite_enviado" : motivo === "reenvio" ? "convite_reenviado" : "lembrete_enviado") : "whatsapp_falhou",
      wa.ok ? `${lembrete ? "Lembrete" : "Convite"} enviado por WhatsApp para ${mascararTelefone(s.telefone)}` : `Falha no WhatsApp: ${wa.erro}`,
      { assinatura_id: s.id, canal: "whatsapp", sistema: motivo === "lembrete" },
    );
  }
  return { email: mail.ok, erroEmail: mail.erro, whatsapp: whatsappOk };
}

async function enviarCopia(c: Ctx, k: Row, s: Row | null, pdf: Uint8Array, destino?: { email: string; nome: string }) {
  const from = await remetente(c, k.created_by);
  const para = destino?.email ?? s?.email;
  const nome = destino?.nome ?? s?.nome ?? "";
  if (!para) return;
  const mail = await enviarEmail({
    from,
    para,
    assunto: `Contrato assinado: ${k.titulo}`,
    html: layoutEmail({
      titulo: "Contrato assinado por todas as partes",
      paragrafos: [
        `Olá, ${esc(nome)}.`,
        `O contrato <strong>${esc(k.titulo)}</strong> (nº ${esc(k.numero)}) foi assinado por todos os signatários. A cópia final, com o relatório de assinaturas, segue anexa.`,
      ],
      botao: s ? { texto: "Ver o contrato", url: linkAssinatura(s.link_token) } : undefined,
    }),
    anexos: [{ filename: `${k.numero}.pdf`, content: paraBase64(pdf) }],
  });
  await evento(c, k.id, mail.ok ? "copia_enviada" : "envio_falhou", mail.ok ? `Cópia assinada enviada para ${para}` : `Falha ao enviar cópia para ${para}: ${mail.erro}`, {
    assinatura_id: s?.id ?? null,
    canal: "email",
    sistema: true,
  });
  if (s && (s.canais ?? []).includes("whatsapp") && s.telefone) {
    const wa = await enviarWhatsApp(s.telefone, "concluido", [s.nome, k.titulo, linkAssinatura(s.link_token)]);
    await evento(c, k.id, wa.ok ? "copia_enviada" : "whatsapp_falhou", wa.ok ? `Cópia assinada enviada por WhatsApp` : `Falha no WhatsApp: ${wa.erro}`, {
      assinatura_id: s.id,
      canal: "whatsapp",
      sistema: true,
    });
  }
}

async function avisarSignatarios(c: Ctx, k: Row, titulo: string, texto: string, apenasPendentes = true) {
  const from = await remetente(c, k.created_by);
  for (const s of await signatarios(c, k.id)) {
    if (apenasPendentes && (s.status !== "pendente" || !s.enviado_em)) continue;
    await enviarEmail({
      from,
      para: s.email,
      assunto: `${titulo}: ${k.titulo}`,
      html: layoutEmail({ titulo, paragrafos: [`Olá, ${esc(s.nome)}.`, texto] }),
    });
    if ((s.canais ?? []).includes("whatsapp") && s.telefone) {
      await enviarWhatsApp(s.telefone, "aviso", [s.nome, k.titulo, titulo]);
    }
  }
}

async function avisarVendedor(c: Ctx, k: Row, titulo: string, texto: string, admins = false) {
  const v = await emailDoUsuario(c, k.created_by);
  const para = [v.email, ...(admins ? await emailsAdmins(c) : [])].filter(Boolean) as string[];
  if (!para.length) return;
  await enviarEmail({
    from: await remetente(c, k.created_by),
    para: [...new Set(para)],
    assunto: `[uoniSign] ${titulo} — ${k.numero}`,
    html: layoutEmail({ titulo, paragrafos: [texto, `Contrato <strong>${esc(k.numero)}</strong> — ${esc(k.titulo)}`] }),
  });
}

// ---------------------------------------------------------------------------
// Ações internas
// ---------------------------------------------------------------------------
async function acaoCriar(c: Ctx, body: Row) {
  if ((await nivel(c)) === "nenhum") throw new Erro(403, "Sem acesso ao uoniSign");
  const dados: Dados = {};
  for (const [k, v] of Object.entries(body.dados ?? {})) dados[k] = v == null ? "" : String(v).slice(0, 2000);

  let k: Row | null = null;
  if (body.contrato_id) {
    k = await carregarContrato(c, body.contrato_id);
    if (k.created_by !== c.uid) throw new Erro(403, "Só quem gerou o contrato pode editá-lo");
    if (k.status !== "rascunho") throw new Erro(409, "Contrato enviado não pode ser editado. Cancele e gere um novo."); // RN16
  }
  const templateId = k?.template_id ?? body.template_id;
  const { data: t } = await c.db.from("contrato_templates").select("*").eq("id", templateId).maybeSingle();
  if (!t || t.ativo === false || t.fluxo_versao < 2) throw new Erro(400, "Modelo indisponível");
  const campos: CampoModelo[] = Array.isArray(t.campos) && t.campos.length ? t.campos : CAMPOS_PADRAO;

  const erros = validarDados(campos, dados);
  if (Object.keys(erros).length) return json({ erro: "Dados inválidos", erros }, 422);

  const der = derivarContrato(campos, dados);
  // Vincula à associação cadastrada quando o CNPJ bater (facilita os filtros)
  let corretoraId: string | null = k?.corretora_id ?? null;
  if (!corretoraId && der.contratante_cnpj) {
    const { data: cor } = await c.db
      .from("corretoras")
      .select("id")
      .in("cnpj", [der.contratante_cnpj, soDigitos(der.contratante_cnpj)])
      .limit(1)
      .maybeSingle();
    corretoraId = cor?.id ?? null;
  }

  const base = {
    titulo: `${t.titulo} — ${der.contratante_nome ?? ""}`.slice(0, 200),
    template_id: t.id,
    template_versao: t.versao,
    fluxo_versao: 2,
    variaveis_preenchidas: dados,
    contratante_nome: der.contratante_nome,
    contratante_cnpj: der.contratante_cnpj,
    contratante_cpf: der.contratante_cpf,
    contratante_email: der.contratante_email,
    contratante_telefone: dados.Telefone_do_Responsavel ?? dados.Telefone ?? null,
    valor_contrato: der.valor_contrato,
    data_inicio: der.data_inicio,
    data_fim: der.data_fim,
    corretora_id: corretoraId,
    contratada_nome: t.contratada?.razao_social ?? null,
    contratada_documento: t.contratada?.cnpj ?? null,
    contratada_assinatura_automatica: false,
    auto_envio_email_assinatura: false,
    lembrete_dias: t.lembrete_dias ?? [3, 7, 12],
    lembrete_ativo: true,
    // PDF anterior descartado ao voltar e editar (US04)
    pdf_original_path: null,
    hash_original: null,
    // Código de verificação do Uon1 Trust: impresso (com QR) no rodapé do PDF
    trust_codigo: k?.trust_codigo ?? gerarCodigo(),
  };

  if (!k) {
    const { data: novo, error } = await c.db
      .from("contratos")
      // link_token do contrato é do fluxo 1 (link único); no fluxo 2 cada signatário tem o seu
      .insert({ ...base, conteudo_html: "<p></p>", status: "rascunho", created_by: c.uid, link_token: null, link_expires_at: null })
      .select("*")
      .single();
    if (error) throw new Erro(500, error.message);
    k = novo;
    await evento(c, k!.id, "criado", `Contrato gerado a partir do modelo "${t.titulo}" (versão ${t.versao})`);
  } else {
    if (k.hash_original) await evento(c, k.id, "pdf_descartado", "Voltou para editar: o PDF anterior foi descartado");
    await evento(c, k.id, "editado", "Dados do contrato alterados antes do envio");
  }

  const r = renderizarContrato(t.conteudo_html, campos, dados, {
    numero: k!.numero,
    dataEmissao: new Date().toISOString(),
    contratada: t.contratada as ContratadaModelo,
    signatarioContratada: t.signatario_contratada as SignatarioContratada,
  });
  const { data: atualizado, error: errUpd } = await c.db
    .from("contratos")
    .update({ ...base, conteudo_html: r.html })
    .eq("id", k!.id)
    .select("*")
    .single();
  if (errUpd) throw new Erro(500, errUpd.message);

  return json({
    contrato: atualizado,
    faltando: r.faltando,
    pendencias_modelo: pendenciasDoModelo(t.contratada ?? {}, t.signatario_contratada ?? {}, t.conteudo_html),
  });
}

async function acaoRegistrarPdf(c: Ctx, body: Row) {
  const k = await carregarContrato(c, body.contrato_id);
  if (k.created_by !== c.uid) throw new Erro(403, "Só quem gerou o contrato pode gerar o PDF");
  if (k.status !== "rascunho") throw new Erro(409, "O PDF de um contrato enviado não pode ser substituído");
  const bytes = deBase64(String(body.pdf_base64 ?? ""));
  if (bytes.length < 500 || bytes.length > 15 * 1024 * 1024) throw new Erro(400, "PDF inválido");
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Erro(400, "O arquivo não é um PDF");
  const hash = await sha256Hex(bytes);
  const path = `originais/${k.id}/${hash}.pdf`;
  const { error: upErr } = await c.db.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (upErr && !/exists|duplicate/i.test(upErr.message)) throw new Erro(500, "Falha ao guardar o PDF: " + upErr.message);
  const { error } = await c.db.from("contratos").update({ pdf_original_path: path, hash_original: hash }).eq("id", k.id);
  if (error) throw new Erro(500, error.message);
  await evento(c, k.id, "pdf_gerado", "PDF gerado para conferência", { dados: { hash, bytes: bytes.length } });
  return json({ hash, url: await urlAssinada(c, path, 900) });
}

async function acaoEnviar(c: Ctx, body: Row) {
  const k = await carregarContrato(c, body.contrato_id);
  if (k.created_by !== c.uid) throw new Erro(403, "Só quem gerou o contrato pode enviá-lo");
  if (k.status !== "rascunho") throw new Erro(409, "Contrato já enviado");
  if (!k.hash_original) throw new Erro(409, "Gere e confira o PDF antes de enviar");
  if (!(await integridadeOk(c, k))) throw new Erro(409, "O PDF de conferência não confere. Volte e gere novamente.");

  const t = await modeloDoContrato(c, k);
  const sigK: SignatarioContratada = t.signatario_contratada ?? {};
  const pend = pendenciasDoModelo(t.contratada ?? {}, sigK, t.conteudo_html);
  if (pend.length) throw new Erro(409, `O modelo precisa ser configurado pelo administrador: ${pend.join(", ")}`);

  const dados: Dados = k.variaveis_preenchidas ?? {};
  const email = String(body.email ?? dados.Email ?? "").trim().toLowerCase();
  const telefone = soDigitos(body.telefone);
  const whatsapp = Boolean(body.whatsapp);
  if (!emailValido(email)) throw new Erro(422, "E-mail do signatário inválido");
  if (whatsapp && telefone.length !== 11) throw new Erro(422, "Celular com WhatsApp deve ter 11 dígitos (DDD + número)");
  const nome = (dados.Representante_Legal ?? "").trim();
  const cpf = dados.CPF ?? "";
  if (!nome || !cpfValido(cpf)) throw new Erro(422, "Representante legal e CPF do formulário são obrigatórios");

  const prazoDias = Number(t.prazo_assinatura_dias) || 15;
  const agora = new Date();
  const expira = new Date(agora.getTime() + prazoDias * DIA).toISOString();

  const { data: criados, error: errSig } = await c.db
    .from("contrato_assinaturas")
    .insert([
      {
        contrato_id: k.id,
        nome, // RN10: nome e CPF vêm do formulário
        cpf: mascarar("cpf", cpf),
        email,
        telefone: telefone || null,
        canais: whatsapp ? ["email", "whatsapp"] : ["email"],
        tipo: "contratante",
        ordem: 1,
        status: "pendente",
        enviado_em: agora.toISOString(),
        link_expires_at: expira,
      },
      {
        contrato_id: k.id,
        nome: sigK.nome, // RN11: pessoa fixa do modelo
        cpf: mascarar("cpf", sigK.cpf ?? ""),
        email: String(sigK.email).trim().toLowerCase(),
        telefone: soDigitos(sigK.telefone) || null,
        canais: (sigK.canais ?? ["email"]).includes("whatsapp") ? ["email", "whatsapp"] : ["email"],
        tipo: "contratada",
        ordem: 2,
        status: "pendente",
        // convite só depois da assinatura do Contratante (RN12)
      },
    ])
    .select("*");
  if (errSig) throw new Erro(500, errSig.message);
  const contratante = (criados ?? []).find((s: Row) => s.tipo === "contratante")!;

  const envio = await enviarConvite(c, k, contratante, "convite");
  if (!envio.email) {
    // 7.3: falha no envio → o contrato não muda de status
    await c.db.from("contrato_assinaturas").delete().eq("contrato_id", k.id).eq("status", "pendente");
    throw new Erro(502, "Não foi possível enviar, tente novamente");
  }

  const { error } = await c.db
    .from("contratos")
    .update({ status: "aguardando_assinatura", enviado_em: agora.toISOString(), expira_em: expira, link_expires_at: expira })
    .eq("id", k.id);
  if (error) throw new Erro(500, error.message);
  await evento(c, k.id, "enviado", `Contrato enviado para assinatura. Prazo: ${prazoDias} dias.`);
  await trustSeguro(c, k, "registro do original", async (docId) => {
    await registrarVersao(c.db, docId, {
      tipo: "original",
      bytes: await baixar(c, k.pdf_original_path),
      bucket: BUCKET,
      path: k.pdf_original_path,
      descricao: "Contrato emitido e enviado para assinatura",
      ator_id: c.uid,
    });
  });
  return json({ ok: true, whatsapp: envio.whatsapp });
}

async function reenviosHoje(c: Ctx, assinaturaId: string): Promise<number> {
  const inicio = new Date();
  inicio.setUTCHours(3, 0, 0, 0); // meia-noite de Brasília
  if (inicio.getTime() > Date.now()) inicio.setTime(inicio.getTime() - DIA);
  const { count } = await c.db
    .from("contrato_historico")
    .select("id", { count: "exact", head: true })
    .eq("assinatura_id", assinaturaId)
    .in("acao", ["reenvio_solicitado"])
    .gte("created_at", inicio.toISOString());
  return count ?? 0;
}

async function acaoReenviar(c: Ctx, body: Row) {
  const { data: s } = await c.db.from("contrato_assinaturas").select("*").eq("id", body.assinatura_id).maybeSingle();
  if (!s) throw new Erro(404, "Signatário não encontrado");
  const k = await contratoVisivel(c, s.contrato_id);
  const n = await nivel(c);
  if (n === "vendedor" && k.created_by !== c.uid) throw new Erro(403, "Só quem gerou o contrato pode reenviar");
  const tipo = body.tipo === "copia" ? "copia" : "convite";

  if ((await reenviosHoje(c, s.id)) >= REENVIOS_POR_DIA) throw new Erro(429, "Limite de 3 reenvios por dia para este signatário"); // RN19

  if (tipo === "convite") {
    if (!STATUS_ATIVOS.includes(k.status)) throw new Erro(409, "O contrato não está aguardando assinatura");
    if (s.status !== "pendente" || !s.enviado_em) throw new Erro(409, "Só é possível reenviar a quem está pendente e já recebeu o convite");
    await evento(c, k.id, "reenvio_solicitado", `Reenvio do convite solicitado para ${s.nome}`, { assinatura_id: s.id });
    const r = await enviarConvite(c, k, s, "reenvio");
    if (!r.email) throw new Erro(502, "Não foi possível enviar, tente novamente");
    return json({ ok: true });
  }
  if (k.status !== "assinado" || !k.pdf_final_path) throw new Erro(409, "A cópia assinada ainda não está disponível");
  await evento(c, k.id, "reenvio_solicitado", `Reenvio da cópia assinada solicitado para ${s.nome}`, { assinatura_id: s.id });
  await enviarCopia(c, k, s, await baixar(c, k.pdf_final_path));
  return json({ ok: true });
}

async function acaoCorrigirContato(c: Ctx, body: Row) {
  if ((await nivel(c)) !== "admin") throw new Erro(403, "Só o Administrador uoniSign corrige contatos"); // RN19
  const { data: s } = await c.db.from("contrato_assinaturas").select("*").eq("id", body.assinatura_id).maybeSingle();
  if (!s) throw new Erro(404, "Signatário não encontrado");
  const k = await carregarContrato(c, s.contrato_id);
  if (!STATUS_ATIVOS.includes(k.status) || s.status !== "pendente") throw new Erro(409, "Só é possível corrigir signatário pendente de contrato em andamento");
  const motivo = String(body.motivo ?? "").trim();
  if (motivo.length < 5) throw new Erro(422, "Informe o motivo da correção");
  const email = body.email != null ? String(body.email).trim().toLowerCase() : s.email;
  const telefone = body.telefone != null ? soDigitos(body.telefone) : s.telefone;
  const whatsapp = body.whatsapp != null ? Boolean(body.whatsapp) : (s.canais ?? []).includes("whatsapp");
  if (!emailValido(email)) throw new Erro(422, "E-mail inválido");
  if (whatsapp && (telefone ?? "").length !== 11) throw new Erro(422, "Celular com WhatsApp deve ter 11 dígitos");
  const { data: novo, error } = await c.db
    .from("contrato_assinaturas")
    .update({ email, telefone: telefone || null, canais: whatsapp ? ["email", "whatsapp"] : ["email"], bloqueado_ate: null })
    .eq("id", s.id)
    .select("*")
    .single();
  if (error) throw new Erro(500, error.message);
  await evento(c, k.id, "contato_corrigido", `Contato de ${s.nome} corrigido. Motivo: ${motivo}`, {
    assinatura_id: s.id,
    dados: { antes: { email: s.email, telefone: s.telefone, canais: s.canais }, depois: { email, telefone, canais: novo.canais } },
  });
  // Invalida códigos pendentes enviados ao contato antigo
  await c.db.from("contrato_codigos_assinatura").update({ usado_em: new Date().toISOString() }).eq("assinatura_id", s.id).is("usado_em", null);
  if (novo.enviado_em) await enviarConvite(c, k, novo, "reenvio");
  return json({ ok: true });
}

async function acaoCancelar(c: Ctx, body: Row) {
  const k = await contratoVisivel(c, body.contrato_id);
  const n = await nivel(c);
  const motivo = String(body.motivo ?? "").trim();
  if (motivo.length < 5) throw new Erro(422, "Informe o motivo do cancelamento");
  if (["assinado", "assinado_processando"].includes(k.status)) throw new Erro(409, "Contrato assinado não pode ser cancelado. Use o distrato."); // RN20
  if (!["rascunho", ...STATUS_ATIVOS].includes(k.status)) throw new Erro(409, "Contrato já encerrado");
  if (n !== "admin") {
    if (k.created_by !== c.uid) throw new Erro(403, "Só quem gerou o contrato ou o Administrador pode cancelar"); // RN17
    const sigs = await signatarios(c, k.id);
    if (sigs.some((s) => s.status === "assinado")) {
      throw new Erro(403, "O Contratante já assinou: só o Administrador uoniSign pode cancelar este contrato");
    }
  }
  const { error } = await c.db
    .from("contratos")
    .update({ status: "cancelado", cancelado_em: new Date().toISOString(), cancelado_por: c.uid, motivo_cancelamento: motivo })
    .eq("id", k.id);
  if (error) throw new Erro(500, error.message);
  await c.db.from("contrato_codigos_assinatura").update({ usado_em: new Date().toISOString() }).in(
    "assinatura_id",
    (await signatarios(c, k.id)).map((s) => s.id),
  ).is("usado_em", null);
  await evento(c, k.id, "cancelado", `Contrato cancelado. Motivo: ${motivo}`);
  if (k.trust_documento_id) {
    await encerrarDocumento(c.db, k.trust_documento_id, "cancelado", "Contrato cancelado pelo emissor antes da conclusão", c.uid);
  }
  if (k.status !== "rascunho") {
    await avisarSignatarios(c, k, "Contrato cancelado", `O contrato <strong>${esc(k.titulo)}</strong> (nº ${esc(k.numero)}) foi cancelado e o link de assinatura deixou de valer.`);
  }
  return json({ ok: true });
}

async function acaoUrl(c: Ctx, body: Row) {
  const k = await contratoVisivel(c, body.contrato_id);
  const final = body.tipo === "final";
  const path = final ? k.pdf_final_path : k.pdf_original_path;
  if (!path) throw new Erro(404, final ? "O PDF assinado ainda não está disponível" : "PDF não gerado");
  await evento(c, k.id, "download", final ? "PDF assinado baixado/visualizado" : "PDF original baixado/visualizado");
  return json({ url: await urlAssinada(c, path, 300, body.download ? `${k.numero}${final ? "-assinado" : ""}.pdf` : undefined) });
}

// ---------------------------------------------------------------------------
// Ações públicas (página de assinatura)
// ---------------------------------------------------------------------------
async function porToken(c: Ctx, token: string): Promise<{ s: Row; k: Row }> {
  if (!/^[0-9a-f-]{36}$/i.test(token ?? "")) throw new Erro(404, "Link inválido");
  const { data: s } = await c.db.from("contrato_assinaturas").select("*").eq("link_token", token).maybeSingle();
  if (!s) throw new Erro(404, "Link inválido");
  const { data: k } = await c.db.from("contratos").select("*").eq("id", s.contrato_id).maybeSingle();
  if (!k || k.fluxo_versao < 2) throw new Erro(404, "Link inválido");
  return { s, k };
}

/** É a vez deste signatário? (RN12: todos de ordem menor já assinaram) */
async function eAVez(c: Ctx, k: Row, s: Row): Promise<boolean> {
  const sigs = await signatarios(c, k.id);
  return s.status === "pendente" && Boolean(s.enviado_em) && sigs.filter((x) => x.ordem < s.ordem).every((x) => x.status === "assinado");
}

function podeAssinarAgora(k: Row, s: Row): string | null {
  if (k.status === "cancelado") return "cancelado";
  if (k.status === "recusado") return "recusado";
  if (k.status === "expirado") return "expirado";
  if (s.status === "assinado") return "ja_assinou";
  if (s.status === "recusado") return "recusado";
  if (!STATUS_ATIVOS.includes(k.status)) return "indisponivel";
  if (s.link_expires_at && new Date(s.link_expires_at).getTime() < Date.now()) return "expirado";
  return null;
}

async function acaoPubAbrir(c: Ctx, body: Row) {
  const { s, k } = await porToken(c, body.token);
  const sigs = await signatarios(c, k.id);
  const bloqueio = podeAssinarAgora(k, s);
  const vez = !bloqueio && (await eAVez(c, k, s));
  const resposta: Row = {
    contrato: {
      numero: k.numero,
      titulo: k.titulo,
      status: k.status,
      motivo_recusa: k.status === "recusado" ? k.motivo_recusa : null,
      concluido_em: k.concluido_em,
      lacre_status: k.lacre_status,
      hash: k.hash_original,
      codigo_verificacao: k.trust_documento_id ? k.trust_codigo : null,
      url_validacao: k.trust_documento_id && k.trust_codigo ? urlValidacao(k.trust_codigo) : null,
    },
    signatario: {
      nome: s.nome,
      papel: papelRotulo(s.tipo),
      status: s.status,
      canais: s.canais ?? ["email"],
      email: mascararEmail(s.email),
      telefone: mascararTelefone(s.telefone),
      expira_em: s.link_expires_at,
      bloqueado_ate: s.bloqueado_ate && new Date(s.bloqueado_ate).getTime() > Date.now() ? s.bloqueado_ate : null,
      assinado_em: s.assinado_em,
    },
    // Só nome, papel e status dos demais — sem CPF, e-mail ou telefone (LGPD)
    signatarios: sigs.map((x) => ({ nome: x.nome, papel: papelRotulo(x.tipo), status: x.status, assinado_em: x.assinado_em, voce: x.id === s.id })),
    estado: bloqueio ?? (vez ? "pode_assinar" : "aguardando_outros"),
    pdf_url: null as string | null,
  };

  if (k.status === "assinado" && k.pdf_final_path) {
    resposta.pdf_url = await urlAssinada(c, k.pdf_final_path, 600);
    resposta.estado = "concluido";
    return json(resposta);
  }
  if (k.status === "assinado_processando") {
    resposta.estado = "processando";
    return json(resposta);
  }
  if (bloqueio && bloqueio !== "ja_assinou") return json(resposta);

  if (!(await integridadeOk(c, k))) {
    await falhaIntegridade(c, k, s.id);
    return json({ ...resposta, estado: "documento_indisponivel", pdf_url: null }); // US06 — Documento adulterado
  }
  resposta.pdf_url = await urlAssinada(c, k.pdf_original_path, 900);
  if (!s.visualizado_em && s.status === "pendente") {
    await c.db.from("contrato_assinaturas").update({ visualizado_em: new Date().toISOString() }).eq("id", s.id);
    await evento(c, k.id, "visualizado", `Documento aberto por ${s.nome}`, { assinatura_id: s.id });
  }
  return json(resposta);
}

async function acaoPubSolicitarCodigo(c: Ctx, body: Row) {
  const { s, k } = await porToken(c, body.token);
  const bloqueio = podeAssinarAgora(k, s);
  if (bloqueio) throw new Erro(409, "Este contrato não está disponível para assinatura");
  if (!(await eAVez(c, k, s))) throw new Erro(409, "Aguarde a assinatura dos signatários anteriores");
  const canal = body.canal === "whatsapp" ? "whatsapp" : "email";
  if (!(s.canais ?? ["email"]).includes(canal)) throw new Erro(400, "Canal não habilitado para este signatário");
  if (s.bloqueado_ate && new Date(s.bloqueado_ate).getTime() > Date.now()) throw new Erro(429, "Muitas tentativas. Tente novamente em alguns minutos.");

  const { count } = await c.db
    .from("contrato_codigos_assinatura")
    .select("id", { count: "exact", head: true })
    .eq("assinatura_id", s.id)
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if ((count ?? 0) >= CODIGO_MAX_POR_HORA) throw new Erro(429, "Limite de 5 códigos por hora. Tente mais tarde.");

  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  const codigo = n.toString().padStart(6, "0");
  // invalida códigos anteriores ainda abertos
  await c.db.from("contrato_codigos_assinatura").update({ usado_em: new Date().toISOString() }).eq("assinatura_id", s.id).is("usado_em", null);
  const destino = canal === "email" ? s.email : s.telefone;
  const { error } = await c.db.from("contrato_codigos_assinatura").insert({
    assinatura_id: s.id,
    hash_codigo: await sha256Hex(`${s.id}:${codigo}`),
    canal,
    destino,
    expira_em: new Date(Date.now() + CODIGO_VALIDADE_MIN * 60 * 1000).toISOString(),
  });
  if (error) throw new Erro(500, error.message);

  const r =
    canal === "email"
      ? await enviarEmail({
          from: await remetente(c, k.created_by),
          para: s.email,
          assunto: `Código de assinatura: ${codigo}`,
          html: layoutEmail({
            titulo: "Seu código para assinar o contrato",
            paragrafos: [
              `Olá, ${esc(s.nome)}. Use o código abaixo para confirmar a assinatura do contrato <strong>${esc(k.titulo)}</strong> (nº ${esc(k.numero)}).`,
              `O código vale por ${CODIGO_VALIDADE_MIN} minutos e só pode ser usado uma vez. Se você não pediu este código, ignore esta mensagem.`,
            ],
            destaque: codigo,
          }),
        })
      : await enviarWhatsApp(s.telefone, "codigo", [codigo]);
  await evento(c, k.id, r.ok ? "codigo_enviado" : "envio_falhou", r.ok ? `Código de assinatura enviado por ${canal === "email" ? "e-mail" : "WhatsApp"}` : `Falha ao enviar código: ${r.erro}`, {
    assinatura_id: s.id,
    canal,
  });
  if (!r.ok) throw new Erro(502, canal === "whatsapp" ? "Não foi possível enviar pelo WhatsApp. Tente por e-mail." : "Não foi possível enviar o código. Tente novamente.");
  return json({ ok: true, destino: canal === "email" ? mascararEmail(s.email) : mascararTelefone(s.telefone), validade_min: CODIGO_VALIDADE_MIN });
}

async function acaoPubAssinar(c: Ctx, body: Row) {
  const { s, k } = await porToken(c, body.token);
  if (podeAssinarAgora(k, s)) throw new Erro(409, "Este contrato não está disponível para assinatura");
  if (!(await eAVez(c, k, s))) throw new Erro(409, "Aguarde a assinatura dos signatários anteriores");
  if (body.aceite !== true) throw new Erro(422, "É preciso aceitar os termos do contrato");
  if (s.bloqueado_ate && new Date(s.bloqueado_ate).getTime() > Date.now()) throw new Erro(429, "Assinatura bloqueada por 15 minutos após 5 tentativas erradas");
  const codigo = soDigitos(body.codigo);
  if (codigo.length !== 6) throw new Erro(422, "Informe o código de 6 dígitos");

  const { data: cod } = await c.db
    .from("contrato_codigos_assinatura")
    .select("*")
    .eq("assinatura_id", s.id)
    .is("usado_em", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!cod) throw new Erro(422, "Solicite um código para assinar");
  if (new Date(cod.expira_em).getTime() < Date.now()) throw new Erro(422, "Código expirado, solicite um novo");

  if ((await sha256Hex(`${s.id}:${codigo}`)) !== cod.hash_codigo) {
    const tentativas = (cod.tentativas ?? 0) + 1;
    const esgotou = tentativas >= CODIGO_MAX_TENTATIVAS;
    await c.db
      .from("contrato_codigos_assinatura")
      .update({ tentativas, usado_em: esgotou ? new Date().toISOString() : null })
      .eq("id", cod.id);
    if (esgotou) {
      await c.db.from("contrato_assinaturas").update({ bloqueado_ate: new Date(Date.now() + BLOQUEIO_MIN * 60 * 1000).toISOString() }).eq("id", s.id);
      await evento(c, k.id, "assinatura_bloqueada", `Assinatura de ${s.nome} bloqueada por ${BLOQUEIO_MIN} minutos após ${CODIGO_MAX_TENTATIVAS} tentativas erradas`, { assinatura_id: s.id });
      throw new Erro(429, "Código incorreto. Assinatura bloqueada por 15 minutos.");
    }
    await evento(c, k.id, "codigo_incorreto", `Código incorreto informado (${tentativas}/${CODIGO_MAX_TENTATIVAS})`, { assinatura_id: s.id });
    throw new Erro(422, `Código incorreto. Restam ${CODIGO_MAX_TENTATIVAS - tentativas} tentativa(s).`);
  }

  // RN24: confere a integridade imediatamente antes de assinar
  if (!(await integridadeOk(c, k))) {
    await falhaIntegridade(c, k, s.id);
    throw new Erro(409, "Documento indisponível");
  }

  const agora = new Date().toISOString();
  await c.db.from("contrato_codigos_assinatura").update({ usado_em: agora }).eq("id", cod.id);
  const { data: assinado, error } = await c.db
    .from("contrato_assinaturas")
    .update({
      status: "assinado",
      assinado_em: agora,
      ip_assinatura: c.ip,
      user_agent: c.ua,
      hash_documento: k.hash_original,
      canal_validado: cod.canal,
      contato_validado: cod.destino,
      aceite_termos_em: agora,
      bloqueado_ate: null,
    })
    .eq("id", s.id)
    .eq("status", "pendente")
    .select("*")
    .maybeSingle();
  if (error) throw new Erro(500, error.message);
  if (!assinado) throw new Erro(409, "Assinatura já registrada");
  await evento(c, k.id, "assinado", `Assinado por ${s.nome} (${papelRotulo(s.tipo)}) com código enviado por ${cod.canal === "email" ? "e-mail" : "WhatsApp"}`, {
    assinatura_id: s.id,
    canal: cod.canal,
    dados: { hash_documento: k.hash_original, aceite_termos: true },
  });

  await trustSeguro(c, k, "assinatura", (docId) =>
    registrarEvento(c.db, docId, {
      tipo: "assinatura",
      descricao: `Assinatura da parte ${papelRotulo(s.tipo)} registrada (identificação por código de uso único)`,
      publico: true,
      dados: { ordem: s.ordem, hash_documento: k.hash_original },
    }),
  );

  const sigs = await signatarios(c, k.id);
  const proximo = sigs.find((x) => x.status === "pendente");
  if (proximo) {
    // Cada signatário tem o prazo inteiro a partir do próprio convite
    const t = await modeloDoContrato(c, k).catch(() => null);
    const prazoDias = Number(t?.prazo_assinatura_dias) || 15;
    const expira = new Date(Date.now() + prazoDias * DIA).toISOString();
    const { data: prox } = await c.db
      .from("contrato_assinaturas")
      .update({ enviado_em: agora, link_expires_at: expira })
      .eq("id", proximo.id)
      .select("*")
      .single();
    await c.db.from("contratos").update({ status: "parcialmente_assinado", ultima_assinatura_em: agora, expira_em: expira, link_expires_at: expira }).eq("id", k.id);
    await enviarConvite(c, { ...k, status: "parcialmente_assinado" }, prox, "convite");
    return json({ ok: true, estado: "aguardando_outros" });
  }

  await c.db.from("contratos").update({ status: "assinado_processando", ultima_assinatura_em: agora }).eq("id", k.id);
  const fim = await finalizar(c, k.id);
  return json({ ok: true, estado: fim ? "concluido" : "processando" });
}

async function acaoPubRecusar(c: Ctx, body: Row) {
  const { s, k } = await porToken(c, body.token);
  if (podeAssinarAgora(k, s)) throw new Erro(409, "Este contrato não está disponível");
  if (!(await eAVez(c, k, s))) throw new Erro(409, "Aguarde a assinatura dos signatários anteriores");
  const motivo = String(body.motivo ?? "").trim().slice(0, 1000);
  if (motivo.length < 5) throw new Erro(422, "Informe o motivo da recusa");
  const agora = new Date().toISOString();
  await c.db.from("contrato_assinaturas").update({ status: "recusado", recusado_em: agora, motivo_recusa: motivo }).eq("id", s.id).eq("status", "pendente");
  await c.db.from("contratos").update({ status: "recusado", recusado_em: agora, motivo_recusa: motivo }).eq("id", k.id);
  await evento(c, k.id, "recusado", `Recusado por ${s.nome}. Motivo: ${motivo}`, { assinatura_id: s.id });
  if (k.trust_documento_id) {
    await encerrarDocumento(c.db, k.trust_documento_id, "cancelado", "Assinatura recusada por uma das partes: o contrato não foi concluído");
  }
  await avisarVendedor(c, k, "Contrato recusado", `${esc(s.nome)} (${papelRotulo(s.tipo)}) recusou a assinatura. Motivo: <em>${esc(motivo)}</em>`, true);
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Conclusão: relatório → lacre → guarda → cópias (RN14, RN23, RN25)
// ---------------------------------------------------------------------------
async function finalizar(c: Ctx, contratoId: string): Promise<boolean> {
  // Trava contra execução concorrente (cron + última assinatura): só um
  // processo consegue passar o lacre_status para "pendente". Uma trava velha
  // (processo que caiu no meio) é liberada pelo cron 10 min depois.
  const { data: atual } = await c.db.from("contratos").select("*").eq("id", contratoId).maybeSingle();
  if (!atual || atual.status !== "assinado_processando") return false;
  const travaVelha = atual.lacre_status === "pendente" && atual.lacre_em && Date.now() - new Date(atual.lacre_em).getTime() > 10 * 60 * 1000;
  let q = c.db
    .from("contratos")
    .update({ lacre_status: "pendente", lacre_em: new Date().toISOString() })
    .eq("id", contratoId)
    .eq("status", "assinado_processando");
  q = travaVelha ? q.eq("lacre_status", "pendente") : q.or("lacre_status.is.null,lacre_status.neq.pendente");
  const { data: k } = await q.select("*").maybeSingle();
  if (!k) return false;
  const sigs = await signatarios(c, contratoId);
  if (sigs.some((s) => s.status !== "assinado")) return false;

  try {
    const original = await baixar(c, k.pdf_original_path);
    if ((await sha256Hex(original)) !== k.hash_original) {
      await c.db.from("contratos").update({ lacre_status: "erro", lacre_erro: "Integridade do PDF original divergente" }).eq("id", k.id);
      await falhaIntegridade(c, k, null);
      return false;
    }
    const concluidoEm = sigs.map((s) => s.assinado_em).sort().pop() ?? new Date().toISOString();
    const linhas: LinhaRelatorio[] = sigs.map((s) => ({
      papel: papelRotulo(s.tipo),
      nome: s.nome,
      cpf: s.cpf,
      email: s.email,
      telefone: s.telefone ? mascarar("celular", s.telefone) : null,
      assinado_em: s.assinado_em,
      ip: s.ip_assinatura,
      user_agent: s.user_agent,
      canal: s.canal_validado,
      contato: s.canal_validado === "whatsapp" ? mascararTelefone(s.contato_validado) : s.contato_validado,
    }));
    let final = await anexarRelatorio(original, {
      numero: k.numero,
      titulo: k.titulo,
      hashOriginal: k.hash_original,
      concluidoEm,
      linhas,
      codigoVerificacao: k.trust_codigo,
      urlValidacao: k.trust_codigo ? urlValidacao(k.trust_codigo) : null,
    });

    // Selo ICP-Brasil + carimbo do tempo pelo Uon1 Trust (quando configurado)
    let lacreStatus = "nao_configurado";
    let carimbo: string | null = null;
    if (seloConfigurado()) {
      const { data: em } = await c.db.from("trust_emissores").select("slug, cnpj").eq("slug", EMISSOR).maybeSingle();
      const r = await selarPdf(final, { emissor: { slug: EMISSOR, cnpj: em?.cnpj ?? null }, codigo: k.trust_codigo ?? k.numero, hash: await sha256Hex(final) });
      if (!r.ok) {
        await c.db
          .from("contratos")
          .update({ lacre_status: "erro", lacre_erro: r.erro.slice(0, 500), lacre_tentativas: (k.lacre_tentativas ?? 0) + 1 })
          .eq("id", k.id);
        await evento(c, k.id, "lacre_falhou", `Falha no lacre/carimbo de tempo: ${r.erro}`, { sistema: true });
        return false; // cópias só depois do lacre (7.3)
      }
      final = r.pdf;
      carimbo = r.carimbo_tempo_em;
      lacreStatus = "concluido";
    }

    const hashFinal = await sha256Hex(final);
    const path = `finais/${k.id}/${hashFinal}.pdf`;
    const { error: upErr } = await c.db.storage.from(BUCKET).upload(path, final, { contentType: "application/pdf", upsert: false });
    if (upErr && !/exists|duplicate/i.test(upErr.message)) throw new Error(upErr.message);

    const base = (k.data_fim ?? concluidoEm.slice(0, 10)) as string;
    const [a, m, d] = base.split("-").map(Number);
    const guardarAte = new Date(Date.UTC(a + 5, m - 1, d)).toISOString().slice(0, 10); // D7: vigência + 5 anos

    const { error } = await c.db
      .from("contratos")
      .update({
        status: "assinado",
        pdf_final_path: path,
        hash_final: hashFinal,
        lacre_status: lacreStatus,
        lacre_em: new Date().toISOString(),
        lacre_erro: null,
        carimbo_tempo_em: carimbo,
        concluido_em: concluidoEm,
        guardar_ate: guardarAte,
      })
      .eq("id", k.id)
      .eq("status", "assinado_processando");
    if (error) throw new Error(error.message);
    await evento(
      c,
      k.id,
      "concluido",
      lacreStatus === "concluido"
        ? "Contrato concluído: relatório anexado, lacre ICP-Brasil e carimbo de tempo aplicados"
        : "Contrato concluído: relatório de assinaturas anexado (lacre ICP-Brasil ainda não configurado)",
      { sistema: true, dados: { hash_final: hashFinal, guardar_ate: guardarAte } },
    );

    await trustSeguro(c, k, "registro do assinado", (docId) =>
      registrarVersao(c.db, docId, {
        tipo: lacreStatus === "concluido" ? "selado" : "assinado",
        bytes: final,
        bucket: BUCKET,
        path,
        descricao:
          lacreStatus === "concluido"
            ? "Contrato assinado por todas as partes, com relatório de assinaturas e selo ICP-Brasil"
            : "Contrato assinado por todas as partes, com relatório de assinaturas",
        selo_status: lacreStatus === "concluido" ? "concluido" : "nao_configurado",
        selo_em: lacreStatus === "concluido" ? new Date().toISOString() : null,
      }),
    );

    // RN14: cópia a cada signatário pelos canais do convite + ao vendedor
    for (const s of sigs) await enviarCopia(c, k, s, final);
    const v = await emailDoUsuario(c, k.created_by);
    if (v.email && !sigs.some((s) => s.email === v.email)) await enviarCopia(c, k, null, final, { email: v.email, nome: v.nome ?? "" });
    return true;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 500);
    await c.db.from("contratos").update({ lacre_status: "erro", lacre_erro: msg, lacre_tentativas: (k.lacre_tentativas ?? 0) + 1 }).eq("id", k.id);
    await evento(c, k.id, "finalizacao_falhou", `Falha ao concluir o contrato: ${msg}`, { sistema: true });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Rotina horária
// ---------------------------------------------------------------------------
async function acaoProcessar(c: Ctx) {
  const resumo = { lembretes: 0, expirados: 0, finalizados: 0, alertas: 0 };
  const { data: ativos } = await c.db
    .from("contratos")
    .select("*")
    .eq("fluxo_versao", 2)
    .in("status", STATUS_ATIVOS)
    .limit(500);

  for (const k of ativos ?? []) {
    const sigs = await signatarios(c, k.id);
    const atual = sigs.find((s) => s.status === "pendente" && s.enviado_em);
    if (!atual) continue;

    // Expiração (RN15): prazo de cada convite
    if (atual.link_expires_at && new Date(atual.link_expires_at).getTime() < Date.now()) {
      const { error } = await c.db.from("contratos").update({ status: "expirado" }).eq("id", k.id).in("status", STATUS_ATIVOS);
      if (!error) {
        resumo.expirados++;
        await evento(c, k.id, "expirado", `Prazo de assinatura encerrado sem a assinatura de ${atual.nome}`, { assinatura_id: atual.id, sistema: true });
        if (k.trust_documento_id) {
          await encerrarDocumento(c.db, k.trust_documento_id, "cancelado", "Prazo de assinatura encerrado sem todas as assinaturas: o contrato não foi concluído");
        }
        await avisarVendedor(c, k, "Contrato expirado", `O prazo de assinatura terminou sem a assinatura de ${esc(atual.nome)}. Para seguir, gere um novo contrato.`);
      }
      continue;
    }

    // Lembretes D+3, D+7, D+12 (contados do convite deste signatário)
    if (!k.lembrete_ativo) continue;
    const dias = Math.floor((Date.now() - new Date(atual.enviado_em).getTime()) / DIA);
    const marcos: number[] = (k.lembrete_dias ?? [3, 7, 12]).filter((d: number) => d <= dias);
    const jaEnviados: number[] = atual.lembretes_enviados ?? [];
    const devidos = marcos.filter((d) => !jaEnviados.includes(d));
    if (!devidos.length) continue;
    await enviarConvite(c, k, atual, "lembrete", dias);
    await c.db.from("contrato_assinaturas").update({ lembretes_enviados: [...new Set([...jaEnviados, ...devidos])], ultimo_lembrete_em: new Date().toISOString() }).eq("id", atual.id);
    resumo.lembretes++;
  }

  // Conclusões pendentes (lacre/carimbo com nova tentativa) e alerta após 1h
  const { data: processando } = await c.db.from("contratos").select("*").eq("fluxo_versao", 2).eq("status", "assinado_processando").limit(100);
  for (const k of processando ?? []) {
    if (await finalizar(c, k.id)) {
      resumo.finalizados++;
      continue;
    }
    const desde = new Date(k.ultima_assinatura_em ?? k.updated_at).getTime();
    if (!k.lacre_alertado_em && Date.now() - desde > ALERTA_LACRE_MIN * 60 * 1000) {
      await alertarAdmins(c, k, "Contrato assinado aguardando processamento", `O contrato foi assinado por todos, mas a conclusão (relatório/lacre) não terminou em 1 hora. Último erro: ${k.lacre_erro ?? "—"}`);
      await c.db.from("contratos").update({ lacre_alertado_em: new Date().toISOString() }).eq("id", k.id);
      resumo.alertas++;
    }
  }
  return json({ ok: true, ...resumo });
}

// ---------------------------------------------------------------------------
// Roteador
// ---------------------------------------------------------------------------
const PUBLICAS: Record<string, (c: Ctx, b: Row) => Promise<Response>> = {
  pub_abrir: acaoPubAbrir,
  pub_solicitar_codigo: acaoPubSolicitarCodigo,
  pub_assinar: acaoPubAssinar,
  pub_recusar: acaoPubRecusar,
};
const INTERNAS: Record<string, (c: Ctx, b: Row) => Promise<Response>> = {
  criar: acaoCriar,
  registrar_pdf: acaoRegistrarPdf,
  enviar: acaoEnviar,
  reenviar: acaoReenviar,
  corrigir_contato: acaoCorrigirContato,
  cancelar: acaoCancelar,
  url: acaoUrl,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const body = (await req.json().catch(() => ({}))) as Row;
    const acao = String(body.acao ?? "");
    const c: Ctx = { db, req, ip: ipDe(req), ua: req.headers.get("user-agent")?.slice(0, 500) ?? null, uid: null };

    if (acao === "processar") return await acaoProcessar(c);
    if (PUBLICAS[acao]) return await PUBLICAS[acao](c, body);

    const fn = INTERNAS[acao];
    if (!fn) return json({ erro: "Ação inválida" }, 400);
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ erro: "Não autenticado" }, 401);
    const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: u } = await anon.auth.getUser();
    if (!u?.user) return json({ erro: "Não autenticado" }, 401);
    c.uid = u.user.id;
    return await fn(c, body);
  } catch (e) {
    if (e instanceof Erro) return json({ erro: e.message }, e.status);
    console.error("[uonisign]", e);
    return json({ erro: "Erro interno. Tente novamente." }, 500);
  }
});
