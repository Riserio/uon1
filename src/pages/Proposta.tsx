import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Clock, FileSignature, Loader2, Mail, MessageCircle, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { CampoFormulario } from "@/components/uonisign/NovoContratoWizard";
import { ErroUoniSign, uonisign, type PaginaProposta } from "@/lib/uonisign/api";
import { bytesParaBase64, carregarImagem, gerarPdfContrato } from "@/lib/uonisign/pdf";
import { urlValidacao } from "@/lib/trust";
import {
  formatarData,
  formatarMoeda,
  lerMoeda,
  moedaPorExtenso,
  soDigitos,
  validarDados,
  type CampoModelo,
  type Dados,
} from "../../supabase/functions/uonisign/modelo";

const LOGO = "/images/vangard-logo.png";
const fmt = (iso?: string | null) => (iso ? format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "");

function Tela({ icone, titulo, children }: { icone: React.ReactNode; titulo: string; children?: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="max-w-md w-full rounded-2xl">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <img src={LOGO} alt="Vangard" className="h-9 mx-auto object-contain" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
          <div className="h-14 w-14 rounded-full flex items-center justify-center mx-auto bg-muted">{icone}</div>
          <h1 className="text-xl font-semibold">{titulo}</h1>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

function valorDoTermo(t: PaginaProposta["proposta"]["termos"][number]) {
  if (t.tipo === "moeda") {
    const n = lerMoeda(t.valor);
    return { principal: formatarMoeda(n), extra: moedaPorExtenso(n) };
  }
  if (t.tipo === "data") return { principal: formatarData(t.valor), extra: "" };
  return { principal: t.valor, extra: "" };
}

/** Página pública da proposta comercial: valores → aceite com código → dados → contrato. */
export default function Proposta() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [aceite, setAceite] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [enviandoCodigo, setEnviandoCodigo] = useState<"email" | "whatsapp" | null>(null);
  const [codigoEnviado, setCodigoEnviado] = useState<string | null>(null);
  const [erroCodigo, setErroCodigo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  // Depois do código: sessão de preenchimento
  const [sessao, setSessao] = useState<string | null>(null);
  const [campos, setCampos] = useState<CampoModelo[]>([]);
  const [dados, setDados] = useState<Dados>({});
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const [errosServidor, setErrosServidor] = useState<Record<string, string>>({});
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [recusando, setRecusando] = useState(false);
  const [motivoRecusa, setMotivoRecusa] = useState("");

  const { data: p, isLoading, error, refetch } = useQuery({
    queryKey: ["proposta_publica", token],
    queryFn: () => uonisign.propAbrir(token),
    enabled: !!token,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const grupos = useMemo(() => {
    const g: Record<string, CampoModelo[]> = {};
    campos.forEach((c) => (g[c.grupo ?? "Dados"] ??= []).push(c));
    return Object.entries(g);
  }, [campos]);
  const erros = useMemo(() => ({ ...validarDados(campos, dados), ...errosServidor }), [campos, dados, errosServidor]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !p) {
    return (
      <Tela icone={<AlertCircle className="h-7 w-7 text-muted-foreground" />} titulo="Link inválido">
        <p className="text-sm text-muted-foreground">Não encontramos esta proposta. Confira o link ou fale com quem a enviou.</p>
      </Tela>
    );
  }
  if (p.estado === "cancelada" || p.estado === "indisponivel") {
    return (
      <Tela icone={<XCircle className="h-7 w-7 text-red-600" />} titulo="Proposta indisponível">
        <p className="text-sm text-muted-foreground">Esta proposta foi encerrada. Fale com {p.proposta.vendedor ?? "o vendedor"} para receber uma nova.</p>
      </Tela>
    );
  }
  if (p.estado === "recusada") {
    return (
      <Tela icone={<XCircle className="h-7 w-7 text-red-600" />} titulo="Proposta recusada">
        <p className="text-sm text-muted-foreground">
          Registramos a recusa desta proposta e avisamos {p.proposta.vendedor ?? "o vendedor"}. Se mudar de ideia, peça um novo envio.
        </p>
      </Tela>
    );
  }
  if (p.estado === "expirada") {
    return (
      <Tela icone={<Clock className="h-7 w-7 text-amber-600" />} titulo="Proposta vencida">
        <p className="text-sm text-muted-foreground">
          A validade terminou em {p.proposta.validade_ate ? format(new Date(p.proposta.validade_ate), "dd/MM/yyyy") : "—"}. Peça a{" "}
          {p.proposta.vendedor ?? "quem enviou"} um novo envio.
        </p>
      </Tela>
    );
  }
  if (p.estado === "contratada" || p.estado === "concluida") {
    return (
      <Tela icone={<CheckCircle2 className="h-7 w-7 text-emerald-600" />} titulo={p.estado === "concluida" ? "Contrato assinado" : "Contrato gerado"}>
        <p className="text-sm text-muted-foreground">
          {p.estado === "concluida" ? "Esta proposta já virou contrato, assinado por todas as partes." : "Esta proposta já virou contrato. Falta a assinatura."}
        </p>
        {p.assinatura_token && (
          <Button className="rounded-xl" onClick={() => navigate(`/assinar/${p.assinatura_token}`)}>
            <FileSignature className="h-4 w-4 mr-2" /> {p.estado === "concluida" ? "Ver o contrato" : "Ir para a assinatura"}
          </Button>
        )}
      </Tela>
    );
  }

  const whatsapp = p.contato.canais.includes("whatsapp");
  const jaAceita = p.estado === "aceita";

  const pedirCodigo = async (canal: "email" | "whatsapp") => {
    try {
      setEnviandoCodigo(canal);
      setErroCodigo(null);
      const r = await uonisign.propCodigo(token, canal);
      setCodigoEnviado(`Código enviado para ${r.destino}. Vale por ${r.validade_min} minutos.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviandoCodigo(null);
    }
  };

  const confirmar = async () => {
    try {
      setOcupado("Confirmando…");
      setErroCodigo(null);
      const r = await uonisign.propConfirmar(token, codigo);
      setSessao(r.sessao);
      setCampos(r.campos as CampoModelo[]);
      setDados(r.dados);
      setCodigo("");
      refetch();
    } catch (e) {
      setErroCodigo((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  const recusar = async () => {
    try {
      setOcupado("Registrando…");
      await uonisign.propRecusar(token, motivoRecusa);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  const definir = (chave: string, valor: string) => {
    setDados((d) => ({ ...d, [chave]: valor }));
    if (errosServidor[chave]) setErrosServidor(({ [chave]: _, ...resto }) => resto);
  };

  const buscarCep = async (cep: string) => {
    const d = soDigitos(cep);
    if (d.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: AbortSignal.timeout(3000) });
      const j = await r.json();
      if (j?.erro) return;
      setDados((x) => ({
        ...x,
        Logradouro: j.logradouro || x.Logradouro || "",
        Bairro: j.bairro || x.Bairro || "",
        Cidade: j.localidade || x.Cidade || "",
        Estado: j.uf || x.Estado || "",
      }));
    } catch {
      // consulta indisponível: o cliente preenche o endereço à mão
    } finally {
      setBuscandoCep(false);
    }
  };

  const contratar = async () => {
    setTocados(Object.fromEntries(campos.map((c) => [c.chave, true])));
    if (Object.keys(validarDados(campos, dados)).length) {
      toast.error("Corrija os campos destacados");
      return;
    }
    try {
      setOcupado("Gerando o contrato…");
      const r = await uonisign.propDados(token, sessao!, dados);
      const logo = (await carregarImagem(r.timbre.logo_url)) ?? (await carregarImagem("/images/vangard-logo.png"));
      const cod = r.contrato.trust_codigo;
      const bytes = gerarPdfContrato(r.contrato.conteudo_html, {
        timbre: { logo, linhas: r.timbre.linhas },
        numero: r.contrato.numero,
        titulo: r.contrato.titulo,
        codigoVerificacao: cod,
        urlValidacao: cod ? urlValidacao(cod) : null,
      });
      setOcupado("Preparando a assinatura…");
      const fim = await uonisign.propPdf(token, sessao!, bytesParaBase64(bytes));
      navigate(`/assinar/${fim.assinatura_token}`);
    } catch (e) {
      if (e instanceof ErroUoniSign && e.erros) {
        setErrosServidor(e.erros);
        toast.error("Corrija os campos destacados");
      } else if (e instanceof ErroUoniSign && e.status === 401) {
        setSessao(null);
        toast.error(e.message);
      } else toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur border-b">
        <div className="w-full px-4 sm:px-6 lg:px-10 py-3 flex items-center justify-between gap-3">
          <img src={LOGO} alt="Vangard" className="h-8 object-contain" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
          <Badge variant="outline" className="gap-1.5 text-emerald-700 border-emerald-200">
            <ShieldCheck className="h-3.5 w-3.5" /> Aceite com código
          </Badge>
        </div>
      </header>

      <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4 pb-16">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight break-words">Proposta comercial — {p.proposta.produto ?? p.proposta.modelo}</h1>
          <p className="text-sm text-muted-foreground">
            Nº {p.proposta.numero} · {p.proposta.empresa}
            {p.proposta.vendedor && ` · enviada por ${p.proposta.vendedor}`}
            {p.proposta.validade_ate && !jaAceita && (
              <span className="text-amber-700"> · válida até {format(new Date(p.proposta.validade_ate), "dd/MM/yyyy")}</span>
            )}
          </p>
          {p.proposta.cliente && (
            <p className="text-sm mt-1">
              Para <strong>{p.proposta.cliente}</strong>
              {p.proposta.associacao && ` — ${p.proposta.associacao}`}
            </p>
          )}
        </div>

        <Card className="rounded-2xl">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <h2 className="font-semibold">1. Valores e condições</h2>
            <div className="divide-y rounded-xl border">
              {p.proposta.termos.map((t) => {
                const v = valorDoTermo(t);
                return (
                  <div key={t.chave} className="flex items-start justify-between gap-4 p-3 text-sm">
                    <div>
                      <p className="font-medium">{t.rotulo.replace(/\s*\(R\$\)\s*$/, "")}</p>
                      {t.clausula && <p className="text-xs text-muted-foreground">Cláusula {t.clausula} do contrato</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{v.principal}</p>
                      {v.extra && <p className="text-xs text-muted-foreground italic">{v.extra}</p>}
                    </div>
                  </div>
                );
              })}
              {p.proposta.total > 0 && (
                <div className="flex items-center justify-between gap-4 p-3 bg-muted/40 rounded-b-xl">
                  <p className="font-semibold">Valor da proposta</p>
                  <p className="text-lg font-bold tabular-nums">{formatarMoeda(p.proposta.total)}</p>
                </div>
              )}
            </div>
            {p.proposta.descricao && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{p.proposta.descricao}</p>}
            {p.proposta.modelo && <p className="text-xs text-muted-foreground">Contrato: {p.proposta.modelo}. Você lê o texto completo antes de assinar.</p>}
          </CardContent>
        </Card>

        {jaAceita && (
          <Card className="rounded-2xl border-emerald-200">
            <CardContent className="p-4 text-sm flex gap-2 items-start">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <span>Valores aceitos em {fmt(p.aceite_em)}. {sessao ? "Agora preencha os dados para gerar o contrato." : "Para continuar o preenchimento, confirme com um novo código."}</span>
            </CardContent>
          </Card>
        )}

        {!sessao && (
          <Card className="rounded-2xl border-primary/30">
            <CardContent className="p-4 sm:p-5 space-y-4">
              <h2 className="font-semibold">{jaAceita ? "2. Confirme para continuar" : "2. Aceite a proposta"}</h2>
              {!jaAceita && (
                <div className="flex items-start gap-2.5 rounded-xl bg-muted/40 p-3">
                  <Checkbox id="aceite" checked={aceite} onCheckedChange={(v) => setAceite(v === true)} className="mt-0.5" />
                  <Label htmlFor="aceite" className="text-sm leading-relaxed font-normal">
                    Li e aceito os valores e as condições desta proposta e quero seguir para a contratação.
                  </Label>
                </div>
              )}
              <div className="space-y-2">
                <p className="text-sm">Receba um código de confirmação de 6 dígitos:</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button variant="outline" className="rounded-xl" onClick={() => pedirCodigo("email")} disabled={!!enviandoCodigo}>
                    {enviandoCodigo === "email" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                    Por e-mail ({p.contato.email})
                  </Button>
                  {whatsapp && (
                    <Button variant="outline" className="rounded-xl" onClick={() => pedirCodigo("whatsapp")} disabled={!!enviandoCodigo}>
                      {enviandoCodigo === "whatsapp" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MessageCircle className="h-4 w-4 mr-2 text-emerald-600" />}
                      Por WhatsApp ({p.contato.telefone})
                    </Button>
                  )}
                </div>
                {codigoEnviado && (
                  <p className="text-xs text-muted-foreground" aria-live="polite">
                    {codigoEnviado}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="codigo">Código de confirmação</Label>
                <InputOTP id="codigo" maxLength={6} value={codigo} onChange={setCodigo} inputMode="numeric" autoComplete="one-time-code">
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                {erroCodigo && (
                  <p className="text-sm text-destructive" role="alert">
                    {erroCodigo}
                  </p>
                )}
              </div>
              <div className="flex justify-end">
                <Button size="lg" className="rounded-xl sm:min-w-[220px]" onClick={confirmar} disabled={(!jaAceita && !aceite) || codigo.length !== 6 || !!ocupado}>
                  {ocupado ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  {jaAceita ? "Continuar" : "Aceitar e continuar"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> Registramos data, hora, IP e dispositivo do aceite.
              </p>
              <div className="border-t pt-3">
                {!recusando ? (
                  <button type="button" className="text-xs text-muted-foreground hover:text-destructive underline" onClick={() => setRecusando(true)}>
                    Não tenho interesse: recusar a proposta
                  </button>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="motivo-recusa">Por que você está recusando?</Label>
                    <Textarea id="motivo-recusa" rows={2} maxLength={1000} value={motivoRecusa} onChange={(e) => setMotivoRecusa(e.target.value)} placeholder="Ex.: valor acima do orçamento" />
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setRecusando(false)} disabled={!!ocupado}>
                        Voltar
                      </Button>
                      <Button variant="destructive" size="sm" onClick={recusar} disabled={motivoRecusa.trim().length < 5 || !!ocupado}>
                        Recusar proposta
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {sessao && (
          <Card className="rounded-2xl border-primary/30">
            <CardContent className="p-4 sm:p-5">
              <form
                className="space-y-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  contratar();
                }}
              >
                <div>
                  <h2 className="font-semibold">3. Dados para o contrato</h2>
                  <p className="text-sm text-muted-foreground">Preencha os dados da empresa e de quem vai assinar. Os valores já estão definidos pela proposta.</p>
                </div>
                {grupos.map(([grupo, lista]) => (
                  <fieldset key={grupo} className="space-y-3">
                    <legend className="text-sm font-semibold text-foreground">{grupo}</legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {lista.map((c) => (
                        <CampoFormulario
                          key={c.chave}
                          campo={c}
                          valor={dados[c.chave] ?? ""}
                          erro={tocados[c.chave] ? erros[c.chave] : undefined}
                          onChange={(v) => definir(c.chave, v)}
                          onBlur={() => {
                            setTocados((t) => ({ ...t, [c.chave]: true }));
                            if (c.tipo === "cep") buscarCep(dados[c.chave] ?? "");
                          }}
                          copiar={c.copiar_de ? () => definir(c.chave, dados[c.copiar_de!] ?? "") : undefined}
                          carregando={c.tipo === "cep" && buscandoCep}
                        />
                      ))}
                    </div>
                  </fieldset>
                ))}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t">
                  <p className="text-xs text-muted-foreground">Na próxima tela você lê o contrato completo e assina com um código.</p>
                  <Button type="submit" size="lg" className="rounded-xl sm:min-w-[240px]" disabled={!!ocupado}>
                    {ocupado ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSignature className="h-4 w-4 mr-2" />}
                    {ocupado ?? "Gerar contrato e assinar"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
