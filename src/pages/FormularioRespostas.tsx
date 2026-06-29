import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Download } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

export default function FormularioRespostas() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [respIdx, setRespIdx] = useState(0);

  const { data: form } = useQuery({
    queryKey: ["formulario", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formularios")
        .select("*, formulario_perguntas(*)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: respostas } = useQuery({
    queryKey: ["formulario_respostas", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formulario_respostas")
        .select("*")
        .eq("formulario_id", id!)
        .order("enviado_em", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const perguntas = useMemo(() => {
    const arr = form?.formulario_perguntas || [];
    return [...arr].sort((a: any, b: any) => a.ordem - b.ordem);
  }, [form]);

  const exportarXLSX = () => {
    if (!respostas || !perguntas) return;
    const linhas = respostas.map((r: any) => {
      const linha: Record<string, any> = {
        "Enviado em": new Date(r.enviado_em).toLocaleString("pt-BR"),
        IP: r.ip || "",
      };
      perguntas.forEach((p: any) => {
        const v = r.dados?.[p.id];
        linha[p.enunciado] = Array.isArray(v) ? v.join(", ") : v ?? "";
      });
      return linha;
    });
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Respostas");
    XLSX.writeFile(wb, `${form?.titulo || "respostas"}.xlsx`);
  };

  const resumo = useMemo(() => {
    if (!respostas || !perguntas) return [];
    return perguntas
      .filter((p: any) => ["radio", "checkbox", "dropdown"].includes(p.tipo))
      .map((p: any) => {
        const contagem: Record<string, number> = {};
        (p.opcoes || []).forEach((o: string) => (contagem[o] = 0));
        respostas.forEach((r: any) => {
          const v = r.dados?.[p.id];
          if (Array.isArray(v)) v.forEach((x) => (contagem[x] = (contagem[x] || 0) + 1));
          else if (v) contagem[v] = (contagem[v] || 0) + 1;
        });
        return {
          pergunta: p.enunciado,
          dados: Object.entries(contagem).map(([name, value]) => ({ name, value })),
        };
      });
  }, [respostas, perguntas]);

  const total = respostas?.length || 0;
  const resp = respostas?.[respIdx];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/formularios")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{form?.titulo}</h1>
          <p className="text-sm text-muted-foreground">{total} respostas</p>
        </div>
        <Button size="sm" variant="outline" onClick={exportarXLSX} disabled={total === 0}>
          <Download className="h-4 w-4 mr-1" /> Exportar XLSX
        </Button>
      </div>

      <Tabs defaultValue="resumo">
        <TabsList>
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="individual">Individual</TabsTrigger>
          <TabsTrigger value="tabela">Tabela</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo" className="space-y-4">
          {total === 0 && (
            <Card className="rounded-2xl bg-muted/40">
              <CardContent className="p-8 text-center text-muted-foreground">
                Nenhuma resposta ainda
              </CardContent>
            </Card>
          )}
          {resumo.map((r, i) => (
            <Card key={i} className="rounded-2xl bg-muted/40 backdrop-blur">
              <CardContent className="p-5 space-y-3">
                <h3 className="font-medium">{r.pergunta}</h3>
                <ResponsiveContainer width="100%" height={Math.max(120, r.dados.length * 40)}>
                  <BarChart data={r.dados} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#362C89" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="individual">
          {total === 0 ? (
            <p className="text-muted-foreground">Nenhuma resposta ainda</p>
          ) : (
            <Card className="rounded-2xl bg-muted/40">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {respIdx + 1} de {total} ·{" "}
                    {resp && new Date(resp.enviado_em).toLocaleString("pt-BR")}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRespIdx((i) => Math.max(0, i - 1))}
                      disabled={respIdx === 0}
                    >
                      Anterior
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRespIdx((i) => Math.min(total - 1, i + 1))}
                      disabled={respIdx >= total - 1}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
                {perguntas.map((p: any) => {
                  const v = resp?.dados?.[p.id];
                  return (
                    <div key={p.id} className="space-y-1 border-b pb-3 last:border-0">
                      <p className="text-xs font-medium text-muted-foreground uppercase">
                        {p.enunciado}
                      </p>
                      <p className="text-sm">
                        {Array.isArray(v) ? v.join(", ") : v || "—"}
                      </p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="tabela">
          <Card className="rounded-2xl bg-muted/40 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Enviado em</TableHead>
                  {perguntas.map((p: any) => (
                    <TableHead key={p.id} className="whitespace-nowrap">
                      {p.enunciado}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(respostas || []).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(r.enviado_em).toLocaleString("pt-BR")}
                    </TableCell>
                    {perguntas.map((p: any) => {
                      const v = r.dados?.[p.id];
                      return (
                        <TableCell key={p.id} className="text-xs">
                          {Array.isArray(v) ? v.join(", ") : v ?? ""}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}