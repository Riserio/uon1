import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronDown, ChevronRight, ExternalLink, FilePlus2, Link2, Loader2, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { trust, urlValidacao } from "@/lib/trust";
import { meuNivel } from "@/lib/uonisign/api";
import { bytesParaBase64 } from "@/lib/uonisign/pdf";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const fmt = (iso?: string | null) => (iso ? format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—");
const STATUS: Record<string, string> = {
  valido: "text-emerald-700 bg-emerald-500/10 border-emerald-500/20",
  cancelado: "text-gray-600 bg-gray-500/10 border-gray-500/20",
  revogado: "text-red-700 bg-red-500/10 border-red-500/20",
  substituido: "text-amber-700 bg-amber-500/10 border-amber-500/20",
};

/** Painel interno do Uon1 Trust: documentos, histórico encadeado e verificação da cadeia. */
export default function Uon1Trust() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [cadeia, setCadeia] = useState<Row | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [revogando, setRevogando] = useState<Row | null>(null);

  const { data: nivel = "vendedor" } = useQuery({ queryKey: ["uonisign_nivel", user?.id], queryFn: meuNivel, enabled: !!user });
  const admin = nivel === "admin";

  const { data: docs, isLoading } = useQuery({
    queryKey: ["trust_documentos"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("trust_documentos")
        .select("*, trust_emissores(nome), trust_versoes(id, tipo, hash_sha256, selo_status, carimbo_status, created_at)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: eventos } = useQuery({
    queryKey: ["trust_eventos", aberto],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("trust_eventos").select("*").eq("documento_id", aberto).order("id");
      return (data ?? []) as Row[];
    },
    enabled: !!aberto,
  });

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return docs ?? [];
    return (docs ?? []).filter((d) => [d.codigo, d.titulo_publico, d.tipo].some((v: string) => v?.toLowerCase().includes(t)));
  }, [docs, busca]);

  const verificar = async () => {
    setVerificando(true);
    try {
      setCadeia(await trust.verificarCadeia());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setVerificando(false);
    }
  };

  if (nivel !== "admin" && nivel !== "operador") {
    return (
      <div className="container mx-auto py-6 px-6">
        <PageHeader icon={ShieldCheck} title="Uon1 Trust" />
        <p className="text-sm text-muted-foreground mt-6">Acesso restrito ao Administrador e ao Operador uoniSign.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 px-6 space-y-6">
        <PageHeader
          icon={ShieldCheck}
          title="Uon1 Trust"
          subtitle="Autenticidade, integridade e rastreabilidade dos documentos emitidos"
          actions={
            <>
              <Button variant="outline" onClick={() => window.open("/validar", "_blank", "noopener")}>
                <ExternalLink className="h-4 w-4 mr-2" /> Página de validação
              </Button>
              {admin && (
                <Button onClick={() => setRegistrando(true)}>
                  <FilePlus2 className="h-4 w-4 mr-2" /> Registrar documento
                </Button>
              )}
            </>
          }
        />

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-5 space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Histórico encadeado</p>
              {cadeia ? (
                cadeia.ok ? (
                  <p className="text-emerald-700 font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4" /> Íntegro · {cadeia.total} eventos
                  </p>
                ) : (
                  <p className="text-red-700 font-semibold flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4" /> Divergência no evento #{cadeia.primeiro_erro}
                  </p>
                )
              ) : (
                <p className="text-sm text-muted-foreground">Recalcula todos os hashes da cadeia.</p>
              )}
              <Button size="sm" variant="outline" onClick={verificar} disabled={verificando}>
                {verificando && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />} Verificar agora
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Selo ICP-Brasil</p>
              <p className="font-semibold">{cadeia ? (cadeia.selo_configurado ? "Configurado" : "Não configurado") : "—"}</p>
              <p className="text-xs text-muted-foreground">Certificado do emissor em nuvem/HSM (secret UON1TRUST_SELO_URL).</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Carimbo do tempo</p>
              <p className="font-semibold">{cadeia ? (cadeia.carimbo_configurado ? "Configurado" : "Não configurado") : "—"}</p>
              <p className="text-xs text-muted-foreground">ACT credenciada na ICP-Brasil (secret UON1TRUST_CARIMBO_URL).</p>
            </CardContent>
          </Card>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por código ou documento…" className="pl-10" aria-label="Buscar documentos" />
        </div>

        <div className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && !filtrados.length && <p className="text-sm text-muted-foreground">Nenhum documento registrado ainda.</p>}
          {filtrados.map((d) => {
            const exp = aberto === d.id;
            return (
              <Card key={d.id}>
                <CardContent className="p-4">
                  <button type="button" className="w-full flex items-center gap-3 text-left" onClick={() => setAberto(exp ? null : d.id)} aria-expanded={exp}>
                    {exp ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{d.codigo}</span>
                    <span className="font-medium truncate flex-1">{d.titulo_publico}</span>
                    <Badge variant="outline" className={STATUS[d.status] ?? ""}>
                      {d.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground hidden sm:inline">{fmt(d.emitido_em)}</span>
                  </button>
                  {exp && (
                    <div className="mt-4 space-y-4 pl-7">
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => window.open(`/validar/${d.codigo}`, "_blank", "noopener")}>
                          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Ver como o público vê
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(urlValidacao(d.codigo));
                            toast.success("Link copiado");
                          }}
                        >
                          <Link2 className="h-3.5 w-3.5 mr-1" /> Copiar link
                        </Button>
                        {admin && d.status === "valido" && (
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setRevogando(d)}>
                            Revogar
                          </Button>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Emissor: {d.trust_emissores?.nome ?? "—"} · Origem: {d.origem} · Tipo: {d.tipo}
                        {d.motivo_status && ` · ${d.motivo_status}`}
                      </div>
                      <div className="space-y-1.5">
                        {(d.trust_versoes ?? []).map((v: Row) => (
                          <div key={v.id} className="text-xs rounded-lg border p-2">
                            <span className="font-medium">{v.tipo}</span> · {fmt(v.created_at)} · selo: {v.selo_status} · carimbo: {v.carimbo_status}
                            <span className="block font-mono break-all text-muted-foreground">{v.hash_sha256}</span>
                          </div>
                        ))}
                      </div>
                      <ol className="border-l pl-4 space-y-1.5">
                        {(eventos ?? []).map((ev) => (
                          <li key={ev.id} className="text-xs">
                            <span className="text-muted-foreground mr-2">
                              #{ev.id} · {fmt(ev.created_at)}
                            </span>
                            {ev.descricao}
                            {!ev.publico && <Badge variant="outline" className="ml-1 text-[10px]">interno</Badge>}
                            <span className="block font-mono text-[10px] text-muted-foreground break-all">hash {ev.hash}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {admin && (
        <RegistrarDialog
          open={registrando}
          onOpenChange={setRegistrando}
          onFeito={() => qc.invalidateQueries({ queryKey: ["trust_documentos"] })}
        />
      )}
      {revogando && (
        <RevogarDialog
          doc={revogando}
          onClose={() => setRevogando(null)}
          onFeito={() => qc.invalidateQueries({ queryKey: ["trust_documentos"] })}
        />
      )}
    </div>
  );
}

function RegistrarDialog({ open, onOpenChange, onFeito }: { open: boolean; onOpenChange: (o: boolean) => void; onFeito: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState("documento");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<{ codigo: string; url: string } | null>(null);

  const enviar = async () => {
    if (!arquivo) return;
    setOcupado(true);
    try {
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      const r = await trust.registrar({ pdf_base64: bytesParaBase64(bytes), titulo_publico: titulo.trim(), tipo });
      setResultado(r);
      onFeito();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setResultado(null);
          setArquivo(null);
          setTitulo("");
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar documento no Uon1 Trust</DialogTitle>
          <DialogDescription>
            Para documentos já emitidos fora dos módulos (deliberações, relatórios). O arquivo registrado poderá ser conferido na página pública pelo upload.
          </DialogDescription>
        </DialogHeader>
        {resultado ? (
          <div className="space-y-2 text-sm">
            <p>
              Registrado com o código <strong className="font-mono">{resultado.codigo}</strong>.
            </p>
            <p className="break-all text-muted-foreground">{resultado.url}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="t-titulo">Título público (sem dados pessoais)</Label>
              <Input id="t-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Ata de deliberação nº 12/2026" />
            </div>
            <div>
              <Label htmlFor="t-tipo">Tipo</Label>
              <Input id="t-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="t-arq">Arquivo PDF</Label>
              <Input id="t-arq" type="file" accept="application/pdf" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            </div>
          </div>
        )}
        <DialogFooter>
          {resultado ? (
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          ) : (
            <Button onClick={enviar} disabled={ocupado || !arquivo || titulo.trim().length < 5}>
              {ocupado && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Registrar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevogarDialog({ doc, onClose, onFeito }: { doc: Row; onClose: () => void; onFeito: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revogar {doc.codigo}?</DialogTitle>
          <DialogDescription>A validação pública passa a mostrar o documento como revogado, com o motivo. Não dá para desfazer.</DialogDescription>
        </DialogHeader>
        <Label htmlFor="r-motivo">Motivo (público — não inclua dados pessoais)</Label>
        <Textarea id="r-motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Voltar
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            disabled={motivo.trim().length < 5 || ocupado}
            onClick={async () => {
              setOcupado(true);
              try {
                await trust.revogar(doc.id, motivo.trim());
                toast.success("Documento revogado");
                onFeito();
                onClose();
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setOcupado(false);
              }
            }}
          >
            Revogar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
