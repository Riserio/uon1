import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  FileUp,
  Loader2,
  Search,
  ShieldCheck,
  ShieldX,
  XCircle,
} from "lucide-react";
import { trust, sha256Arquivo, FichaTrust } from "@/lib/trust";

const fmt = (iso?: string | null) =>
  iso ? format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "—";
const formatarCodigo = (v: string) =>
  v
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, 12)
    .replace(/(.{4})(?=.)/g, "$1-");
const mascaraCnpj = (c?: string | null) =>
  c
    ? c
        .replace(/\D/g, "")
        .replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
    : null;

type Consulta = {
  tipo: "codigo" | "arquivo";
  valor: string;
  nomeArquivo?: string;
};

/** Validação pública de documentos — Uon1 Trust (sem login). */
export default function ValidarDocumento() {
  const { codigo: codigoUrl } = useParams<{ codigo?: string }>();
  const navigate = useNavigate();
  const [codigo, setCodigo] = useState(formatarCodigo(codigoUrl ?? ""));
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ficha, setFicha] = useState<FichaTrust | null>(null);
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const consultarCodigo = async (c: string) => {
    setErro(null);
    setCarregando(true);
    try {
      setFicha(await trust.validar(c));
      setConsulta({ tipo: "codigo", valor: c });
    } catch (e) {
      setErro((e as Error).message);
      setFicha(null);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (codigoUrl && formatarCodigo(codigoUrl).length === 14)
      consultarCodigo(formatarCodigo(codigoUrl));
  }, [codigoUrl]);

  const consultarArquivo = async (arquivo?: File | null) => {
    if (!arquivo) return;
    setErro(null);
    setCarregando(true);
    try {
      const hash = await sha256Arquivo(arquivo); // calculado aqui: o arquivo não é enviado
      setFicha(await trust.validarHash(hash));
      setConsulta({ tipo: "arquivo", valor: hash, nomeArquivo: arquivo.name });
    } catch (e) {
      setErro((e as Error).message);
      setFicha(null);
    } finally {
      setCarregando(false);
    }
  };

  const enviarCodigo = (e: React.FormEvent) => {
    e.preventDefault();
    if (codigo.length !== 14)
      return setErro("O código tem 12 caracteres (ex.: 7K2M-9PXQ-4RTV)");
    navigate(`/validar/${codigo}`, { replace: true });
    consultarCodigo(codigo);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b">
        <div className="w-full px-4 sm:px-6 lg:px-10 py-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-600/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-emerald-700" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Uon1 Trust</h1>
            <p className="text-xs text-muted-foreground">
              Validação de autenticidade de documentos
            </p>
          </div>
        </div>
      </header>

      <main className="w-full px-4 sm:px-6 lg:px-10 py-6 space-y-4">
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <Tabs defaultValue="codigo">
              <TabsList className="grid grid-cols-2 w-full sm:w-auto">
                <TabsTrigger value="codigo" className="gap-1.5">
                  <Search className="h-3.5 w-3.5" /> Código
                </TabsTrigger>
                <TabsTrigger value="arquivo" className="gap-1.5">
                  <FileUp className="h-3.5 w-3.5" /> Arquivo PDF
                </TabsTrigger>
              </TabsList>

              <TabsContent value="codigo" className="pt-4">
                <form onSubmit={enviarCodigo} className="space-y-2">
                  <Label htmlFor="codigo">
                    Código de verificação (no rodapé do documento)
                  </Label>
                  <div className="flex gap-2 max-w-xl">
                    <Input
                      id="codigo"
                      value={codigo}
                      onChange={(e) =>
                        setCodigo(formatarCodigo(e.target.value))
                      }
                      placeholder="XXXX-XXXX-XXXX"
                      className="font-mono tracking-wider uppercase"
                      autoComplete="off"
                    />
                    <Button type="submit" disabled={carregando}>
                      {carregando ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Validar"
                      )}
                    </Button>
                  </div>
                </form>
              </TabsContent>

              <TabsContent value="arquivo" className="pt-4">
                <button
                  type="button"
                  onClick={() => inputArquivo.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setArrastando(true);
                  }}
                  onDragLeave={() => setArrastando(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setArrastando(false);
                    consultarArquivo(e.dataTransfer.files?.[0]);
                  }}
                  className={`w-full rounded-xl border-2 border-dashed p-8 text-center transition-colors ${arrastando ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                >
                  <FileSearch className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium">
                    Arraste o PDF aqui ou clique para escolher
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    A conferência é feita no seu aparelho: o arquivo não é
                    enviado, só a impressão digital (hash SHA-256).
                  </p>
                </button>
                <input
                  ref={inputArquivo}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => consultarArquivo(e.target.files?.[0])}
                />
              </TabsContent>
            </Tabs>
            {erro && (
              <p className="text-sm text-destructive mt-3" role="alert">
                {erro}
              </p>
            )}
          </CardContent>
        </Card>

        {carregando && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando…
          </div>
        )}

        {!carregando && ficha && consulta && (
          <Resultado ficha={ficha} consulta={consulta} />
        )}

        <p className="text-[11px] text-muted-foreground text-center px-4">
          O Uon1 Trust registra os documentos emitidos e o histórico de cada um.
          Selo ICP-Brasil e carimbo do tempo aparecem indicados quando aplicados
          ao documento.
        </p>
      </main>
    </div>
  );
}

function Resultado({
  ficha,
  consulta,
}: {
  ficha: FichaTrust;
  consulta: Consulta;
}) {
  if (!ficha.encontrado || !ficha.documento) {
    return (
      <Card className="rounded-2xl border-red-200">
        <CardContent className="p-6 flex gap-3">
          <ShieldX className="h-7 w-7 text-red-600 shrink-0" />
          <div>
            <h2 className="font-semibold text-red-800">
              {consulta.tipo === "arquivo"
                ? "Arquivo não reconhecido"
                : "Código não encontrado"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {consulta.tipo === "arquivo"
                ? "Este arquivo não corresponde a nenhum documento registrado. Ele pode ter sido alterado (qualquer mudança, mesmo mínima, muda a impressão digital) ou não foi emitido por aqui."
                : "Confira se o código foi digitado corretamente. Se o problema continuar, fale com quem emitiu o documento."}
            </p>
            {consulta.tipo === "arquivo" && (
              <p className="text-[11px] text-muted-foreground mt-2 break-all font-mono">
                SHA-256: {consulta.valor}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const d = ficha.documento;
  const valido = d.status === "valido";
  const porArquivo = consulta.tipo === "arquivo";
  const atual = ficha.versao_consultada;
  const titulo = !valido
    ? d.status === "revogado"
      ? "Documento revogado pelo emissor"
      : d.status === "substituido"
        ? "Documento substituído"
        : "Documento sem validade (não concluído)"
    : porArquivo
      ? "Documento autêntico e íntegro"
      : "Documento registrado";

  return (
    <Card
      className={`rounded-2xl ${valido ? "border-emerald-200" : "border-amber-300"}`}
    >
      <CardContent className="p-5 sm:p-6 space-y-5">
        <div className="flex gap-3">
          {valido ? (
            <CheckCircle2 className="h-8 w-8 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="h-8 w-8 text-amber-600 shrink-0" />
          )}
          <div className="min-w-0">
            <h2
              className={`text-lg font-semibold ${valido ? "text-emerald-800 dark:text-emerald-300" : "text-amber-800 dark:text-amber-300"}`}
            >
              {titulo}
            </h2>
            {!valido && d.motivo_status && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {d.motivo_status}
              </p>
            )}
            {porArquivo && atual && (
              <p className="text-sm mt-1">
                O arquivo <strong>{consulta.nomeArquivo}</strong> é idêntico à
                versão registrada: <strong>{atual.rotulo}</strong>.
                {!atual.mais_recente && (
                  <span className="block text-amber-700 mt-1">
                    Existe uma versão mais recente deste documento (ex.: a
                    versão assinada).
                  </span>
                )}
              </p>
            )}
            {!porArquivo && valido && (
              <p className="text-sm text-muted-foreground mt-1">
                Para confirmar que o arquivo que você tem não foi alterado, use
                a aba <strong>Arquivo PDF</strong>.
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4 text-sm">
          <Campo rotulo="Documento" valor={d.titulo} />
          <Campo rotulo="Código" valor={d.codigo} mono />
          <Campo
            rotulo="Emitido por"
            valor={`${ficha.emissor?.nome ?? "—"}${ficha.emissor?.cnpj ? ` · CNPJ ${mascaraCnpj(ficha.emissor.cnpj)}` : ""}`}
          />
          <Campo rotulo="Registrado em" valor={fmt(d.emitido_em)} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Versões registradas</h3>
            {(ficha.versoes ?? []).map((v) => (
              <div
                key={v.hash}
                className={`rounded-xl border p-3 text-sm ${porArquivo && v.hash === consulta.valor ? "border-emerald-300 bg-emerald-50/60 dark:bg-emerald-900/10" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{v.rotulo}</span>
                  <span className="text-xs text-muted-foreground">
                    {fmt(v.registrada_em)}
                  </span>
                  {v.selo === "concluido" ? (
                    <Badge className="bg-emerald-600/10 text-emerald-700 border-0">
                      Selo ICP-Brasil
                    </Badge>) : null}
                  {v.carimbo === "concluido" ? (
                    <Badge className="bg-emerald-600/10 text-emerald-700 border-0">
                      Carimbo do tempo · {fmt(v.carimbo_em)}
                    </Badge>) : null}
                </div>
                <p className="text-[11px] text-muted-foreground font-mono break-all mt-1">
                  SHA-256: {v.hash}
                </p>
              </div>
            ))}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                Histórico de autenticidade
              </h3>
              {ficha.historico_integro ? (
                <span className="text-xs text-emerald-700 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> Histórico íntegro
                </span>
              ) : (
                <span className="text-xs text-red-700 flex items-center gap-1">
                  <XCircle className="h-3.5 w-3.5" /> Divergência no histórico
                </span>
              )}
            </div>
            <ol className="border-l pl-4 space-y-2">
              {(ficha.historico ?? []).map((ev, i) => (
                <li key={i} className="text-sm">
                  <span className="text-xs text-muted-foreground mr-2">
                    {fmt(ev.created_at)}
                  </span>
                  {ev.descricao}
                </li>
              ))}
            </ol>
            <p className="text-[11px] text-muted-foreground">
              Cada evento é encadeado ao anterior por hash: qualquer alteração
              posterior no histórico é detectada.
            </p>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}

function Campo({
  rotulo,
  valor,
  mono,
}: {
  rotulo: string;
  valor: string;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{rotulo}</span>
      <p className={`font-medium break-words ${mono ? "font-mono" : ""}`}>
        {valor}
      </p>
    </div>
  );
}
