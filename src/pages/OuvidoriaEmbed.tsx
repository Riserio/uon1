import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart3, FileText, Shield } from "lucide-react";

const TIPO_LABELS: Record<string, string> = {
  reclamacao: "Reclamação",
  sugestao: "Sugestão",
  elogio: "Elogio",
  denuncia: "Denúncia",
};

const STATUS_COLORS: Record<string, string> = {
  "Recebimento": "bg-blue-100 text-blue-800",
  "Levantamento": "bg-yellow-100 text-yellow-800",
  "Acionamento Setor": "bg-orange-100 text-orange-800",
  "Contato Associado": "bg-purple-100 text-purple-800",
  "Monitoramento": "bg-cyan-100 text-cyan-800",
  "Resolvido": "bg-green-100 text-green-800",
  "Sem Resolução": "bg-red-100 text-red-800",
};

export default function OuvidoriaEmbed() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [registros, setRegistros] = useState<any[]>([]);
  const [corretoraNome, setCorretoraNome] = useState("");

  useEffect(() => {
    validateAndLoad();
  }, [slug, token]);

  const validateAndLoad = async () => {
    if (!slug || !token) {
      setLoading(false);
      return;
    }

    // Validate token
    const { data: config } = await supabase
      .from("ouvidoria_config")
      .select("*, corretoras(nome)")
      .eq("corretora_id", slug)
      .eq("embed_token", token)
      .maybeSingle();

    if (!config) {
      setLoading(false);
      return;
    }

    setAuthorized(true);
    setCorretoraNome((config as any).corretoras?.nome || "");

    // Load registros (read-only)
    const { data } = await supabase
      .from("ouvidoria_registros")
      .select("protocolo, nome, tipo, status, created_at, placa_veiculo")
      .eq("corretora_id", slug)
      .order("created_at", { ascending: false })
      .limit(100);

    setRegistros(data || []);
    setLoading(false);
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!authorized) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Shield className="h-12 w-12 mx-auto mb-2 text-destructive" />
        <p>Acesso não autorizado.</p>
      </div>
    );
  }

  // Stats
  const totalPorTipo = Object.keys(TIPO_LABELS).map((t) => ({
    tipo: TIPO_LABELS[t],
    count: registros.filter((r) => r.tipo === t).length,
  }));

  const totalPorStatus = Object.keys(STATUS_COLORS).map((s) => ({
    status: s,
    count: registros.filter((r) => r.status === s).length,
  }));

  const resolvidos = registros.filter((r) => r.status === "Resolvido").length;
  const taxaResolucao = registros.length > 0 ? ((resolvidos / registros.length) * 100).toFixed(1) : "0";

  return (
    <div className="p-4 space-y-4 bg-background text-foreground">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Ouvidoria - {corretoraNome}</h2>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{registros.length}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{resolvidos}</p>
            <p className="text-xs text-muted-foreground">Resolvidos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{taxaResolucao}%</p>
            <p className="text-xs text-muted-foreground">Taxa Resolução</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">
              {registros.filter((r) => !["Resolvido", "Sem Resolução"].includes(r.status)).length}
            </p>
            <p className="text-xs text-muted-foreground">Em andamento</p>
          </CardContent>
        </Card>
      </div>

      {/* Por status */}
      <div className="flex flex-wrap gap-2">
        {totalPorStatus.filter((s) => s.count > 0).map((s) => (
          <Badge key={s.status} className={STATUS_COLORS[s.status]}>
            {s.status}: {s.count}
          </Badge>
        ))}
      </div>

      {/* Tabela resumida */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Protocolo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {registros.slice(0, 50).map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-mono text-sm">{r.protocolo}</TableCell>
                <TableCell><Badge variant="outline">{TIPO_LABELS[r.tipo]}</Badge></TableCell>
                <TableCell><Badge className={STATUS_COLORS[r.status]}>{r.status}</Badge></TableCell>
                <TableCell>{format(new Date(r.created_at), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
