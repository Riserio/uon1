#!/usr/bin/env node
// Gera o bloco de carga dos modelos de contrato do Uon1 Sign (fluxo 2) a partir
// de docs/uonisign/modelos/*.html. Uso:
//   node scripts/gerar-seed-uonisign.mjs > drizzle/migrations/0040_uonisign_modelos.sql
// Os modelos só são inseridos se o slug ainda não existir (não sobrescreve
// ajustes feitos depois pelo administrador).
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = (nome) => readFileSync(join(raiz, "docs/uonisign/modelos", nome), "utf8").trim();

const G_CONTRATANTE = "Dados da Contratante";
const G_CONTATO = "E-mails e responsável financeiro";
const G_VIGENCIA = "Vigência";
const G_VALORES = "Valores";

const camposContratante = [
  { chave: "Contratante", rotulo: "Razão social", tipo: "texto", grupo: G_CONTRATANTE, min: 3, max: 150 },
  { chave: "CNPJ_do_Contratante", rotulo: "CNPJ", tipo: "cnpj", grupo: G_CONTRATANTE },
  { chave: "CEP", rotulo: "CEP", tipo: "cep", grupo: G_CONTRATANTE },
  { chave: "Logradouro", rotulo: "Rua ou avenida", tipo: "texto", grupo: G_CONTRATANTE, max: 150 },
  { chave: "Numero", rotulo: "Número", tipo: "texto", grupo: G_CONTRATANTE, max: 10, ajuda: "Aceita S/N" },
  { chave: "Complemento", rotulo: "Complemento", tipo: "texto", grupo: G_CONTRATANTE, obrigatorio: false, max: 60 },
  { chave: "Bairro", rotulo: "Bairro", tipo: "texto", grupo: G_CONTRATANTE, max: 80 },
  { chave: "Cidade", rotulo: "Cidade", tipo: "texto", grupo: G_CONTRATANTE, max: 80 },
  { chave: "Estado", rotulo: "UF", tipo: "uf", grupo: G_CONTRATANTE },
  { chave: "Representante_Legal", rotulo: "Representante legal", tipo: "texto", grupo: G_CONTRATANTE, min: 3, max: 120, ajuda: "Também será o signatário da Contratante" },
  { chave: "Identidade", rotulo: "RG do representante", tipo: "texto", grupo: G_CONTRATANTE, max: 20 },
  { chave: "CPF", rotulo: "CPF do representante", tipo: "cpf", grupo: G_CONTRATANTE },
];

const camposContato = (clausulaEmail, clausulaCobranca) => [
  { chave: "Email", rotulo: "E-mail da Contratante", tipo: "email", grupo: G_CONTATO, clausula: clausulaEmail, ajuda: "Recebe as notificações e o convite de assinatura" },
  { chave: "Email_para_cobranca", rotulo: "E-mail de cobrança", tipo: "email", grupo: G_CONTATO, clausula: clausulaCobranca, copiar_de: "Email" },
  { chave: "Responsavel_financeiro", rotulo: "Responsável financeiro", tipo: "texto", grupo: G_CONTATO, max: 120, clausula: clausulaCobranca },
  { chave: "Telefone_do_Responsavel", rotulo: "Telefone do responsável financeiro", tipo: "telefone", grupo: G_CONTATO, clausula: clausulaCobranca },
];

const camposVigencia = [
  { chave: "Data_Inicio", rotulo: "Data de início", tipo: "data", grupo: G_VIGENCIA },
  { chave: "Prazo_Vigencia_Meses", rotulo: "Vigência (meses)", tipo: "inteiro", grupo: G_VIGENCIA, min: 1, max: 120, padrao: "12" },
];

// Qualificação da Vangard nos três modelos. O texto usa ${Contratada_*}, preenchido
// com esta configuração (editável em Uon1 Sign → Modelos → Configurar).
const contratada = {
  razao_social: "VANGARD GESTÃO DE NEGOCIOS SA",
  cnpj: "49195646000160",
  endereco: "Rua Gonçalves Dias, nº 89, sala 902, Bairro Funcionários, Belo Horizonte/MG",
  email: "contato@vangardgestora.com.br",
  representante: "MIRIAM MARCIA SOARES",
  representante_rg: "15409003",
  representante_cpf: "09504867600",
  foro: "Belo Horizonte/MG",
};

const moeda = (chave, rotulo, clausula, extra = {}) => ({ chave, rotulo, tipo: "moeda", grupo: G_VALORES, clausula, ...extra });

