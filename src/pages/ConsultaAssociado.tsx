import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, ExternalLink, Car, User, Receipt, DollarSign, ShieldAlert, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

const fmtMoeda = (v: any) =>
  v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (v: any) => {
  if (!v) return "—";
  const d = new Date(String(v).length <= 10 ? String(v) + "T00:00:00" : v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("pt-BR");
};
const val = (v: any) => (v == null || v === "" ? "—" : String(v));

interface Resultado {
  associacao: string; sga_url: string | null;
  veiculo: Record<string, any> | null; associado: Record<string, any> | null;
  boletos: any[]; eventos: any[]; mgf: any[];
}
interface ApiStatus {
  associacao: string;
  cobranca: { status: string | null; erro: string | null; origem: string | null };
  eventos: { status: string | null; erro: string | null; origem: string | null };
  mgf: { status: string | null; erro: string | null; origem: string | null };
}

export default function ConsultaAssociado() {
  const [placa, setPlaca] = useState("");
  const [cpf, setCpf] = useState("");
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ total: number; resultados: Resultado[]; apis_ativas: ApiStatus[] } | null>(null);

  const buscar = async () => {
    if (!placa && !cpf && !nome) { toast.error("Informe placa, CPF ou nome"); return; }
    setLoading(true); setResult(null);
    try {
      const { data, error } = await supabase.rpc("consultar_hinova", {
        p_placa: placa || null, p_cpf: cpf || null, p_nome: nome || null,
      });
      if (error) throw error;
      const r = data as any;
      if (r?.success === false) throw new Error(r.message || "Falha na consulta");
      setResult(r);
      if ((r?.total ?? 0) === 0) toast.info("Nenhum resultado encontrado");
    } catch (e: any) {
      toast.error(e?.message || "Erro na consulta");
    } finally { setLoading(false); }
  };

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Consulta de Associado / Veículo</h1>
        <p className="text-sm text-muted-foreground">
          Busca em todas as associações com API Hinova ativa (dados atualizados diariamente). Busque por placa, CPF ou nome.
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="pt-6 grid gap-3 sm:grid-cols-4">
          <Input placeholder="Placa (ex: ABC1D23)" value={placa} onChange={(e) => setPlaca(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} className="rounded-xl" />
          <Input placeholder="CPF (só números)" value={cpf} onChange={(e) => setCpf(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} className="rounded-xl" />
          <Input placeholder="Nome do associado" value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} className="rounded-xl" />
          <Button onClick={buscar} disabled={loading} className="gap-2 rounded-xl">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar
          </Button>
        </CardContent>
      </Card>

      {result && (
        <div className="space-y-5">
          <ApiStatusPanel apis={result.apis_ativas} />
          <p className="text-sm text-muted-foreground">
            {result.total} resultado{result.total !== 1 ? "s" : ""} encontrado{result.total !== 1 ? "s" : ""}.
          </p>
          {result.resultados.map((d, i) => (
            <Card key={i} className="rounded-2xl overflow-hidden">
              <CardHeader className="pb-3 bg-muted/30">
                <CardTitle className="flex items-center justify-between text-base flex-wrap gap-2">
                  <span className="flex items-center gap-2">
                    <Car className="h-4 w-4 text-primary" />
                    {d.veiculo?.placa || d.associado?.nome || "Resultado"}
                    <Badge variant="secondary">{d.associacao}</Badge>
                  </span>
                  {d.sga_url && (
                    <a href={d.sga_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                      <ExternalLink className="h-3.5 w-3.5" /> Abrir no SGA
                    </a>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  {d.veiculo && (
                    <KeyValueTable titulo="Veículo" icon={<Car className="h-4 w-4" />} data={{
                      "Placa": d.veiculo.placa, "Tipo": d.veiculo.tipo, "Categoria": d.veiculo.categoria,
                      "Marca": d.veiculo.marca, "Modelo": d.veiculo.modelo, "Cor": d.veiculo.cor,
                      "Combustível": d.veiculo.combustivel, "Ano": `${val(d.veiculo.ano_fabricacao)}/${val(d.veiculo.ano_modelo)}`,
                      "Valor FIPE": fmtMoeda(d.veiculo.valor_fipe), "Valor protegido": fmtMoeda(d.veiculo.valor_protegido),
                      "Situação": d.veiculo.situacao, "Regional": d.veiculo.regional, "Cooperativa": d.veiculo.cooperativa,
                      "Cidade/UF": `${val(d.veiculo.cidade)} / ${val(d.veiculo.estado)}`,
                    }} />
                  )}
                  {d.associado && (
                    <KeyValueTable titulo="Associado" icon={<User className="h-4 w-4" />} data={{
                      "Nome": d.associado.nome, "CPF": d.associado.cpf, "RG": d.associado.rg,
                      "E-mail": d.associado.email, "Telefone": d.associado.telefone, "Celular": d.associado.celular,
                      "Cidade/UF": `${val(d.associado.cidade)} / ${val(d.associado.estado)}`, "Bairro": d.associado.bairro,
                      "Situação": d.associado.situacao, "Cadastro": fmtData(d.associado.data_cadastro),
                    }} />
                  )}
                </div>

                <ListTable titulo="Boletos / Cobrança" icon={<Receipt className="h-4 w-4" />} rows={d.boletos}
                  cols={[
                    { h: "Vencimento", r: (b) => fmtData(b.vencimento) },
                    { h: "Valor", r: (b) => fmtMoeda(b.valor) },
                    { h: "Situação", r: (b) => <StatusPill s={b.situacao} /> },
                    { h: "Pagamento", r: (b) => fmtData(b.pagamento) },
                  ]} />

                <ListTable titulo="Eventos / Vistorias (SGA)" icon={<ShieldAlert className="h-4 w-4" />} rows={d.eventos}
                  cols={[
                    { h: "Data", r: (e) => fmtData(e.data) },
                    { h: "Tipo", r: (e) => val(e.tipo) },
                    { h: "Motivo", r: (e) => val(e.motivo) },
                    { h: "Situação", r: (e) => <StatusPill s={e.situacao} /> },
                    { h: "Protocolo", r: (e) => val(e.protocolo) },
                    { h: "Valor reparo", r: (e) => fmtMoeda(e.valor_reparo) },
                  ]} />

                <ListTable titulo="Lançamentos Financeiros (MGF)" icon={<DollarSign className="h-4 w-4" />} rows={d.mgf}
                  cols={[
                    { h: "Vencimento", r: (m) => fmtData(m.vencimento) },
                    { h: "Operação", r: (m) => val(m.operacao) },
                    { h: "Descrição", r: (m) => val(m.descricao) },
                    { h: "Valor", r: (m) => fmtMoeda(m.valor) },
                    { h: "Situação", r: (m) => <StatusPill s={m.situacao} /> },
                  ]} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function KeyValueTable({ titulo, icon, data }: { titulo: string; icon: React.ReactNode; data: Record<string, any> }) {
  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 text-sm font-semibold">{icon}{titulo}</div>
      <table className="w-full text-sm">
        <tbody>
          {Object.entries(data).map(([k, v]) => (
            <tr key={k} className="border-t border-border/50">
              <td className="px-3 py-1.5 text-muted-foreground w-2/5">{k}</td>
              <td className="px-3 py-1.5 font-medium">{v == null || v === "" ? "—" : String(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListTable({ titulo, icon, rows, cols }: { titulo: string; icon: React.ReactNode; rows: any[]; cols: { h: string; r: (row: any) => React.ReactNode }[] }) {
  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 text-sm font-semibold">
        {icon}{titulo} <span className="text-xs text-muted-foreground font-normal">({rows.length})</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-xs text-muted-foreground">Sem registros.</p>
      ) : (
        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="text-left text-muted-foreground">
                {cols.map((c) => <th key={c.h} className="px-3 py-2 font-medium whitespace-nowrap">{c.h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={`border-t border-border/50 ${i % 2 ? "bg-muted/20" : ""}`}>
                  {cols.map((c) => <td key={c.h} className="px-3 py-1.5 whitespace-nowrap">{c.r(row)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusPill({ s }: { s: any }) {
  const t = String(s || "").toUpperCase();
  const ok = /BAIXAD|PAGO|ATIVO|CONCLU|FINALIZ/.test(t);
  const bad = /ABERTO|INADIMPL|CANCEL|NEGAD|VENCID|PENDENTE/.test(t);
  const cls = ok ? "bg-emerald-500/10 text-emerald-600" : bad ? "bg-red-500/10 text-red-600" : "bg-muted text-muted-foreground";
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${cls}`}>{s || "—"}</span>;
}

function ApiStatusPanel({ apis }: { apis: ApiStatus[] }) {
  if (!apis || apis.length === 0) return null;
  const modLabel: Record<string, string> = { cobranca: "Cobrança", eventos: "Eventos", mgf: "MGF" };
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2"><CardTitle className="text-sm">APIs Hinova ativas ({apis.length})</CardTitle></CardHeader>
      <CardContent className="pb-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {apis.map((a) => (
            <div key={a.associacao} className="rounded-xl border p-2.5">
              <p className="text-xs font-semibold mb-1.5 truncate">{a.associacao}</p>
              <div className="flex flex-wrap gap-1.5">
                {(["cobranca", "eventos", "mgf"] as const).map((mod) => {
                  const st = a[mod]; const okS = st?.status === "sucesso"; const errS = st?.status === "erro";
                  return (
                    <span key={mod} title={st?.erro || (st?.origem ? `via ${st.origem}` : "")}
                      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                        okS ? "bg-emerald-500/10 text-emerald-600" : errS ? "bg-red-500/10 text-red-600" : "bg-muted text-muted-foreground"
                      }`}>
                      {okS ? <CheckCircle2 className="h-3 w-3" /> : errS ? <XCircle className="h-3 w-3" /> : null}
                      {modLabel[mod]}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
