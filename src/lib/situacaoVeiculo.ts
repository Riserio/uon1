// Classificação padronizada da situação do veículo na base (Estudo de Base /
// Indicadores). A Hinova passou a devolver `codigo_situacao` + descrição:
// 1=ATIVO, 2=INATIVO, 3=PENDENTE, 4=INADIMPLENTE, 5=NEGADO, 6=CANCELAMENTO,
// 7=REVISTORIA, 8=REATIVAÇÃO. Classificamos pela descrição (`situacao_veiculo`)
// para funcionar também com bases legadas.
//
// Regra do total "Placas Ativas" (deve bater 4909 em Indicadores e Estudo de
// Base): considera ATIVAS as placas em situação ATIVO/REATIVAÇÃO e também as
// legadas sem situação preenchida (null/vazio). Demais situações (inadimplente,
// inativo, pendente, cancelado, negado, etc.) NÃO entram no total de ativas —
// aparecem separadamente no gráfico "Placas por Situação" e no card
// "Inadimplentes".

export type SituacaoBucket = "ativo" | "inadimplente" | "outro";

function normalizar(situacao?: string | null): string {
  return (situacao || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function isInadimplente(situacao?: string | null): boolean {
  return /INADIMPL/.test(normalizar(situacao));
}

export function isAtivo(situacao?: string | null): boolean {
  const s = normalizar(situacao);
  if (!s) return true; // legado sem situação = ativo
  if (/INADIMPL/.test(s)) return false;
  // ATIVO e REATIVACAO contam como ativo; INATIVO e demais, não
  if (/INATIV|CANCEL|EXCLU|SUSPEN|BAIXAD|DESLIG|NEGAD|PENDENT|REVISTORIA/.test(s)) return false;
  return /ATIVO|REATIV/.test(s);
}

export function classificarSituacao(situacao?: string | null): SituacaoBucket {
  if (isInadimplente(situacao)) return "inadimplente";
  if (isAtivo(situacao)) return "ativo";
  return "outro";
}
