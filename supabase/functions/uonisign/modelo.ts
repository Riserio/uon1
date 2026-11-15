// Uon1 Sign — regras do modelo de contrato compartilhadas entre a edge function
// (Deno) e as telas (Vite importa este arquivo por caminho relativo).
// Sem imports: precisa rodar igual nos dois ambientes.

export type TipoCampo =
  | "texto"
  | "texto_longo"
  | "cnpj"
  | "cpf"
  | "cep"
  | "uf"
  | "email"
  | "telefone"
  | "celular"
  | "moeda"
  | "inteiro"
  | "data";

export interface CampoModelo {
  chave: string;
  rotulo: string;
  tipo: TipoCampo;
  grupo?: string;
  obrigatorio?: boolean; // padrão: true
  min?: number;
  max?: number;
  padrao?: string;
  ajuda?: string;
  clausula?: string;
  copiar_de?: string;
  permite_zero?: boolean; // só moeda
  soma_valor?: boolean; // compõe o "valor do contrato" exibido nas listas
}

export interface ContratadaModelo {
  razao_social?: string;
  cnpj?: string;
  endereco?: string;
  email?: string;
  representante?: string;
  foro?: string;
}

export interface SignatarioContratada {
  nome?: string;
  cpf?: string;
  email?: string;
  telefone?: string;
  canais?: string[];
}

export type Dados = Record<string, string>;

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

// Campos usados quando um modelo antigo (sem definição de campos) é habilitado
// no fluxo novo: cobre os placeholders {{nome}}, {{cpf}}, {{email}}, ...
export const CAMPOS_PADRAO: CampoModelo[] = [
  { chave: "Contratante", rotulo: "Razão social", tipo: "texto", grupo: "Dados da Contratante", min: 3, max: 150 },
  { chave: "CNPJ_do_Contratante", rotulo: "CNPJ", tipo: "cnpj", grupo: "Dados da Contratante" },
  { chave: "CEP", rotulo: "CEP", tipo: "cep", grupo: "Dados da Contratante" },
  { chave: "Logradouro", rotulo: "Rua ou avenida", tipo: "texto", grupo: "Dados da Contratante", max: 150 },
  { chave: "Numero", rotulo: "Número", tipo: "texto", grupo: "Dados da Contratante", max: 10 },
  { chave: "Complemento", rotulo: "Complemento", tipo: "texto", grupo: "Dados da Contratante", obrigatorio: false, max: 60 },
  { chave: "Bairro", rotulo: "Bairro", tipo: "texto", grupo: "Dados da Contratante", max: 80 },
  { chave: "Cidade", rotulo: "Cidade", tipo: "texto", grupo: "Dados da Contratante", max: 80 },
  { chave: "Estado", rotulo: "UF", tipo: "uf", grupo: "Dados da Contratante" },
  { chave: "Representante_Legal", rotulo: "Representante legal", tipo: "texto", grupo: "Dados da Contratante", min: 3, max: 120 },
  { chave: "CPF", rotulo: "CPF do representante", tipo: "cpf", grupo: "Dados da Contratante" },
  { chave: "Email", rotulo: "E-mail da Contratante", tipo: "email", grupo: "Contato" },
  { chave: "Telefone", rotulo: "Telefone", tipo: "telefone", grupo: "Contato", obrigatorio: false },
  { chave: "Valor", rotulo: "Valor (R$)", tipo: "moeda", grupo: "Valores", soma_valor: true },
  { chave: "Data_Inicio", rotulo: "Data de início", tipo: "data", grupo: "Vigência" },
  { chave: "Prazo_Vigencia_Meses", rotulo: "Vigência (meses)", tipo: "inteiro", grupo: "Vigência", min: 1, max: 120, padrao: "12" },
];

// ---------------------------------------------------------------------------
// Validações
// ---------------------------------------------------------------------------
export const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export function cpfValido(valor: string): boolean {
  const c = soDigitos(valor);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(c.slice(0, 9), 10) === Number(c[9]) && dv(c.slice(0, 10), 11) === Number(c[10]);
}

export function cnpjValido(valor: string): boolean {
  const c = soDigitos(valor);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + p * Number(base[i]), 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]);
}

export const emailValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v ?? "").trim());

/** Moeda canônica: "1250.5" / "1250,50" / "R$ 1.250,50" → 1250.5 (ou NaN) */
export function lerMoeda(v: string | number | null | undefined): number {
  if (typeof v === "number") return v;
  const s = (v ?? "").toString().trim().replace(/[R$\s]/g, "");
  if (!s) return NaN;
  // Formato BR (1.250,50) ou canônico (1250.50)
  const normal = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^-?\d+(\.\d+)?$/.test(normal)) return NaN;
  return Number(normal);
}

