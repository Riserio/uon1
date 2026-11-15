import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, CheckCircle2, FileText, Loader2, Lock, Mail, MessageCircle, Send } from "lucide-react";
import {
  CAMPOS_PADRAO,
  CampoModelo,
  Dados,
  UFS,
  lerMoeda,
  mascarar,
  moedaPorExtenso,
  formatarMoeda,
  soDigitos,
  validarDados,
  emailValido,
  pendenciasDoModelo,
} from "../../../supabase/functions/uonisign/modelo";
import { uonisign, ErroUoniSign, ContratoV2 } from "@/lib/uonisign/api";
import { gerarPdfContrato, bytesParaBase64, carregarImagem } from "@/lib/uonisign/pdf";
import { urlValidacao } from "@/lib/trust";
import PdfViewer from "./PdfViewer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Modelo = Record<string, any>;

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Continuar um rascunho do fluxo 2 */
  rascunho?: ContratoV2 | null;
  /** Administrador Uon1 Sign: pode abrir a configuração do modelo direto do aviso */
  onConfigurarModelo?: () => void;
  /** Contrato nascido de uma cotação do Comercial: modelo e valores já definidos */
  inicial?: { template_id: string; dados: Dados; cotacao_id: string; telefone?: string; whatsapp?: boolean } | null;
}

const ETAPAS = ["Modelo", "Dados", "Conferência", "Signatários"];

function camposDo(m?: Modelo | null): CampoModelo[] {
  return Array.isArray(m?.campos) && m.campos.length ? (m.campos as CampoModelo[]) : CAMPOS_PADRAO;
}

