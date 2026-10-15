import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Linha = { tipo: string; descricao: string | null; grupo: string; ordem: number };
const GRUPOS = [
  { id: "mensalidade", label: "Mensalidade" },
  { id: "cobranca", label: "Cobrança" },
  { id: "taxa", label: "Taxa" },
  { id: "evento", label: "Evento" },
  { id: "outros", label: "Outros" },
];

/** Admin: editar descrição/grupo da legenda de tipos de boleto (cobranca_tipos_boleto). */
export default function TiposBoletoLegendaAdmin() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["cobranca_tipos_boleto"],
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Linha[]> => {
      const { data, error } = await supabase
        .from("cobranca_tipos_boleto")
        .select("tipo, descricao, grupo, ordem")
        .order("ordem");
      if (error) throw error;
      return (data as Linha[]) || [];
    },
  });
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [novo, setNovo] = useState("");
  useEffect(() => setLinhas(data), [data]);

  const salvar = async (l: Linha) => {
    const { error } = await supabase
      .from("cobranca_tipos_boleto")
      .upsert({ ...l, tipo: l.tipo.trim().toUpperCase(), updated_at: new Date().toISOString() });
    if (error) return toast.error("Não foi possível salvar (apenas administradores podem editar).");
    toast.success(`Tipo ${l.tipo} salvo.`);
    qc.invalidateQueries({ queryKey: ["cobranca_tipos_boleto"] });
    qc.invalidateQueries({ queryKey: ["listar_tipos_boleto"] });
  };

  const upd = (i: number, patch: Partial<Linha>) =>
    setLinhas((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tipos de boleto</CardTitle>
        <CardDescription>
          Legenda "O que é cada tipo" mostrada nos filtros de cobrança. O grupo organiza a lista (mensalidade,
          cobrança, taxa, evento, outros).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {linhas.map((l, i) => (
          <div key={l.tipo} className="grid grid-cols-1 gap-2 rounded-xl border p-2 md:grid-cols-[180px_1fr_150px_80px_auto] md:items-center">
            <span className="text-sm font-semibold">{l.tipo}</span>
            <Input value={l.descricao || ""} onChange={(e) => upd(i, { descricao: e.target.value })} placeholder="Descrição" />
            <Select value={l.grupo} onValueChange={(v) => upd(i, { grupo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="z-[100001]">
                {GRUPOS.map((g) => <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="number" value={l.ordem} onChange={(e) => upd(i, { ordem: Number(e.target.value) || 0 })} />
            <Button size="sm" onClick={() => salvar(l)}>Salvar</Button>
          </div>
        ))}
        <div className="flex gap-2 pt-2">
          <Input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Novo tipo (como vem da Hinova)" />
          <Button
            variant="outline"
            disabled={!novo.trim()}
            onClick={() => {
              salvar({ tipo: novo, descricao: null, grupo: "outros", ordem: 100 });
              setNovo("");
            }}
          >
            Adicionar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
