import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PageHeader } from "@/components/ui/page-header";
import {
  Search,
  Loader2,
  Building2,
  User,
  Car,
  IdCard,
  CircleAlert,
  ExternalLink,
  Receipt,
  DollarSign,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  ChevronDown,
} from "lucide-react";
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

interface ApiStatus {
  associacao: string;
  cobranca: { status: string | null; erro: string | null; origem: string | null };
  eventos: { status: string | null; erro: string | null; origem: string | null };
  mgf: { status: string | null; erro: string | null; origem: string | null };
}

const fmtMoeda = (v: any) =>
  v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (v: any) => {
  if (!v) return "—";
  const d = new Date(String(v).length <= 10 ? String(v) + "T00:00:00" : v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("pt-BR");
};

const val = (v: any) => (v == null || v === "" ? "—" : String(v));

// Janela padrão de 12 meses (a partir de hoje) para aliviar a tela de MGF e Eventos
const dozeMesesAtras = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 12);
  return d;
};

const dentroDosUltimos12Meses = (v: any) => {
  if (!v) return false;
  const d = new Date(String(v).length <= 10 ? String(v) + "T00:00:00" : v);
  if (isNaN(d.getTime())) return false;
  return d >= dozeMesesAtras();
};

function maskPlaca(v: string) {
  return v
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 7);
}

function maskCpfCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function aplicarMascara(tipo: Tipo, v: string) {
  if (tipo === "placa") return maskPlaca(v);
  if (tipo === "cpf") return maskCpfCnpj(v);
  return v; // nome: livre
}

const TIPOS: { id: Tipo; label: string; icon: typeof Car; placeholder: string }[] = [
  { id: "placa", label: "Placa", icon: Car, placeholder: "Ex.: ABC1D23" },
  { id: "cpf", label: "CPF/CNPJ", icon: IdCard, placeholder: "Ex.: 123.456.789-00" },
  { id: "nome", label: "Nome", icon: User, placeholder: "Ex.: João da Silva" },
];

