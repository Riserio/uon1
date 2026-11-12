/** Baixa um CSV que o Excel (pt-BR) abre direto: separador ";" e BOM UTF-8. */
export function baixarCsv(nomeArquivo: string, linhas: Record<string, unknown>[]) {
  if (linhas.length === 0) return;
  const colunas = Object.keys(linhas[0]);
  const celula = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const t = typeof v === "number" ? v.toLocaleString("pt-BR") : String(v);
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const corpo = [colunas.join(";"), ...linhas.map((l) => colunas.map((c) => celula(l[c])).join(";"))].join("\r\n");
  const blob = new Blob(["﻿" + corpo], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
