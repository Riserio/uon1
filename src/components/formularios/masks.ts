export function maskPlaca(v: string) {
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  if (s.length <= 3) return s;
  return `${s.slice(0, 3)}-${s.slice(3)}`;
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