#!/usr/bin/env node
// Gera o bloco de carga dos modelos de contrato do uoniSign (fluxo 2) a partir
// de docs/uonisign/modelos/*.html. Uso:
//   node scripts/gerar-seed-uonisign.mjs > drizzle/migrations/0040_uonisign_modelos.sql
// Os modelos só são inseridos se o slug ainda não existir (não sobrescreve
// ajustes feitos depois pelo administrador).
import { readFileSync } from "node:fs";
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

const diaVencimento = { chave: "Dia_Vencimento", rotulo: "Dia de vencimento", tipo: "inteiro", grupo: G_VALORES, min: 1, max: 28, padrao: "10" };

const contratada = {
  razao_social: "Vangard Gestora",
  cnpj: "",
  endereco: "",
  email: "contatos@vangardgestora.com.br",
  representante: "",
  foro: "Belo Horizonte/MG",
};

const modelos = [
  {
    slug: "ppr-manutencao",
    titulo: "Contrato PPR + Manutenção",
    categoria: "Prestação de Serviços",
    descricao: "Programa Preparatório Regulatório (PPR) com mensalidade durante a execução e manutenção mensal depois. Contratada: Vangard.",
    arquivo: "ppr-manutencao.html",
    campos: [
      ...camposContratante,
      { chave: "Valor_Mensal_PPR", rotulo: "Mensalidade do PPR (R$)", tipo: "moeda", grupo: G_VALORES, clausula: "3.1", soma_valor: true },
      { chave: "Prazo_PPR_Meses", rotulo: "Duração do PPR (meses)", tipo: "inteiro", grupo: G_VALORES, clausula: "1.3", min: 1, max: 36, padrao: "6" },
      { chave: "Valor_Mensal_Manutencao", rotulo: "Mensalidade da manutenção (R$)", tipo: "moeda", grupo: G_VALORES, clausula: "4.1.2" },
      diaVencimento,
      ...camposContato("18.1", "3.4"),
      ...camposVigencia,
    ],
  },
  {
    slug: "assistencia-24h-rastreamento",
    titulo: "Adesão — Assistência 24h e Rastreamento",
    categoria: "Adesão",
    descricao: "Adesão da associação aos serviços de assistência 24 horas e rastreamento veicular, com preço por veículo e franquia mínima.",
    arquivo: "assistencia-rastreamento.html",
    campos: [
      ...camposContratante,
      { chave: "Valor_Assistencia_Veiculo", rotulo: "Assistência 24h por veículo/mês (R$)", tipo: "moeda", grupo: G_VALORES, clausula: "4.1" },
      { chave: "Valor_Rastreamento_Veiculo", rotulo: "Rastreamento por veículo/mês (R$)", tipo: "moeda", grupo: G_VALORES, clausula: "4.1" },
      { chave: "Quantidade_Minima_Veiculos", rotulo: "Quantidade mínima de veículos", tipo: "inteiro", grupo: G_VALORES, clausula: "4.2", min: 1, max: 1000000, padrao: "100" },
      diaVencimento,
      ...camposContato("15.1", "4.4"),
      ...camposVigencia,
    ],
  },
  {
    slug: "prestacao-servicos-b2b",
    titulo: "Prestação de Serviços — Gestão, Tecnologia e Cobrança",
    categoria: "Prestação de Serviços",
    descricao: "Vangard × associação para plataforma UONI, BI, relatórios e gestão de cobrança, sem PPR. Implantação + mensalidade.",
    arquivo: "prestacao-servicos-b2b.html",
    campos: [
      ...camposContratante,
      { chave: "Servicos_Contratados", rotulo: "Serviços contratados", tipo: "texto_longo", grupo: G_VALORES, clausula: "1.1", max: 600, padrao: "acesso à plataforma UONI, com painéis de BI e relatórios gerenciais, e gestão da cobrança dos associados" },
      { chave: "Valor_Implantacao", rotulo: "Implantação (R$)", tipo: "moeda", grupo: G_VALORES, clausula: "3.1", permite_zero: true },
      { chave: "Valor_Mensal_Servicos", rotulo: "Mensalidade (R$)", tipo: "moeda", grupo: G_VALORES, clausula: "3.2", soma_valor: true },
      diaVencimento,
      ...camposContato("14.1", "3.3"),
      ...camposVigencia,
    ],
  },
];

const q = (s) => `$uonisign$${s}$uonisign$`;
const json = (v) => `${q(JSON.stringify(v))}::jsonb`;

const out = [];
out.push(`-- 2026-11-14 — uoniSign: modelos de contrato do fluxo 2 (gerado por scripts/gerar-seed-uonisign.mjs)
--
-- Insere os modelos só se o slug ainda não existir. Antes de usar, o
-- administrador completa em uoniSign → Modelos → Configurar: CNPJ, endereço e
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