const casasDecimais = (v: string) => {
  const s = (v ?? "").toString().trim();
  const sep = s.includes(",") ? "," : ".";
  const i = s.lastIndexOf(sep);
  return i === -1 || (sep === "." && s.split(".").length > 2) ? 0 : s.length - i - 1;
};

export function validarCampo(campo: CampoModelo, bruto: string | undefined): string | null {
  const v = (bruto ?? "").toString().trim();
  const obrigatorio = campo.obrigatorio !== false;
  if (!v) return obrigatorio ? "Campo obrigatório" : null;
  switch (campo.tipo) {
    case "cpf":
      return cpfValido(v) ? null : "CPF inválido";
    case "cnpj":
      return cnpjValido(v) ? null : "CNPJ inválido";
    case "cep":
      return soDigitos(v).length === 8 ? null : "CEP deve ter 8 dígitos";
    case "uf":
      return UFS.includes(v.toUpperCase()) ? null : "UF inválida";
    case "email":
      return emailValido(v) ? null : "E-mail inválido";
    case "telefone": {
      const n = soDigitos(v).length;
      return n === 10 || n === 11 ? null : "Informe DDD + número";
    }
    case "celular":
      return soDigitos(v).length === 11 ? null : "Celular com DDD deve ter 11 dígitos";
    case "moeda": {
      const n = lerMoeda(v);
      if (Number.isNaN(n)) return "Valor inválido";
      if (n < 0 || (n === 0 && !campo.permite_zero)) return "Informe um valor maior que zero";
      if (casasDecimais(v) > 2) return "Use no máximo duas casas decimais";
      if (n >= 1e12) return "Valor muito alto";
      return null;
    }
    case "inteiro": {
      if (!/^\d+$/.test(v)) return "Informe um número inteiro";
      const n = Number(v);
      if (campo.min != null && n < campo.min) return `Mínimo ${campo.min}`;
      if (campo.max != null && n > campo.max) return `Máximo ${campo.max}`;
      return null;
    }
    case "data":
      return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T12:00:00Z")) ? null : "Data inválida";
    default: {
      if (campo.min != null && v.length < campo.min) return `Mínimo de ${campo.min} caracteres`;
      if (campo.max != null && v.length > campo.max) return `Máximo de ${campo.max} caracteres`;
      return null;
    }
  }
}

export function validarDados(campos: CampoModelo[], dados: Dados): Record<string, string> {
  const erros: Record<string, string> = {};
  for (const c of campos) {
    const e = validarCampo(c, dados[c.chave]);
    if (e) erros[c.chave] = e;
  }
  return erros;
}

// ---------------------------------------------------------------------------
// Valor por extenso (RN08)
// ---------------------------------------------------------------------------
const UNIDADES = [
  "zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze",
  "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos",
  "oitocentos", "novecentos",
];

function ate999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (r) {
    if (r < 20) partes.push(UNIDADES[r]);
    else partes.push(DEZENAS[Math.floor(r / 10)] + (r % 10 ? " e " + UNIDADES[r % 10] : ""));
  }
  return partes.join(" e ");
}

/** Inteiro por extenso, conforme a norma: "mil duzentos e cinquenta", "mil e cem", "dois mil e quinhentos" */
export function inteiroPorExtenso(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  n = Math.floor(n);
  if (n === 0) return "zero";
  const escalas: [number, string, string][] = [
    [1e9, "bilhão", "bilhões"],
    [1e6, "milhão", "milhões"],
    [1e3, "mil", "mil"],
    [1, "", ""],
  ];
  const grupos: { valor: number; texto: string }[] = [];
  let resto = n;
  for (const [base, sing, plur] of escalas) {
    const g = Math.floor(resto / base);
    resto %= base;
    if (!g) continue;
    let texto: string;
    if (base === 1e3) texto = g === 1 ? "mil" : `${ate999(g)} mil`;
    else if (base === 1) texto = ate999(g);
    else texto = `${ate999(g)} ${g === 1 ? sing : plur}`;
    grupos.push({ valor: g, texto });
  }
  return grupos
    .map((g, i) => {
      if (i === 0) return g.texto;
      const ultimo = i === grupos.length - 1;
      const usaE = ultimo && (g.valor < 100 || g.valor % 100 === 0);
      return (usaE ? " e " : " ") + g.texto;
    })
    .join("");
}

export function moedaPorExtenso(valor: number): string {
  if (!Number.isFinite(valor) || valor < 0) return "";
  const centavosTotal = Math.round(valor * 100);
  const reais = Math.floor(centavosTotal / 100);
  const centavos = centavosTotal % 100;
  const partes: string[] = [];
  if (reais > 0) {
    const txt = inteiroPorExtenso(reais);
    const redondoMilhao = reais >= 1e6 && reais % 1e6 === 0;
    partes.push(`${txt}${redondoMilhao ? " de" : ""} ${reais === 1 ? "real" : "reais"}`);
  }
  if (centavos > 0) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  if (!partes.length) return "zero real";
  return partes.join(" e ");
}

