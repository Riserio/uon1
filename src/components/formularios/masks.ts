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