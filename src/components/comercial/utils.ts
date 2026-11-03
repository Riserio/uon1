export { slugify } from "@/components/linkbio/utils";

/** Endereço da página pública de cadastro. Sem vendedor, o lead entra sem atribuição. */
export const linkCaptura = (funilSlug: string, vendedorCodigo?: string | null) =>
  `${window.location.origin}/c/${funilSlug}${vendedorCodigo ? `/${vendedorCodigo}` : ""}`;

export const somenteDigitos = (s: string | null | undefined) => (s || "").replace(/\D/g, "");

/** (31) 99999-8888 — aceita com ou sem 55 na frente. */
export function formatarWhatsapp(s: string | null | undefined) {
  let d = somenteDigitos(s);
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || "";
}

export function linkWhatsapp(s: string | null | undefined) {
  const d = somenteDigitos(s);
  if (d.length < 10) return null;
  return `https://wa.me/${d.startsWith("55") && d.length > 11 ? d : `55${d}`}`;
}
