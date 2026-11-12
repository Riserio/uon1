import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { baixarCsv } from "./csv";
import { STATUS_COTACAO, type ComercialCotacao, type ComercialVendedor, type CotacaoStatus } from "./types";

const TODOS = "__todos__";
export type CotacaoComLead = ComercialCotacao & { lead: { nome: string; funil_id: string } | null };

interface Props {
  cotacoes: CotacaoComLead[];
  vendedores: ComercialVendedor[];
  nomes: Map<string, string>;
  mostrarResponsavel: boolean;
  podeExportar: boolean;
  onAbrir: (c: CotacaoComLead) => void;
}

const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CotacoesTab({ cotacoes, vendedores, nomes, mostrarResponsavel, podeExportar, onAbrir }: Props) {
  const [status, setStatus] = useState<string>(TODOS);
  const nomeVendedor = new Map(vendedores.map((v) => [v.id, v.nome]));
  const lista = useMemo(
    () => cotacoes.filter((c) => status === TODOS || c.status === status),
    [cotacoes, status],
  );
  const pendentes = cotacoes.filter((c) => c.status === "cancelamento_solicitado").length;

  const exportar = () =>
    baixarCsv(
      `cotacoes-${format(new Date(), "yyyy-MM-dd")}.csv`,
      lista.map((c) => ({
        Numero: c.numero,
        Lead: c.lead?.nome ?? "",
        Produto: c.produto ?? "",
        Valor: Number(c.valor),
        Status: STATUS_COTACAO[c.status].label,
        Vendedor: (c.vendedor_id && nomeVendedor.get(c.vendedor_id)) || "",
        Lider: (c.lider_id && nomes.get(c.lider_id)) || "",
        Gerente: (c.gerente_id && nomes.get(c.gerente_id)) || "",
        "Criada em": format(new Date(c.created_at), "dd/MM/yyyy"),
        "Emitida em": c.emitida_em ? format(new Date(c.emitida_em), "dd/MM/yyyy") : "",
        "Motivo cancelamento": c.motivo_cancelamento ?? "",
      })),
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[230px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os status</SelectItem>
              {(Object.keys(STATUS_COTACAO) as CotacaoStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_COTACAO[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pendentes > 0 && (
            <button
              type="button"
              onClick={() => setStatus("cancelamento_solicitado")}
              className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700"
            >
              {pendentes} pedido(s) de cancelamento
            </button>
          )}
        </div>
        {podeExportar && (
          <Button variant="outline" onClick={exportar} disabled={lista.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
        )}
      </div>

      {lista.length === 0 ? (
        <Card className="rounded-2xl bg-muted/40">
          <CardContent className="py-14 text-center space-y-2">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground">Nenhuma cotação. Crie pelo lead, no funil.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Produto</TableHead>
                {mostrarResponsavel && <TableHead>Responsável</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Criada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => onAbrir(c)}>
                  <TableCell className="tabular-nums">{c.numero}</TableCell>
                  <TableCell className="font-medium">{c.lead?.nome ?? "—"}</TableCell>
                  <TableCell>{c.produto ?? "—"}</TableCell>
                  {mostrarResponsavel && (
                    <TableCell>{(c.vendedor_id && nomeVendedor.get(c.vendedor_id)) || "Sem vendedor"}</TableCell>
                  )}
                  <TableCell>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COTACAO[c.status].classe}`}>
                      {STATUS_COTACAO[c.status].label}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{brl(c.valor)}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {format(new Date(c.created_at), "dd/MM/yy", { locale: ptBR })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