const modelos = [
  {
    slug: "ppr-manutencao",
    titulo: "Contrato PPR + Manutenção",
    categoria: "Prestação de Serviços",
    descricao: "Programa Preparatório Regulatório (PPR) de 12 meses com mensalidade, fase de manutenção depois e direito de preferência. Contratada: Vangard.",
    arquivo: "ppr-manutencao.html",
    campos: [
      ...camposContratante,
      moeda("Valor_Mensal_PPR", "Mensalidade do PPR (R$)", "3.1", { soma_valor: true }),
      moeda("Valor_Mensal_Manutencao", "Mensalidade da manutenção (R$)", "4.1.2"),
      { chave: "Administradora_Razao_Social", rotulo: "Razão social da Administradora", tipo: "texto", grupo: G_VALORES, clausula: "5.1", min: 3, max: 150, padrao: "VANGARD ADMINISTRADORA" },
      { chave: "Administradora_CNPJ", rotulo: "CNPJ da Administradora", tipo: "cnpj", grupo: G_VALORES, clausula: "5.1" },
      ...camposContato("Qualificação", "3.4"),
      ...camposVigencia,
    ],
  },
  {
    slug: "assistencia-24h-rastreamento",
    titulo: "Assistência 24 horas — Central de Teleatendimento",
    categoria: "Adesão",
    descricao: "Disponibilização de central de teleatendimento e rede de prestadores de assistência 24h, com preço por veículo ativo e valor mínimo mensal.",
    arquivo: "assistencia-rastreamento.html",
    campos: [
      ...camposContratante,
      moeda("Valor_Passeio_Moto", "Passeio ou moto, por veículo ativo (R$)", "2.1", { padrao: "3,90" }),
      moeda("Valor_Caminhao", "Caminhão, por veículo ativo (R$)", "2.1", { padrao: "10,80" }),
      moeda("Valor_Minimo_Mensal", "Valor mínimo mensal (R$)", "2.1", { padrao: "600,00", soma_valor: true }),
      { chave: "Email", rotulo: "E-mail da Contratante", tipo: "email", grupo: G_CONTATO, clausula: "15.1", ajuda: "Recebe as notificações e o convite de assinatura" },
      ...camposVigencia,
    ],
  },
  {
    slug: "prestacao-servicos-b2b",
    titulo: "Prestação de Serviços para Terceirização",
    categoria: "Prestação de Serviços",
    descricao: "Terceirização, assessoria e gerenciamento administrativo da associação, com preço por veículo ativo, implantação, Anexo I (Assistência 24h) e Anexo II (serviços extras).",
    arquivo: "prestacao-servicos-b2b.html",
    campos: [
      ...camposContratante,
      moeda("Valor_Por_Veiculo", "Por veículo ativo (R$)", "4.a", { padrao: "18,90" }),
      moeda("Valor_Minimo_Mensal", "Pagamento mínimo mensal (R$)", "4.a", { padrao: "2.750,00", soma_valor: true }),
      { chave: "Data_Primeira_Cobranca", rotulo: "Data da primeira cobrança", tipo: "data", grupo: G_VALORES, clausula: "4.a" },
      moeda("Valor_Implantacao", "Implantação (R$)", "4.b", { permite_zero: true }),
      { chave: "Data_Vencimento_Implantacao", rotulo: "Vencimento da implantação", tipo: "data", grupo: G_VALORES, clausula: "4.b" },
      moeda("Valor_Caminhao", "Assistência 24h — caminhão, por veículo ativo (R$)", "Anexo I", { padrao: "10,80" }),
      ...camposContato("15.1", "5.2"),
      ...camposVigencia,
    ],
  },
];

const q = (s) => `$uonisign$${s}$uonisign$`;
const json = (v) => `${q(JSON.stringify(v))}::jsonb`;

const out = [];
if (process.argv.includes("--atualizar")) {
  // Grava o texto, os campos e a Contratada de cada modelo como nova versão
  // (o gatilho do banco registra a versão anterior em contrato_template_versoes).
  out.push(`-- Uon1 Sign: atualiza texto, campos e Contratada dos modelos do fluxo 2
-- (gerado por: node scripts/gerar-seed-uonisign.mjs --atualizar). Contratos já
-- criados guardam o próprio HTML e não mudam. Idempotente.
`);
  for (const m of modelos) {
    out.push(`UPDATE public.contrato_templates SET
  titulo = ${q(m.titulo)}, descricao = ${q(m.descricao)}, categoria = ${q(m.categoria)},
  conteudo_html = ${q(html(m.arquivo))},
  campos = ${json(m.campos)},
  contratada = ${json(contratada)},
  ativo = true
WHERE slug = ${q(m.slug)}
  AND (md5(conteudo_html) IS DISTINCT FROM '${createHash("md5").update(html(m.arquivo)).digest("hex")}'
    OR campos IS DISTINCT FROM ${json(m.campos)} OR contratada IS DISTINCT FROM ${json(contratada)});
`);
  }
  out.push(`-- Modelos fora destes três deixam de aparecer para novos contratos; os contratos
-- já feitos com eles continuam acessíveis.
UPDATE public.contrato_templates SET ativo = false
WHERE ativo AND (slug IS NULL OR slug NOT IN (${modelos.map((m) => q(m.slug)).join(", ")}));
`);
  process.stdout.write(out.join("\n"));
  process.exit(0);
}
out.push(`-- 2026-11-14 — Uon1 Sign: modelos de contrato do fluxo 2 (gerado por scripts/gerar-seed-uonisign.mjs)
--
-- Insere os modelos só se o slug ainda não existir. Antes de usar, o
-- administrador completa em Uon1 Sign → Modelos → Configurar: CNPJ, endereço e
-- representante da Contratada e o signatário fixo da Vangard (Q3). Enquanto
-- isso não for feito, o envio fica bloqueado com aviso na tela.
--
-- Depende de 0039_uonisign_v2.sql. Idempotente. Aplicar sem modificações.
`);
for (const m of modelos) {
  out.push(`INSERT INTO public.contrato_templates
  (slug, titulo, descricao, categoria, conteudo_html, tipo_template, ativo, fluxo_versao,
   campos, contratada, signatario_contratada, prazo_assinatura_dias, lembrete_dias, created_by)
SELECT ${q(m.slug)}, ${q(m.titulo)}, ${q(m.descricao)}, ${q(m.categoria)},
  ${q(html(m.arquivo))},
  'html', true, 2,
  ${json(m.campos)},
  ${json(contratada)},
  ${json({ nome: "", cpf: "", email: "", telefone: "", canais: ["email"] })},
  15, ARRAY[3, 7, 12],
  coalesce(
    (SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'superintendente' LIMIT 1),
    (SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin' LIMIT 1),
    (SELECT id FROM public.profiles LIMIT 1))
WHERE NOT EXISTS (SELECT 1 FROM public.contrato_templates WHERE slug = ${q(m.slug)});
`);
}
process.stdout.write(out.join("\n"));