export default function SGABusca() {
  const [tipo, setTipo] = useState<Tipo>("placa");
  const [termo, setTermo] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ total: number; resultados: Resultado[]; apis_ativas: ApiStatus[] } | null>(
    null,
  );

  // Logos das associações (corretoras) para exibir no cabeçalho do resultado
  const [logos, setLogos] = useState<Record<string, string>>({});
  useEffect(() => {
    supabase
      .from("corretoras")
      .select("nome, logo_url")
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, string> = {};
        data.forEach((c: any) => {
          if (c.logo_url)
            map[
              String(c.nome || "")
                .trim()
                .toUpperCase()
            ] = c.logo_url;
        });
        setLogos(map);
      });
  }, []);

  const tipoAtual = TIPOS.find((t) => t.id === tipo)!;

  const buscar = async () => {
    const t = termo.trim();
    if (t.length < 3) {
      toast.info("Digite ao menos 3 caracteres.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const params = {
        p_placa: tipo === "placa" ? t : null,
        p_cpf: tipo === "cpf" ? t.replace(/\D/g, "") : null,
        p_nome: tipo === "nome" ? t : null,
      };
      const { data, error } = await supabase.rpc("consultar_hinova", params);
      if (error) throw error;
      const r = data as any;
      if (r?.success === false) throw new Error(r.message || "Falha na busca");
      setResult(r);
      if ((r?.total ?? 0) === 0) toast.info("Nenhum cliente encontrado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao buscar no SGA");
      setResult({ total: 0, resultados: [], apis_ativas: [] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        icon={Search}
        title="SGA — Associados"
        subtitle="Procure por placa, CPF/CNPJ ou nome em todas as associações com API."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Buscar associado
          </CardTitle>
          <CardDescription>Escolha o tipo de busca e informe o termo</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {TIPOS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setTipo(t.id);
                    setTermo("");
                    setResult(null);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    tipo === t.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={termo}
                onChange={(e) => setTermo(aplicarMascara(tipo, e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && buscar()}
                placeholder={tipoAtual.placeholder}
                className={`pl-9 ${tipo === "placa" ? "uppercase tracking-wide" : ""}`}
                inputMode={tipo === "cpf" ? "numeric" : "text"}
              />
            </div>
            <Button onClick={buscar} disabled={loading} className="gap-1.5">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Buscar
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="text-center py-12 text-muted-foreground">
          <Loader2 className="h-7 w-7 mx-auto animate-spin mb-2" />
          Consultando o SGA nas associações...
        </div>
      )}

      {!loading && result && (
        <div className="space-y-5">
          <p className="text-xs text-muted-foreground">
            {result.total} resultado{result.total !== 1 ? "s" : ""} encontrado{result.total !== 1 ? "s" : ""}.
          </p>

          {result.resultados.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 py-14 text-center">
              <CircleAlert className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum cliente encontrado para "{termo}".</p>
            </div>
          ) : (
            result.resultados.map((d, i) => {
              const mgfFiltrado = (d.mgf || []).filter((m: any) => dentroDosUltimos12Meses(m.vencimento));
              const eventosFiltrados = (d.eventos || []).filter((e: any) => dentroDosUltimos12Meses(e.data));
              const logoUrl =
                logos[
                  String(d.associacao || "")
                    .trim()
                    .toUpperCase()
                ];
              return (
                <Card key={i} className="overflow-hidden">
                  {/* Cabeçalho: destaque para a associação (logo + nome) e situações */}
                  <CardHeader className="pb-4 bg-muted/30 border-b border-border/50">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {logoUrl ? (
                          <img
                            src={logoUrl}
                            alt={d.associacao}
                            className="h-12 w-12 rounded-xl object-contain bg-background border border-border/50 p-1 shrink-0"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <Building2 className="h-6 w-6 text-primary" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-lg font-bold leading-tight truncate">{d.associacao}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1.5 truncate">
                            {d.veiculo?.placa && (
                              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                                <Car className="h-3.5 w-3.5" />
                                {d.veiculo.placa}
                              </span>
                            )}
                            {d.veiculo?.placa && d.associado?.nome && <span>·</span>}
                            {d.associado?.nome && <span className="truncate">{d.associado.nome}</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {d.associado?.situacao && <SituacaoBadge label="Associado" s={d.associado.situacao} />}
                        {d.veiculo?.situacao && <SituacaoBadge label="Veículo" s={d.veiculo.situacao} />}
                        {d.sga_url && (
                          <a
                            href={d.sga_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                          >
                            <ExternalLink className="h-3.5 w-3.5" /> Abrir no SGA
                          </a>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-5 space-y-4">
                    <div className="grid gap-4 lg:grid-cols-2">
                      {d.associado && (
                        <KeyValueTable
                          titulo="Associado"
                          icon={<User className="h-4 w-4" />}
                          data={{
                            Nome: d.associado.nome,
                            CPF: d.associado.cpf,
                            RG: d.associado.rg,
                            "E-mail": d.associado.email,
                            Telefone: d.associado.telefone,
                            Celular: d.associado.celular,
                            "Cidade/UF": `${val(d.associado.cidade)} / ${val(d.associado.estado)}`,
                            Bairro: d.associado.bairro,
                            Situação: d.associado.situacao,
                            Cadastro: fmtData(d.associado.data_cadastro),
                          }}
                          destaque="Situação"
                        />
                      )}
                      {d.veiculo && (
                        <KeyValueTable
                          titulo="Veículo"
                          icon={<Car className="h-4 w-4" />}
                          data={{
                            Placa: d.veiculo.placa,
                            Tipo: d.veiculo.tipo,
                            Categoria: d.veiculo.categoria,
                            Marca: d.veiculo.marca,
                            Modelo: d.veiculo.modelo,
                            Cor: d.veiculo.cor,
                            Combustível: d.veiculo.combustivel,
                            Ano: `${val(d.veiculo.ano_fabricacao)}/${val(d.veiculo.ano_modelo)}`,
                            "Valor FIPE": fmtMoeda(d.veiculo.valor_fipe),
                            "Valor protegido": fmtMoeda(d.veiculo.valor_protegido),
                            Situação: d.veiculo.situacao,
                            Regional: d.veiculo.regional,
                            Cooperativa: d.veiculo.cooperativa,
                            "Cidade/UF": `${val(d.veiculo.cidade)} / ${val(d.veiculo.estado)}`,
                          }}
                          destaque="Situação"
                        />
                      )}
                    </div>

                    <ListTable
                      titulo="Boletos / Cobrança"
                      icon={<Receipt className="h-4 w-4" />}
                      rows={d.boletos}
                      collapsible
                      defaultOpen={false}
                      cols={[
                        { h: "Vencimento", r: (b) => fmtData(b.vencimento) },
                        { h: "Valor", r: (b) => fmtMoeda(b.valor) },
                        { h: "Situação", r: (b) => <StatusPill s={b.situacao} /> },
                        { h: "Pagamento", r: (b) => fmtData(b.pagamento) },
                      ]}
                    />

                    <ListTable
                      titulo="Eventos / Vistorias (SGA)"
                      icon={<ShieldAlert className="h-4 w-4" />}
                      rows={eventosFiltrados}
                      subtitulo="últimos 12 meses"
                      collapsible
                      defaultOpen={false}
                      cols={[
                        { h: "Data", r: (e) => fmtData(e.data) },
                        { h: "Tipo", r: (e) => val(e.tipo) },
                        { h: "Motivo", r: (e) => val(e.motivo) },
                        { h: "Situação", r: (e) => <StatusPill s={e.situacao} /> },
                        { h: "Protocolo", r: (e) => val(e.protocolo) },
                        { h: "Valor reparo", r: (e) => fmtMoeda(e.valor_reparo) },
                      ]}
                    />

                    <ListTable
                      titulo="Lançamentos Financeiros (MGF)"
                      icon={<DollarSign className="h-4 w-4" />}
                      rows={mgfFiltrado}
                      subtitulo="últimos 12 meses"
                      collapsible
                      defaultOpen={false}
                      cols={[
                        { h: "Vencimento", r: (m) => fmtData(m.vencimento) },
                        { h: "Operação", r: (m) => val(m.operacao) },
                        { h: "Descrição", r: (m) => val(m.descricao) },
                        { h: "Valor", r: (m) => fmtMoeda(m.valor) },
                        { h: "Situação", r: (m) => <StatusPill s={m.situacao} /> },
                      ]}
                    />
                  </CardContent>
                </Card>
              );
            })
          )}

          <ApiStatusPanel apis={result.apis_ativas} />
        </div>
      )}
    </div>
  );
}

function KeyValueTable({
  titulo,
  icon,
  data,
  destaque,
}: {
  titulo: string;
  icon: React.ReactNode;
  data: Record<string, any>;
  destaque?: string;
}) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 text-sm font-semibold">
        {icon}
        {titulo}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {Object.entries(data).map(([k, v]) => (
            <tr key={k} className="border-t border-border/50">
              <td className="px-3 py-1.5 text-muted-foreground w-2/5">{k}</td>
              <td className="px-3 py-1.5 font-medium">
                {k === destaque ? <StatusPill s={v} /> : v == null || v === "" ? "—" : String(v)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListTable({
  titulo,
  icon,
  rows,
  cols,
  subtitulo,
  collapsible,
  defaultOpen,
}: {
  titulo: string;
  icon: React.ReactNode;
  rows: any[];
  cols: { h: string; r: (row: any) => React.ReactNode }[];
  subtitulo?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  const header = (
    <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 text-sm font-semibold">
      {icon}
      {titulo}{" "}
      <span className="text-xs text-muted-foreground font-normal">
        ({rows.length}
        {subtitulo ? ` • ${subtitulo}` : ""})
      </span>
      {collapsible && (
        <ChevronDown
          className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      )}
    </div>
  );
  const content =
    rows.length === 0 ? (
      <p className="px-3 py-3 text-xs text-muted-foreground">Sem registros.</p>
    ) : (
      <div className="overflow-x-auto max-h-72">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card">
            <tr className="text-left text-muted-foreground">
              {cols.map((c) => (
                <th key={c.h} className="px-3 py-2 font-medium whitespace-nowrap">
                  {c.h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={`border-t border-border/50 ${i % 2 ? "bg-muted/20" : ""}`}>
                {cols.map((c) => (
                  <td key={c.h} className="px-3 py-1.5 whitespace-nowrap">
                    {c.r(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  if (!collapsible) {
    return (
      <div className="rounded-lg border overflow-hidden">
        {header}
        {content}
      </div>
    );
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border overflow-hidden">
      <CollapsibleTrigger asChild>
        <button type="button" className="w-full text-left">
          {header}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>{content}</CollapsibleContent>
    </Collapsible>
  );
}

// Badge de situação com rótulo (Associado / Veículo) — destaque no cabeçalho
function SituacaoBadge({ label, s }: { label: string; s: any }) {
  const t = String(s || "").toUpperCase();
  const ok = /ATIVO|REGULAR|ADIMPLENTE/.test(t) && !/INATIVO/.test(t);
  const bad = /INATIVO|INADIMPL|CANCEL|SUSPENS|BLOQUE/.test(t);
  const cls = ok
    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
    : bad
      ? "bg-red-500/10 text-red-600 border-red-500/20"
      : "bg-muted text-muted-foreground border-border/50";
  const Icon = ok ? CheckCircle2 : bad ? XCircle : CircleAlert;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      <span className="font-normal text-muted-foreground">{label}:</span> {val(s)}
    </span>
  );
}

function StatusPill({ s }: { s: any }) {
  const t = String(s || "").toUpperCase();
  const ok = /BAIXAD|PAGO|ATIVO|CONCLU|FINALIZ/.test(t);
  const bad = /ABERTO|INADIMPL|CANCEL|NEGAD|VENCID|PENDENTE/.test(t);
  const cls = ok
    ? "bg-emerald-500/10 text-emerald-600"
    : bad
      ? "bg-red-500/10 text-red-600"
      : "bg-muted text-muted-foreground";
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${cls}`}>{s || "—"}</span>;
}

function ApiStatusPanel({ apis }: { apis: ApiStatus[] }) {
  const [open, setOpen] = useState(false);
  if (!apis || apis.length === 0) return null;
  const modLabel: Record<string, string> = { cobranca: "Cobrança", eventos: "Eventos", mgf: "MGF" };
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <button type="button" className="w-full flex items-center justify-between px-4 py-3 text-left">
            <span className="text-sm font-medium text-muted-foreground">APIs Hinova ativas ({apis.length})</span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4">
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {apis.map((a) => (
                <div key={a.associacao} className="rounded-lg border p-2">
                  <p className="text-xs font-semibold mb-1 truncate">{a.associacao}</p>
                  <div className="flex flex-wrap gap-1">
                    {(["cobranca", "eventos", "mgf"] as const).map((mod) => {
                      const st = a[mod];
                      const okS = st?.status === "sucesso";
                      const errS = st?.status === "erro";
                      return (
                        <span
                          key={mod}
                          title={st?.erro || (st?.origem ? `via ${st.origem}` : "")}
                          className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                            okS
                              ? "bg-emerald-500/10 text-emerald-600"
                              : errS
                                ? "bg-red-500/10 text-red-600"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
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
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