export default function NovoContratoWizard({ open, onOpenChange, rascunho, onConfigurarModelo, inicial }: Props) {
  const qc = useQueryClient();
  const [etapa, setEtapa] = useState(0);
  const [modeloId, setModeloId] = useState<string>("");
  const [dados, setDados] = useState<Dados>({});
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const [contrato, setContrato] = useState<ContratoV2 | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [pendencias, setPendencias] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [errosServidor, setErrosServidor] = useState<Record<string, string>>({});
  const [buscandoCep, setBuscandoCep] = useState(false);
  // Signatário da Contratante
  const [sigEmail, setSigEmail] = useState("");
  const [sigCelular, setSigCelular] = useState("");
  const [sigWhatsapp, setSigWhatsapp] = useState(false);

  const { data: modelos, isLoading: carregandoModelos } = useQuery({
    queryKey: ["uonisign_modelos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contrato_templates").select("*").eq("ativo", true).order("titulo");
      if (error) throw error;
      return ((data ?? []) as Modelo[]).filter((t) => (t.fluxo_versao ?? 1) >= 2);
    },
    enabled: open,
    staleTime: 60_000,
  });

  const modelo = useMemo(() => modelos?.find((m) => m.id === modeloId) ?? null, [modelos, modeloId]);
  const campos = useMemo(() => camposDo(modelo), [modelo]);
  const grupos = useMemo(() => {
    const g: Record<string, CampoModelo[]> = {};
    campos.forEach((c) => (g[c.grupo ?? "Dados"] ??= []).push(c));
    return Object.entries(g);
  }, [campos]);
  const erros = useMemo(() => ({ ...validarDados(campos, dados), ...errosServidor }), [campos, dados, errosServidor]);
  const temErros = Object.keys(erros).length > 0;
  const pendenciasModelo = useMemo(
    () => (modelo ? pendenciasDoModelo(modelo.contratada ?? {}, modelo.signatario_contratada ?? {}, modelo.conteudo_html ?? "") : []),
    [modelo],
  );

  // Abertura: novo ou continuação de rascunho
  useEffect(() => {
    if (!open) return;
    setTocados({});
    setErrosServidor({});
    setPdfUrl(null);
    setHash(null);
    if (rascunho) {
      setModeloId(rascunho.template_id);
      setDados({ ...(rascunho.variaveis_preenchidas ?? {}) });
      setContrato(rascunho);
      setEtapa(1);
    } else if (inicial) {
      setModeloId(inicial.template_id);
      setDados({ ...inicial.dados });
      setContrato(null);
      setEtapa(1);
    } else {
      setModeloId("");
      setDados({});
      setContrato(null);
      setEtapa(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rascunho, inicial?.cotacao_id]);

  // Um modelo só: pula a escolha (D2)
  useEffect(() => {
    if (open && !rascunho && !inicial && etapa === 0 && modelos?.length === 1) escolherModelo(modelos[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, modelos, rascunho]);

  const escolherModelo = (id: string) => {
    const m = modelos?.find((x) => x.id === id);
    const iniciais: Dados = {};
    camposDo(m).forEach((c) => {
      if (c.padrao) iniciais[c.chave] = c.padrao;
    });
    setModeloId(id);
    setDados((d) => ({ ...iniciais, ...d }));
    setEtapa(1);
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
      if (j?.erro) {
        toast.info("CEP não encontrado. Preencha o endereço manualmente.");
        return;
      }
      setDados((x) => ({
        ...x,
        Logradouro: j.logradouro || x.Logradouro || "",
        Bairro: j.bairro || x.Bairro || "",
        Cidade: j.localidade || x.Cidade || "",
        Estado: j.uf || x.Estado || "",
      }));
    } catch {
      toast.info("Consulta de CEP indisponível. Preencha o endereço manualmente.");
    } finally {
      setBuscandoCep(false);
    }
  };

  // Etapa 2 → 3: grava os dados, gera o PDF uma única vez e registra o hash
  const conferir = async () => {
    setTocados(Object.fromEntries(campos.map((c) => [c.chave, true])));
    if (temErros) {
      toast.error("Corrija os campos destacados");
      return;
    }
    try {
      setOcupado("Salvando os dados…");
      const r = await uonisign.criar({ template_id: modeloId, contrato_id: contrato?.id, cotacao_id: contrato ? undefined : inicial?.cotacao_id, dados });
      setContrato(r.contrato);
      setPendencias(r.pendencias_modelo);
      if (pendenciasModelo.length || r.pendencias_modelo.length) {
        toast.success("Rascunho salvo.", {
          description: `Para gerar o PDF e enviar, inclua no modelo os dados da Vangard que faltam: ${(r.pendencias_modelo.length ? r.pendencias_modelo : pendenciasModelo).join(", ")}. Depois é só continuar este rascunho.`,
          duration: 10000,
        });
        qc.invalidateQueries({ queryKey: ["contratos"] });
        return;
      }
      if (r.faltando.length) {
        const daContratada = r.faltando.every((v) => v.startsWith("Contratada_") || v === "Foro");
        toast.error(
          daContratada
            ? `Rascunho salvo. Para gerar o PDF, o administrador precisa completar os dados da Vangard em Uon1 Sign → Modelos → Configurar modelos e signatário${r.pendencias_modelo.length ? ` (falta: ${r.pendencias_modelo.join(", ")})` : ""}.`
            : `O texto do modelo usa campos que não existem no formulário: ${r.faltando.join(", ")}. Ajuste o modelo em Modelos → Editar textos.`,
          { duration: 10000 },
        );
        qc.invalidateQueries({ queryKey: ["contratos"] });
        return;
      }
      setOcupado("Gerando o PDF…");
      const codigo = r.contrato.trust_codigo as string | null;
      const k = modelo?.contratada ?? {};
      const logo = (await carregarImagem(modelo?.logo_url)) ?? (await carregarImagem("/images/logo-vangard.png"));
      const bytes = gerarPdfContrato(r.contrato.conteudo_html, {
        timbre: {
          logo,
          linhas: [k.razao_social, k.cnpj ? `CNPJ ${mascarar("cnpj", k.cnpj)}` : "", k.endereco].filter(Boolean),
        },
        numero: r.contrato.numero,
        titulo: r.contrato.titulo,
        codigoVerificacao: codigo,
        urlValidacao: codigo ? urlValidacao(codigo) : null,
      });
      const reg = await uonisign.registrarPdf(r.contrato.id, bytesParaBase64(bytes));
      setPdfUrl(reg.url);
      setHash(reg.hash);
      setSigEmail((r.contrato.contratante_email ?? dados.Email ?? "").toLowerCase());
      // Celular já conhecido (cotação ou formulário): não precisa digitar de novo
      if (!sigCelular) {
        const daCotacao = soDigitos(inicial?.telefone ?? "");
        const doFormulario = soDigitos(dados.Telefone_do_Responsavel ?? "");
        const tel = daCotacao.length === 11 ? daCotacao : doFormulario.length === 11 ? doFormulario : "";
        if (tel) setSigCelular(tel);
        if (daCotacao.length === 11 && inicial?.whatsapp) setSigWhatsapp(true);
      }
      setEtapa(2);
      qc.invalidateQueries({ queryKey: ["contratos"] });
    } catch (e) {
      if (e instanceof ErroUoniSign && e.erros) {
        setErrosServidor(e.erros);
        toast.error("Corrija os campos destacados");
      } else toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  const enviar = async () => {
    if (!contrato) return;
    if (!emailValido(sigEmail)) return toast.error("Informe um e-mail válido para o signatário");
    if (sigWhatsapp && soDigitos(sigCelular).length !== 11) return toast.error("Celular com WhatsApp deve ter DDD + 9 dígitos");
    try {
      setOcupado("Enviando para assinatura…");
      const r = await uonisign.enviar({ contrato_id: contrato.id, email: sigEmail, telefone: sigCelular, whatsapp: sigWhatsapp });
      toast.success("Contrato enviado para assinatura!");
      if (sigWhatsapp && r.whatsapp === false) toast.warning("O WhatsApp não foi entregue. O e-mail foi enviado normalmente.");
      qc.invalidateQueries({ queryKey: ["contratos"] });
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  const sigContratada = modelo?.signatario_contratada ?? {};
  const valoresDestaque = campos.filter((c) => c.tipo === "moeda");

  return (
    <Dialog open={open} onOpenChange={(o) => !ocupado && onOpenChange(o)}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> {contrato?.numero ? `Contrato ${contrato.numero}` : "Novo contrato"}
          </DialogTitle>
          <DialogDescription>{modelo?.titulo ?? "Escolha o modelo, preencha os dados, confira o PDF e envie para assinatura."}</DialogDescription>
        </DialogHeader>

        {/* Etapas */}
        <ol className="flex items-center gap-2 text-xs mb-2">
          {ETAPAS.map((nome, i) => (
            <li key={nome} className="flex items-center gap-2 flex-1">
              <span
                className={`h-6 w-6 rounded-full flex items-center justify-center font-semibold shrink-0 ${
                  i < etapa ? "bg-emerald-500 text-white" : i === etapa ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {i < etapa ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={i === etapa ? "font-medium" : "text-muted-foreground"}>{nome}</span>
              {i < ETAPAS.length - 1 && <span className="h-px flex-1 bg-border" />}
            </li>
          ))}
        </ol>

        {ocupado && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" /> {ocupado}
          </div>
        )}

        {/* 1 — Modelo */}
        {etapa === 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {carregandoModelos && <p className="text-sm text-muted-foreground">Carregando modelos…</p>}
            {!carregandoModelos && !modelos?.length && (
              <p className="text-sm text-muted-foreground">Nenhum modelo disponível. Peça ao administrador para habilitar um modelo.</p>
            )}
            {modelos?.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => escolherModelo(m.id)}
                className="text-left rounded-xl border p-4 hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{m.titulo}</span>
                  {m.categoria && <Badge variant="outline">{m.categoria}</Badge>}
                </div>
                {m.descricao && <p className="text-sm text-muted-foreground mt-1">{m.descricao}</p>}
                <p className="text-xs text-muted-foreground mt-2">Versão {m.versao ?? 1}</p>
              </button>
            ))}
          </div>
        )}

        {/* 2 — Dados */}
        {etapa === 1 && modelo && (
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              conferir();
            }}
          >
            {pendenciasModelo.length > 0 && <AvisoPendencias itens={pendenciasModelo} onConfigurar={onConfigurarModelo} />}
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
            <div className="flex justify-between gap-2 pt-2 border-t">
              <Button type="button" variant="ghost" onClick={() => (rascunho || inicial ? onOpenChange(false) : setEtapa(0))} disabled={!!ocupado}>
                <ArrowLeft className="h-4 w-4 mr-1" /> {rascunho || inicial ? "Fechar" : "Trocar modelo"}
              </Button>
              <Button type="submit" disabled={!!ocupado || Object.keys(erros).some((k) => tocados[k])}>
                {pendenciasModelo.length ? "Salvar rascunho" : "Gerar PDF e conferir"}
              </Button>
            </div>
          </form>
        )}

        {/* 3 — Conferência */}
        {etapa === 2 && contrato && (
          <div className="space-y-4">
            {pendencias.length > 0 && <AvisoPendencias itens={pendencias} onConfigurar={onConfigurarModelo} />}
            {valoresDestaque.length > 0 && (
              <div className="rounded-xl border-2 border-amber-300/60 bg-amber-50/60 dark:bg-amber-900/10 p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Confira os valores</p>
                {valoresDestaque.map((c) => {
                  const n = lerMoeda(dados[c.chave]);
                  return (
                    <div key={c.chave} className="text-sm">
                      <span className="text-muted-foreground">{c.rotulo}: </span>
                      <strong className="text-base">{formatarMoeda(n)}</strong> <span className="italic">({moedaPorExtenso(n)})</span>
                    </div>
                  );
                })}
              </div>
            )}
            {pdfUrl && <PdfViewer url={pdfUrl} />}
            {hash && (
              <p className="text-[11px] text-muted-foreground break-all">
                Hash SHA-256 deste PDF: <span className="font-mono">{hash}</span> — é exatamente este arquivo que será assinado.
              </p>
            )}
            <div className="flex justify-between gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setEtapa(1)} disabled={!!ocupado}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar e editar
              </Button>
              <Button onClick={() => setEtapa(3)} disabled={!!ocupado || pendencias.length > 0}>
                Confirmar
              </Button>
            </div>
          </div>
        )}

        {/* 4 — Signatários */}
        {etapa === 3 && contrato && (
          <div className="space-y-4">
            <div className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold">1º Contratante</p>
                <Badge variant="outline">assina primeiro</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Nome (representante legal)
                  </Label>
                  <p className="font-medium">{dados.Representante_Legal}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Lock className="h-3 w-3" /> CPF
                  </Label>
                  <p className="font-medium">{mascarar("cpf", dados.CPF ?? "")}</p>
                </div>
                <div>
                  <Label htmlFor="sig-email">E-mail</Label>
                  <Input id="sig-email" type="email" value={sigEmail} onChange={(e) => setSigEmail(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="sig-cel">Celular do signatário</Label>
                  <Input
                    id="sig-cel"
                    inputMode="tel"
                    placeholder="(31) 99999-9999"
                    value={mascarar("celular", sigCelular)}
                    onChange={(e) => setSigCelular(soDigitos(e.target.value))}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={sigWhatsapp} onCheckedChange={setSigWhatsapp} />
                <MessageCircle className="h-4 w-4 text-emerald-600" /> Enviar também pelo WhatsApp (convite, código e cópia)
              </label>
              <p className="text-xs text-muted-foreground">
                Para corrigir nome ou CPF, volte ao formulário. O e-mail sempre recebe o convite.
              </p>
            </div>

            <div className="rounded-xl border p-4 bg-muted/20">
              <div className="flex items-center justify-between">
                <p className="font-semibold">2º Contratada</p>
                <Badge variant="outline">definido no modelo</Badge>
              </div>
              <p className="text-sm mt-1">
                {sigContratada.nome || "—"} <span className="text-muted-foreground">· {sigContratada.email || "sem e-mail"}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">Recebe o convite depois da assinatura do Contratante.</p>
            </div>

            <div className="flex justify-between gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setEtapa(2)} disabled={!!ocupado}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={!!ocupado}>
                  Salvar como rascunho
                </Button>
                <Button onClick={enviar} disabled={!!ocupado}>
                  {ocupado ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Enviar para assinatura
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AvisoPendencias({ itens, onConfigurar }: { itens: string[]; onConfigurar?: () => void }) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm flex gap-2" role="alert">
      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
      <div className="space-y-1.5">
        <p className="font-medium text-amber-900 dark:text-amber-200">Inclua os dados da Vangard no modelo para gerar o contrato</p>
        <p className="text-amber-800 dark:text-amber-300">
          Esses dados são iguais em todos os contratos, por isso ficam na configuração do modelo e não no formulário. Faltam:
        </p>
        <ul className="list-disc pl-5 text-amber-800 dark:text-amber-300">
          {itens.map((i) => (
            <li key={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</li>
          ))}
        </ul>
        {onConfigurar ? (
          <Button type="button" size="sm" variant="outline" className="mt-1 bg-white dark:bg-transparent" onClick={onConfigurar}>
            Incluir os dados agora
          </Button>
        ) : (
          <p className="text-amber-800 dark:text-amber-300">
            Peça ao administrador do Uon1 Sign para preencher em Modelos → Configurar modelos e signatário. Você pode salvar o rascunho e continuar depois.
          </p>
        )}
      </div>
    </div>
  );
}

export function CampoFormulario({
  campo,
  valor,
  erro,
  onChange,
  onBlur,
  copiar,
  carregando,
  desabilitado,
}: {
  desabilitado?: boolean;
  campo: CampoModelo;
  valor: string;
  erro?: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  copiar?: () => void;
  carregando?: boolean;
}) {
  const id = `campo-${campo.chave}`;
  const obrig = campo.obrigatorio !== false;
  const descr = erro ? `${id}-erro` : campo.ajuda ? `${id}-ajuda` : undefined;
  const comum = { id, onBlur, "aria-invalid": !!erro, "aria-describedby": descr, className: erro ? "border-destructive" : "", disabled: desabilitado };
  let controle: React.ReactNode;

  switch (campo.tipo) {
    case "uf":
      controle = (
        <Select value={valor} disabled={desabilitado} onValueChange={(v) => { onChange(v); setTimeout(onBlur, 0); }}>
          <SelectTrigger id={id} aria-invalid={!!erro} className={erro ? "border-destructive" : ""}>
            <SelectValue placeholder="UF" />
          </SelectTrigger>
          <SelectContent>
            {UFS.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
      break;
    case "moeda": {
      const n = lerMoeda(valor);
      controle = (
        <div className="space-y-1">
          <CurrencyInput {...comum} value={valor} placeholder="R$ 0,00" onValueChange={(v) => onChange(v.value)} />
          <p className="text-xs text-muted-foreground italic min-h-4" aria-live="polite">
            {!Number.isNaN(n) && n > 0 ? moedaPorExtenso(n) : ""}
          </p>
        </div>
      );
      break;
    }
    case "texto_longo":
      controle = <Textarea {...comum} value={valor} rows={3} maxLength={campo.max} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "data":
      controle = <Input {...comum} type="date" value={valor} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "inteiro":
      controle = <Input {...comum} inputMode="numeric" value={valor} onChange={(e) => onChange(soDigitos(e.target.value))} />;
      break;
    case "email":
      controle = <Input {...comum} type="email" value={valor} onChange={(e) => onChange(e.target.value.trim())} />;
      break;
    case "cpf":
    case "cnpj":
    case "cep":
    case "telefone":
    case "celular":
      controle = (
        <Input {...comum} inputMode="numeric" value={mascarar(campo.tipo, valor)} onChange={(e) => onChange(soDigitos(e.target.value))} />
      );
      break;
    default:
      controle = <Input {...comum} value={valor} maxLength={campo.max} onChange={(e) => onChange(e.target.value)} />;
  }

  return (
    <div className={campo.tipo === "texto_longo" ? "sm:col-span-2 space-y-1" : "space-y-1"}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>
          {campo.rotulo}
          {obrig ? <span className="text-destructive"> *</span> : <span className="text-muted-foreground font-normal"> (opcional)</span>}
          {carregando && <Loader2 className="inline h-3 w-3 ml-1 animate-spin" />}
        </Label>
        {copiar && (
          <button type="button" onClick={copiar} className="text-xs text-primary hover:underline flex items-center gap-1">
            <Mail className="h-3 w-3" /> usar o e-mail da Contratante
          </button>
        )}
      </div>
      {controle}
      {erro ? (
        <p id={`${id}-erro`} className="text-xs text-destructive">
          {erro}
        </p>
      ) : campo.ajuda ? (
        <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
          {campo.ajuda}
        </p>
      ) : null}
    </div>
  );
}

