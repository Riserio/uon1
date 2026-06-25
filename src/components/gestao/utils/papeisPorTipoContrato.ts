// Mapeia o tipo / título do template de contrato para o papel sugerido do signatário principal.
// Caso nenhum padrão case, retorna "Contratante" por padrão.

const MAPA: Array<{ regex: RegExp; papel: string }> = [
  { regex: /loca[cç][aã]o|aluguel/i, papel: "Locatário" },
  { regex: /franqu/i, papel: "Franqueado" },
  { regex: /compra\s*e?\s*venda|comprador/i, papel: "Comprador" },
  { regex: /servi[cç]os?/i, papel: "Tomador de Serviços" },
  { regex: /presta[cç][aã]o/i, papel: "Tomador de Serviços" },
  { regex: /fornecimento|fornecedor/i, papel: "Cliente" },
  { regex: /memorial.*entendimento|mde|cotista|soci[ea]/i, papel: "Cotista" },
  { regex: /a[cç]ionista/i, papel: "Acionista" },
  { regex: /gestora|gest[aã]o/i, papel: "Gestora" },
  { regex: /fian[cç]a|fiador/i, papel: "Fiador" },
  { regex: /cess[aã]o|cessionari/i, papel: "Cessionário" },
];

export function sugerirPapelContratante(template?: { titulo?: string | null; tipo?: string | null } | null): string {
  if (!template) return "Contratante";
  const txt = `${template.titulo || ""} ${template.tipo || ""}`;
  for (const { regex, papel } of MAPA) {
    if (regex.test(txt)) return papel;
  }
  return "Contratante";
}