export function formatarMoeda(valor: number): string {
  if (!Number.isFinite(valor)) return "";
  const [int, dec] = valor.toFixed(2).split(".");
  const milhar = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${milhar},${dec}`;
}

// ---------------------------------------------------------------------------
// Máscaras e formatação
// ---------------------------------------------------------------------------
export function mascarar(tipo: TipoCampo, v: string): string {
  const d = soDigitos(v);
  switch (tipo) {
    case "cpf":
      return d.slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    case "cnpj":
      return d
        .slice(0, 14)
        .replace(/^(\d{2})(\d)/, "$1.$2")
        .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1/$2")
        .replace(/(\d{4})(\d)/, "$1-$2");
    case "cep":
      return d.slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
    case "telefone":
    case "celular": {
      const t = d.slice(0, 11);
      if (t.length <= 10) return t.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
      return t.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
    }
    default:
      return v;
  }
}

export function formatarData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso ?? "";
}

/** data ISO + meses (fim da vigência = início + meses − 1 dia) */
export function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1 + meses, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

export function mascararEmail(e?: string | null): string {
  if (!e) return "";
  const [u, dom] = e.split("@");
  if (!dom) return e;
  return `${u.slice(0, 2)}${"*".repeat(Math.max(1, u.length - 2))}@${dom}`;
}

export function mascararTelefone(t?: string | null): string {
  const d = soDigitos(t);
  if (d.length < 4) return "";
  return `(${d.slice(0, 2)}) *****-${d.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Renderização do texto do contrato
// ---------------------------------------------------------------------------
const escapar = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface ContextoRender {
  numero?: string;
  dataEmissao?: string; // ISO
  contratada?: ContratadaModelo;
  signatarioContratada?: SignatarioContratada;
}

/** Valores finais de todas as variáveis (já formatados para o texto). */
export function variaveisDoContrato(campos: CampoModelo[], dados: Dados, ctx: ContextoRender): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of campos) {
    const v = (dados[c.chave] ?? "").toString().trim();
    switch (c.tipo) {
      case "moeda": {
        const n = lerMoeda(v);
        out[c.chave] = Number.isNaN(n) ? "" : formatarMoeda(n);
        out[`${c.chave}_Extenso`] = Number.isNaN(n) ? "" : moedaPorExtenso(n);
        break;
      }
      case "data":
        out[c.chave] = formatarData(v);
        break;
      case "cpf":
      case "cnpj":
      case "cep":
      case "telefone":
      case "celular":
        out[c.chave] = mascarar(c.tipo, v);
        break;
      case "uf":
        out[c.chave] = v.toUpperCase();
        break;
      default:
        out[c.chave] = v;
    }
  }
  const end = [
    [out.Logradouro, out.Numero].filter(Boolean).join(", "),
    out.Complemento,
    out.Bairro,
    [out.Cidade, out.Estado].filter(Boolean).join("/"),
    out.CEP ? `CEP ${out.CEP}` : "",
  ].filter(Boolean);
  out.Endereco_Completo = end.join(", ");

  const k = ctx.contratada ?? {};
  out.Contratada_Razao_Social = k.razao_social ?? "";
  out.Contratada_CNPJ = k.cnpj ? mascarar("cnpj", k.cnpj) : "";
  out.Contratada_Endereco = k.endereco ?? "";
  out.Contratada_Email = k.email ?? ctx.signatarioContratada?.email ?? "";
  out.Contratada_Representante = k.representante || ctx.signatarioContratada?.nome || "";
  out.Foro = k.foro ?? "";
  out.Numero_Contrato = ctx.numero ?? "";
  out.Data_Emissao = formatarData((ctx.dataEmissao ?? new Date().toISOString()).slice(0, 10));

  // Placeholders dos modelos antigos ({{nome}}, {{cpf}}, ...)
  out["{{nome}}"] = out.Contratante || out.Representante_Legal || "";
  out["{{cpf}}"] = out.CPF ?? "";
  out["{{email}}"] = out.Email ?? "";
  out["{{telefone}}"] = out.Telefone ?? out.Telefone_do_Responsavel ?? "";
  const somaChave = campos.find((c) => c.soma_valor)?.chave;
  out["{{valor}}"] = somaChave ? out[somaChave] ?? "" : "";
  out["{{data_inicio}}"] = out.Data_Inicio ?? "";
  const meses = Number(dados.Prazo_Vigencia_Meses);
  out["{{data_fim}}"] = dados.Data_Inicio && meses ? formatarData(somarMeses(dados.Data_Inicio, meses)) : "";
  out["{{data_atual}}"] = out.Data_Emissao;
  return out;
}

