import { format } from "date-fns";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { baixarCsv } from "./csv";
import type { ComercialCotacao, ComercialLead, ComercialNivel, ComercialVendedor } from "./types";

interface Props {
  nivel: ComercialNivel;
  leads: ComercialLead[];
  cotacoes: ComercialCotacao[];
  vendedores: ComercialVendedor[];
  nomes: Map<string, string>;
  ganhoIds: Set<string>;
  perdidoIds: Set<string>;
  podeExportar: boolean;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Painel por vendedor (Líder: equipe; Gerente: por Líder e vendedor; Admin: por
 * Gerente, Líder e vendedor). Usa só o que o banco já devolveu (mesmo filtro das
 * listagens). Líder/Gerente vêm da cadeia gravada no registro — cotação emitida
 * conta para a equipe de origem.
 */
export function EquipePainel({ nivel, leads, cotacoes, vendedores, nomes, ganhoIds, perdidoIds, podeExportar }: Props) {
  const nomeVendedor = new Map(vendedores.map((v) => [v.id, v.nome]));
  type Linha = { chave: string; vendedor: string; lider: string; gerente: string; leads: number; ganhos: number; perdidos: number; emitidas: number; valor: number };
  const linhas = new Map<string, Linha>();
  const linha = (vendedorId: string | null, liderId: string | null | undefined, gerenteId: string | null | undefined) => {
    const chave = `${vendedorId ?? "-"}|${liderId ?? "-"}|${gerenteId ?? "-"}`;
    let l = linhas.get(chave);
    if (!l) {
      l = {
        chave,
        vendedor: (vendedorId && nomeVendedor.get(vendedorId)) || "Sem vendedor",
        lider: (liderId && nomes.get(liderId)) || "—",
        gerente: (gerenteId && nomes.get(gerenteId)) || "—",
        leads: 0,
        ganhos: 0,
        perdidos: 0,
        emitidas: 0,
        valor: 0,
      };
      linhas.set(chave, l);
    }
    return l;
  };
  for (const ld of leads) {
    const l = linha(ld.vendedor_id, ld.lider_id, ld.gerente_id);
    l.leads++;
    if (ganhoIds.has(ld.etapa_id)) l.ganhos++;
    if (perdidoIds.has(ld.etapa_id)) l.perdidos++;
  }
  for (const c of cotacoes) {
    if (c.status !== "emitida") continue;
    const l = linha(c.vendedor_id, c.lider_id, c.gerente_id);
    l.emitidas++;
    l.valor += Number(c.valor || 0);
  }
  const ordenadas = [...linhas.values()].sort(
    (a, b) => a.gerente.localeCompare(b.gerente) || a.lider.localeCompare(b.lider) || a.vendedor.localeCompare(b.vendedor),
  );
  const conv = (l: Linha) => (l.ganhos + l.perdidos > 0 ? (l.ganhos / (l.ganhos + l.perdidos)) * 100 : null);
  const verLider = nivel === "gerente" || nivel === "admin";
  const verGerente = nivel === "admin";
  const total = ordenadas.reduce(
    (t, l) => ({ leads: t.leads + l.leads, ganhos: t.ganhos + l.ganhos, perdidos: t.perdidos + l.perdidos, emitidas: t.emitidas + l.emitidas, valor: t.valor + l.valor }),
    { leads: 0, ganhos: 0, perdidos: 0, emitidas: 0, valor: 0 },
  );

  const exportar = () =>
    baixarCsv(
      `painel-equipe-${format(new Date(), "yyyy-MM-dd")}.csv`,
      ordenadas.map((l) => ({
        ...(verGerente ? { Gerente: l.gerente } : {}),
        ...(verLider ? { Lider: l.lider } : {}),
        Vendedor: l.vendedor,
        Leads: l.leads,
        Fechados: l.ganhos,
        Cancelados: l.perdidos,
        "Conversao %": conv(l) === null ? "" : Number(conv(l)!.toFixed(1)),
        "Cotacoes emitidas": l.emitidas,
        "Valor emitido": Number(l.valor.toFixed(2)),
      })),
    );

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Conversão = fechados ÷ (fechados + cancelados). Valor = soma das cotações emitidas.
        </p>
        {podeExportar && (
          <Button variant="outline" onClick={exportar} disabled={ordenadas.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
        )}
      </div>
      <Card className="rounded-2xl">
        <Table>
          <TableHeader>
            <TableRow>
              {verGerente && <TableHead>Gerente</TableHead>}
              {verLider && <TableHead>Líder</TableHead>}
              <TableHead>Vendedor</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">Cotações emitidas</TableHead>
              <TableHead className="text-right">Conversão</TableHead>
              <TableHead className="text-right">Valor emitido</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordenadas.map((l) => (
              <TableRow key={l.chave}>
                {verGerente && <TableCell>{l.gerente}</TableCell>}
                {verLider && <TableCell>{l.lider}</TableCell>}
                <TableCell className="font-medium">{l.vendedor}</TableCell>
                <TableCell className="text-right tabular-nums">{l.leads}</TableCell>
                <TableCell className="text-right tabular-nums">{l.emitidas}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {conv(l) === null ? "—" : `${conv(l)!.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
                </TableCell>
                <TableCell className="text-right tabular-nums">{brl(l.valor)}</TableCell>
              </TableRow>
            ))}
            {ordenadas.length > 1 && (
              <TableRow className="font-semibold">
                {verGerente && <TableCell />}
                {verLider && <TableCell />}
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{total.leads}</TableCell>
                <TableCell className="text-right tabular-nums">{total.emitidas}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {total.ganhos + total.perdidos > 0
                    ? `${((total.ganhos / (total.ganhos + total.perdidos)) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
                    : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{brl(total.valor)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
