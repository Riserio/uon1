// Placa: aceita o padrão antigo (ABC1234) e o Mercosul (ABC1D23).
//
// Sem hífen de propósito: o Mercosul não usa, e guardar com hífen fazia a
// mesma placa não casar com a base do SGA, que grava sem pontuação.
// A máscara já impede letra onde só cabe número, então quem digita errado
// percebe na hora em vez de descobrir na validação.
export function maskPlaca(v: string) {
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const letra = /[A-Z]/.test(c);
    const digito = /[0-9]/.test(c);
    // posições 0-2 = letras; 3 = dígito; 4 = letra ou dígito; 5-6 = dígitos
    if (i <= 2 && !letra) continue;
    if (i === 3 && !digito) continue;
    if (i === 4 && !letra && !digito) continue;
    if (i >= 5 && !digito) continue;
    out += c;
  }
  return out;
}

export function validarPlaca(v: string) {
  const s = (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(s);
}

// Hora HH:MM, com limite em 23:59.
export function maskHora(v: string) {
  const s = v.replace(/\D/g, "").slice(0, 4);
  if (!s) return "";
  if (s.length <= 2) {
    const h = Math.min(23, parseInt(s, 10));
    return s.length === 2 ? String(h).padStart(2, "0") : s;
  }
  const h = Math.min(23, parseInt(s.slice(0, 2), 10));
  const m = Math.min(59, parseInt(s.slice(2), 10) || 0);
  return `${String(h).padStart(2, "0")}:${s.length === 4 ? String(m).padStart(2, "0") : s.slice(2)}`;
}

export function validarHora(v: string) {
  return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v || "");
}
export function maskCPF(v: string) {
  const s = v.replace(/\D/g, "").slice(0, 11);
  return s
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
export function maskCNPJ(v: string) {
  const s = v.replace(/\D/g, "").slice(0, 14);
  return s
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}
export function maskCEP(v: string) {
  const s = v.replace(/\D/g, "").slice(0, 8);
  return s.replace(/^(\d{5})(\d)/, "$1-$2");
}
// Dígito verificador de CPF. Sem isso a máscara aceitava 111.111.111-11.
export function validarCPF(v: string) {
  const s = (v || "").replace(/\D/g, "");
  if (s.length !== 11 || /^(\d)\1{10}$/.test(s)) return false;
  const dv = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += parseInt(base[i], 10) * (pesoInicial - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(s.slice(0, 9), 10) === +s[9] && dv(s.slice(0, 10), 11) === +s[10];
}

export function validarCNPJ(v: string) {
  const s = (v || "").replace(/\D/g, "");
  if (s.length !== 14 || /^(\d)\1{13}$/.test(s)) return false;
  const dv = (base: string) => {
    let peso = base.length - 7;
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += parseInt(base[i], 10) * peso--;
      if (peso < 2) peso = 9;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(s.slice(0, 12)) === +s[12] && dv(s.slice(0, 13)) === +s[13];
}

// Fixo (10) ou celular (11) com o nono dígito começando em 9, e DDD válido.
export function validarTelefone(v: string) {
  const s = (v || "").replace(/\D/g, "");
  if (s.length !== 10 && s.length !== 11) return false;
  if (parseInt(s.slice(0, 2), 10) < 11) return false;
  if (s.length === 11 && s[2] !== "9") return false;
  return true;
}

export function validarCEP(v: string) {
  return /^\d{5}-?\d{3}$/.test((v || "").trim());
}

export function maskTelefone(v: string) {
  const s = v.replace(/\D/g, "").slice(0, 11);
  if (s.length <= 10) {
    return s.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  }
  return s.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

// Data dd/mm/aaaa
export function maskData(v: string) {
  const s = v.replace(/\D/g, "").slice(0, 8);
  return s
    .replace(/^(\d{2})(\d)/, "$1/$2")
    .replace(/^(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");
}

// Dia 1-31
export function maskDia(v: string) {
  const s = v.replace(/\D/g, "").slice(0, 2);
  if (!s) return "";
  const n = Math.min(31, Math.max(1, parseInt(s, 10) || 0));
  return String(n);
}

// Mês 1-12
export function maskMes(v: string) {
  const s = v.replace(/\D/g, "").slice(0, 2);
  if (!s) return "";
  const n = Math.min(12, Math.max(1, parseInt(s, 10) || 0));
  return String(n);
}

// Cidade — só letras, espaços, hífen e apóstrofo. Capitaliza.
export function maskCidade(v: string) {
  const s = v.replace(/[^A-Za-zÀ-ÿ\s'\-]/g, "").slice(0, 80);
  return s
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|\s|-|')([a-zà-ÿ])/g, (_, p, c) => p + c.toLocaleUpperCase("pt-BR"));
}

// Moeda BRL — entrada livre, formata como R$ 0,00
export function maskMoeda(v: string) {
  const s = v.replace(/\D/g, "");
  if (!s) return "";
  const num = parseInt(s, 10) / 100;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// "R$ 1.234,56" -> 1234.56. O campo guarda texto formatado, então quem for
// somar ou exportar precisa desfazer a máscara antes.
export function parseMoeda(v: string): number | null {
  const s = (v || "").replace(/\D/g, "");
  if (!s) return null;
  return parseInt(s, 10) / 100;
}

/**
 * Validação por tipo de campo. Devolve null quando está ok ou quando ainda
 * não dá para julgar (campo vazio) — obrigatoriedade é checada à parte.
 */
export function validarCampo(tipo: string, valor: any): string | null {
  const v = typeof valor === "string" ? valor.trim() : valor;
  if (v === undefined || v === null || v === "") return null;

  switch (tipo) {
    case "cpf":
      return validarCPF(v) ? null : "CPF inválido — confira os números.";
    case "cnpj":
      return validarCNPJ(v) ? null : "CNPJ inválido — confira os números.";
    case "placa":
      return validarPlaca(v) ? null : "Placa incompleta. Use ABC1234 ou ABC1D23.";
    case "telefone":
      return validarTelefone(v) ? null : "Telefone incompleto. Inclua o DDD.";
    case "cep":
      return validarCEP(v) ? null : "CEP incompleto.";
    case "hora":
      return validarHora(v) ? null : "Hora inválida. Use HH:MM.";
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : "E-mail inválido.";
    default:
      return null;
  }
}
