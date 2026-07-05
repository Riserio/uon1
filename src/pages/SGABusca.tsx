import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, Loader2, Building2, User, Car, IdCard, CircleAlert, ExternalLink, Receipt, DollarSign, ShieldAlert, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

type Tipo = "placa" | "cpf" | "nome";
type EventoFiltro = "andamento" | "todos";

interface Resultado {
  associacao: string;
  sga_url: string | null;
  veiculo: Record<string, any> | null;
  associado: Record<string, any> | null;
  boletos: any[];
  eventos: any[];
  mgf: any[];
}

const fmtMoeda = (v: any) => v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (v: any) => { if (!v) return "—"; const d = new Date(String(v).length <= 10 ? String(v)+"T00:00:00" : v); return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("pt-BR"); };

const safeArr = (v: any) => Array.isArray(v) ? v : [];

function StatusPill({ s }: { s: any }) {
  const t = String(s || "").toUpperCase();
  const ok = /ATIVO|PAGO|CONCLU|FINALIZ/.test(t);
  const bad = /INAD|CANCEL|VENC|NEGAD/.test(t);
  const cls = ok ? "bg-emerald-500/10 text-emerald-600" : bad ? "bg-red-500/10 text-red-600" : "bg-muted text-muted-foreground";
  return <span className={`px-2 py-0.5 rounded-full text-[10px] ${cls}`}>{s || "—"}</span>;
}

function AssociationHeader({ d }: { d: Resultado }) {
  return (
    <Card>
      <CardHeader className="bg-muted/30">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Associação</p>
              <p className="text-lg font-semibold">{d.associacao}</p>
              <p className="text-sm text-muted-foreground">{d.veiculo?.placa || d.associado?.nome}</p>
            </div>
          </div>
          {d.sga_url && (
            <a href={d.sga_url} target="_blank" className="text-xs text-primary flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> SGA
            </a>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}

function SummaryCards({ d }: { d: Resultado }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Associado</p><p className="font-semibold">{d.associado?.nome || "—"}</p></CardContent></Card>
      <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Veículo</p><p className="font-semibold">{d.veiculo?.modelo || "—"}</p></CardContent></Card>
      <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Boletos</p><p className="font-semibold">{safeArr(d.boletos).length}</p></CardContent></Card>
      <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Eventos</p><p className="font-semibold">{safeArr(d.eventos).length}</p></CardContent></Card>
    </div>
  );
}

function KeyValueTable({ titulo, data, icon }: any) {
  return (
    <Card>
      <CardHeader className="py-2 flex flex-row items-center gap-2">{icon}<CardTitle className="text-sm">{titulo}</CardTitle></CardHeader>
      <CardContent className="text-sm space-y-1">
        {Object.entries(data || {}).map(([k, v]: any) => (
          <div key={k} className="flex justify-between border-b py-1">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-medium">{v || "—"}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ListTable({ titulo, rows, cols }: any) {
  const safeRows = safeArr(rows);
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{titulo}</CardTitle></CardHeader>
      <CardContent>
        {safeRows.length ? safeRows.map((r: any, i: number) => (
          <div key={i} className="text-xs border rounded p-2 mb-2">
            {cols.map((c: any) => (
              <div key={c.h} className="flex justify-between">
                <span className="text-muted-foreground">{c.h}</span>
                <span>{c.r(r)}</span>
              </div>
            ))}
          </div>
        )) : <p className="text-xs text-muted-foreground">Sem registros</p>}
      </CardContent>
    </Card>
  );
}

function CollapsibleSection({ title, children }: any) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left">
            <CardHeader>
              <CardTitle className="text-sm flex justify-between">
                {title}
                <span className="text-xs text-muted-foreground">
                  {open ? "ocultar" : "mostrar"}
                </span>
              </CardTitle>
            </CardHeader>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function SGABusca() {
  const [tipo, setTipo] = useState<Tipo>("placa");
  const [termo, setTermo] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [filtroEventos, setFiltroEventos] = useState<EventoFiltro>("andamento");

  const buscar = async () => {
    const t = termo.trim();
    if (t.length < 3) return toast.info("Digite ao menos 3 caracteres");

    setLoading(true);
    try {
      const { data } = await supabase.rpc("consultar_hinova", {
        p_placa: tipo === "placa" ? t : null,
        p_cpf: tipo === "cpf" ? t.replace(/\D/g, "") : null,
        p_nome: tipo === "nome" ? t : null,
      });

      setResult(data || { resultados: [] });
    } catch (e) {
      toast.error("Erro na busca");
      setResult({ resultados: [] });
    } finally {
      setLoading(false);
    }
  };

  const resultados = safeArr(result?.resultados);

  const filtrarEventos = (eventos: any[]) => {
    const base = safeArr(eventos);

    if (filtroEventos === "todos") return base;

    // andamento = remove finais/encerrados
    return base.filter((e: any) => {
      const t = String(e?.situacao || "").toUpperCase();
      return !/FINAL|CONCL|ENCERR|CANCEL/.test(t);
    });
  };

  return (
    <div className="p-4 space-y-6">
      <PageHeader icon={Search} title="SGA" subtitle="Consulta de associados" />

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2">
            {"placa cpf nome".split(" ").map((t: any) => (
              <Button key={t} variant={tipo === t ? "default" : "outline"} onClick={() => setTipo(t)}>{t}</Button>
            ))}
          </div>

          <div className="flex gap-2">
            <Input value={termo} onChange={(e) => setTermo(e.target.value)} />
            <Button onClick={buscar} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : "Buscar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && <p>Carregando...</p>}

      {resultados.map((d: any, i: number) => (
        <div key={i} className="space-y-4">
          <AssociationHeader d={d} />
          <SummaryCards d={d} />

          <div className="flex gap-2 items-center">
            <p className="text-sm font-medium">Eventos:</p>
            <Button size="sm" variant={filtroEventos === "andamento" ? "default" : "outline"} onClick={() => setFiltroEventos("andamento")}>Em andamento</Button>
            <Button size="sm" variant={filtroEventos === "todos" ? "default" : "outline"} onClick={() => setFiltroEventos("todos")}>Todos</Button>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <KeyValueTable titulo="Associado" icon={<User />} data={d.associado} />
            <KeyValueTable titulo="Veículo" icon={<Car />} data={d.veiculo} />
          </div>

          <CollapsibleSection title="Boletos / Cobrança">
            <ListTable
              titulo="Boletos"
              rows={d.boletos}
              cols={[
                { h: "Valor", r: (b: any) => fmtMoeda(b.valor) },
                { h: "Situação", r: (b: any) => <StatusPill s={b.situacao} /> }
              ]}
            />
          </CollapsibleSection>

          <ListTable
            titulo="Eventos"
            rows={filtrarEventos(d.eventos)}
            cols={[
              { h: "Tipo", r: (e: any) => e.tipo },
              { h: "Situação", r: (e: any) => <StatusPill s={e.situacao} /> }
            ]}
          />
        </div>
      ))}
    </div>
  );
}