export interface ResultadoRender {
  html: string;
  faltando: string[];
}

export function renderizarContrato(html: string, campos: CampoModelo[], dados: Dados, ctx: ContextoRender): ResultadoRender {
  const vars = variaveisDoContrato(campos, dados, ctx);
  const faltando = new Set<string>();
  let saida = html.replace(/\$\{\s*([A-Za-z0-9_]+)\s*\}/g, (_m, chave: string) => {
    const v = vars[chave];
    if (v == null || v === "") {
      const opcional = campos.find((c) => c.chave === chave)?.obrigatorio === false;
      if (!opcional) faltando.add(chave);
      return opcional ? "" : `[${chave}]`;
    }
    return escapar(v);
  });
  saida = saida.replace(/\{\{\s*(nome|cpf|email|telefone|valor|data_inicio|data_fim|data_atual)\s*\}\}/gi, (_m, k: string) =>
    escapar(vars[`{{${k.toLowerCase()}}}`] ?? ""),
  );
  return { html: saida, faltando: [...faltando] };
}

/** Variáveis ${...} usadas no texto e que nenhum campo/sistema preenche. */
export function variaveisSemCampo(html: string, campos: CampoModelo[]): string[] {
  const sistema = new Set([
    "Endereco_Completo", "Contratada_Razao_Social", "Contratada_CNPJ", "Contratada_Endereco",
    "Contratada_Email", "Contratada_Representante", "Foro", "Numero_Contrato", "Data_Emissao",
  ]);
  const conhecidas = new Set<string>();
  campos.forEach((c) => {
    conhecidas.add(c.chave);
    if (c.tipo === "moeda") conhecidas.add(`${c.chave}_Extenso`);
  });
  const usadas = [...html.matchAll(/\$\{\s*([A-Za-z0-9_]+)\s*\}/g)].map((m) => m[1]);
  return [...new Set(usadas.filter((u) => !sistema.has(u) && !conhecidas.has(u)))];
}

/** O que precisa estar configurado no modelo antes de enviar (D8, Q3). */
export function pendenciasDoModelo(contratada: ContratadaModelo, sig: SignatarioContratada, html: string): string[] {
  const p: string[] = [];
  if (!sig?.nome?.trim()) p.push("nome do signatário da Contratada");
  if (!sig?.cpf || !cpfValido(sig.cpf)) p.push("CPF do signatário da Contratada");
  if (!sig?.email || !emailValido(sig.email)) p.push("e-mail do signatário da Contratada");
  if ((sig?.canais ?? []).includes("whatsapp") && soDigitos(sig.telefone).length !== 11) p.push("celular do signatário da Contratada");
  const usa = (k: string) => html.includes("${" + k + "}");
  if (usa("Contratada_Razao_Social") && !contratada?.razao_social?.trim()) p.push("razão social da Contratada");
  if (usa("Contratada_CNPJ") && (!contratada?.cnpj || !cnpjValido(contratada.cnpj))) p.push("CNPJ da Contratada");
  if (usa("Contratada_Endereco") && !contratada?.endereco?.trim()) p.push("endereço da Contratada");
  if (usa("Foro") && !contratada?.foro?.trim()) p.push("foro");
  return p;
}

/** Colunas do contrato derivadas dos dados (listas, filtros, guarda). */
export function derivarContrato(campos: CampoModelo[], dados: Dados) {
  const somaCampos = campos.filter((c) => c.soma_valor);
  const valor = somaCampos.length
    ? somaCampos.reduce((s, c) => s + (Number.isNaN(lerMoeda(dados[c.chave])) ? 0 : lerMoeda(dados[c.chave])), 0)
    : null;
  const meses = Number(dados.Prazo_Vigencia_Meses);
  const inicio = /^\d{4}-\d{2}-\d{2}$/.test(dados.Data_Inicio ?? "") ? dados.Data_Inicio : null;
  return {
    contratante_nome: (dados.Contratante ?? dados.Representante_Legal ?? "").trim() || null,
    contratante_cnpj: dados.CNPJ_do_Contratante ? mascarar("cnpj", dados.CNPJ_do_Contratante) : null,
    contratante_cpf: dados.CPF ? mascarar("cpf", dados.CPF) : null,
    contratante_email: (dados.Email ?? "").trim().toLowerCase() || null,
    representante_nome: (dados.Representante_Legal ?? "").trim() || null,
    valor_contrato: valor,
    data_inicio: inicio,
    data_fim: inicio && meses > 0 ? somarMeses(inicio, meses) : null,
  };
}
