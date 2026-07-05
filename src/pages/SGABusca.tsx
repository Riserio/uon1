import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, Loader2, Building2, User, Car, ExternalLink, Receipt, DollarSign, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

type Tipo = "placa" | "cpf" | "nome";

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

function Section({ title, icon, children, defaultOpen = false }: any) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                {icon}
                <CardTitle className="text-sm">{title}</CardTitle>
              </div>
              <span className="text-xs text-muted-foreground">
                {open ? "ocultar" : "abrir"}
              </span>
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

function AssociationHeader({ d }: { d: Resultado }) {
  return (
    <Card className="border-primary/20">
      <CardHeader className="bg-muted/30">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Associação</p>
              <p className="text-xl font-bold text-primary">{d.associacao}</p>
              <p className="text-xs text-muted-foreground">
                {d.associado?.nome || "—"} • {d.veiculo?.placa || "—"}
              </p>
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

function StatusGrid({ d }: { d: Resultado }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card>
        <CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Status Associado</p>
          <p className="font-semibold"><StatusPill s={d.associado?.situacao} /></p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Status Veículo</p>
          <p className="font-semibold"><StatusPill s={d.veiculo?.situacao} /></p>
        </CardContent>
      </Card>
    </div>
  );
}

function KeyValueTable({ title, data, icon }: any) {
  return (
    <Card>
      <CardHeader className="py-2 flex flex-row items-center gap-2">{icon}<CardTitle className="text-sm">{title}</CardTitle></CardHeader>
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

function List({ rows, cols }: any) {
  const safe = safeArr(rows);
  return (
    <div className="space-y-2">
      {safe.length ? safe.map((r: any, i: number) => (
        <div key={i} className="border rounded p-2 text-xs">
          {cols.map((c: any) => (
            <div key={c.h} className="flex justify-between">
              <span className="text-muted-foreground">{c.h}</span>
              <span>{c.r(r)}</span>
            </div>
          ))}
        </div>
      )) : <p className="text-xs text-muted-foreground">Sem registros</p>}
    </div>
  );
}

export default function SGABusca() {
  const [tipo, setTipo] = useState<Tipo>("placa");
  const [termo, setTermo] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

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

  return (
    <div className="p-4 space-y-6">
      <PageHeader icon={Search} title="SGA" subtitle="Consulta de associados" />

      <Card>
        <CardContent className="p-4 flex gap-2">
          {"placa cpf nome".split(" ").map((t: any) => (
            <Button key={t} variant={tipo === t ? "default" : "outline"} onClick={() => setTipo(t)}>{t}</Button>
          ))}
          <Input value={termo} onChange={(e) => setTermo(e.target.value)} />
          <Button onClick={buscar} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : "Buscar"}
          </Button>
        </CardContent>
      </Card>

      {resultados.map((d: any, i: number) => (
        <div key={i} className="space-y-4">
          <AssociationHeader d={d} />
          <StatusGrid d={d} />

          <div className="grid md:grid-cols-2 gap-3">
            <KeyValueTable title="Associado" icon={<User />} data={d.associado} />
            <KeyValueTable title="Veículo" icon={<Car />} data={d.veiculo} />
          </div>

          <Section title="Boletos / Cobrança" icon={<Receipt />}>
            <List
              rows={d.boletos}
              cols={[
                { h: "Valor", r: (b: any) => fmtMoeda(b.valor) },
                { h: "Situação", r: (b: any) => <StatusPill s={b.situacao} /> }
              ]}
            />
          </Section>

          <Section title="Eventos / Vistorias (SGA)" icon={<ShieldAlert />}>
            <List
              rows={d.eventos}
              cols={[
                { h: "Tipo", r: (e: any) => e.tipo },
                { h: "Situação", r: (e: any) => <StatusPill s={e.situacao} /> }
              ]}
            />
          </Section>

          <Section title="Lançamentos Financeiros (MGF)" icon={<DollarSign />}>
            <List
              rows={d.mgf}
              cols={[
                { h: "Valor", r: (m: any) => fmtMoeda(m.valor) },
                { h: "Situação", r: (m: any) => <StatusPill s={m.situacao} /> }
              ]}
            />
          </Section>
        </div>
      ))}
    </div>
  );
}
