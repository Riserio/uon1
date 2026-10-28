import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  BookOpenText,
  Check,
  ChevronDown,
  Copy,
  GitBranch,
  ImagePlus,
  ListOrdered,
  Loader2,
  RotateCcw,
  Scale,
  Sparkles,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Markdown } from "./Markdown";
import { cn } from "@/lib/utils";

/**
 * "Pergunte à Biblioteca": dúvidas sobre o uon1 respondidas a partir do
 * próprio código (edge function `biblioteca-perguntar`).
 *
 * Prints: o usuário pode anexar, colar (Ctrl+V) ou arrastar até 3 imagens.
 * Elas são reduzidas no navegador e enviadas SÓ nesta consulta — não são
 * gravadas no banco, no storage nem no histórico da conversa.
 */

type Modo = "explicar" | "origem" | "passo" | "divergencia";
type Fonte = { titulo: string; origem: string; tipo: string };
type Turno = {
  id: string;
  pergunta: string;
  modo: Modo;
  resposta?: string;
  fontes?: Fonte[];
  erro?: string;
  carregando?: boolean;
  /** miniaturas só em memória (somem ao recarregar a página) */
  previas?: string[];
  qtdPrints?: number;
  descricaoImagem?: string;
};
type Anexo = { id: string; dataUrl: string; nome: string };

const MODOS: { id: Modo; rotulo: string; icon: typeof BookOpenText; dica: string }[] = [
  { id: "explicar", rotulo: "Explicar", icon: BookOpenText, dica: "O que é e como é calculado" },
  { id: "origem", rotulo: "De onde vem", icon: GitBranch, dica: "Caminho do dado até a tela" },
  { id: "passo", rotulo: "Como fazer", icon: ListOrdered, dica: "Passo a passo de uso" },
  { id: "divergencia", rotulo: "Número não bate", icon: Scale, dica: "Por que difere do SGA/esperado" },
];
const ROTULO_MODO = Object.fromEntries(MODOS.map((m) => [m.id, m.rotulo])) as Record<Modo, string>;

const AREAS = [
  { id: "", rotulo: "Todas as áreas" },
  { id: "bi", rotulo: "BI · Indicadores" },
  { id: "cobranca", rotulo: "Cobrança" },
  { id: "eventos", rotulo: "Eventos e sinistros" },
  { id: "mgf", rotulo: "MGF · Financeiro" },
  { id: "base", rotulo: "Base de veículos" },
  { id: "atendimentos", rotulo: "Atendimentos" },
  { id: "integracao", rotulo: "Integração Hinova" },
  { id: "gestao", rotulo: "Usuários e configurações" },
];

const SUGESTOES: { modo: Modo; texto: string }[] = [
  { modo: "explicar", texto: "O card “cadastros do mês” conta renovações?" },
  { modo: "origem", texto: "De onde vem o número de placas ativas do BI?" },
  { modo: "divergencia", texto: "Por que a inadimplência do BI é diferente da do SGA?" },
  { modo: "passo", texto: "Como configuro os horários de sincronização com a Hinova?" },
  { modo: "explicar", texto: "Como é calculada a sinistralidade financeira?" },
  { modo: "origem", texto: "O que a função calcular_dashboard_cobranca faz?" },
];

const TIPO_ROTULO: Record<string, string> = {
  funcao_banco: "Função do banco",
  edge_function: "Servidor",
  tela: "Tela",
  tabela: "Tabela",
  ajuda: "Ajuda",
  documento: "Documento",
  agendamento: "Agendamento",
};

const CHAVE = "biblioteca:conversa";
const MAX_ANEXOS = 3;

function carregarConversa(): Turno[] {
  try {
    const t = JSON.parse(sessionStorage.getItem(CHAVE) || "[]");
    return Array.isArray(t) ? t.filter((x: Turno) => x.resposta || x.erro) : [];
  } catch {
    return [];
  }
}

function nomeFonte(f: Fonte) {
  return f.titulo.replace(
    /^(Função do banco|Função de servidor \(edge function\)|Tela\/componente|Tabela do banco|Guia|Ajuda do BI|Documento [^:]+):\s*/,
    "",
  );
}

/** Reduz o print no navegador (máx. 1600 px, JPEG) — só para envio, nada é salvo. */
function reduzirImagem(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * escala);
      c.height = Math.round(img.height * escala);
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("canvas"));
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("imagem inválida"));
    };
    img.src = url;
  });
}

export default function PergunteBiblioteca() {
  const [conversa, setConversa] = useState<Turno[]>(carregarConversa);
  const [texto, setTexto] = useState("");
  const [modo, setModo] = useState<Modo>("explicar");
  const [area, setArea] = useState("");
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [avisoAnexo, setAvisoAnexo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const carregando = conversa.some((t) => t.carregando);

  // Histórico só com texto: miniaturas e imagens nunca vão para o storage.
  useEffect(() => {
    try {
      sessionStorage.setItem(
        CHAVE,
        JSON.stringify(conversa.filter((t) => !t.carregando).map(({ previas: _p, ...t }) => t)),
      );
    } catch {
      /* armazenamento indisponível: segue só em memória */
    }
  }, [conversa]);

  useEffect(() => {
    if (conversa.length) fimRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [conversa]);

  const adicionarArquivos = async (arquivos: File[]) => {
    const imgs = arquivos.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    const livres = MAX_ANEXOS - anexos.length;
    if (livres <= 0) {
      setAvisoAnexo(`Até ${MAX_ANEXOS} prints por pergunta.`);
      return;
    }
    setAvisoAnexo(imgs.length > livres ? `Até ${MAX_ANEXOS} prints por pergunta — usei os primeiros.` : null);
    const novos: Anexo[] = [];
    for (const f of imgs.slice(0, livres)) {
      if (f.size > 15 * 1024 * 1024) {
        setAvisoAnexo("Imagem muito grande (máx. 15 MB).");
        continue;
      }
      try {
        novos.push({ id: crypto.randomUUID(), dataUrl: await reduzirImagem(f), nome: f.name || "print" });
      } catch {
        setAvisoAnexo("Não consegui ler uma das imagens.");
      }
    }
    setAnexos((a) => [...a, ...novos].slice(0, MAX_ANEXOS));
  };

  const perguntar = async (pergunta: string, modoUsado: Modo = modo) => {
    const q = pergunta.trim() || (anexos.length ? "O que esta tela mostra e como esses números são calculados?" : "");
    if (q.length < 3 || carregando) return;
    const id = crypto.randomUUID();
    const imagens = anexos.map((a) => a.dataUrl);
    // continuação: a transcrição do print anterior entra junto, para o assunto não se perder
    const historico = conversa
      .filter((t) => t.resposta)
      .slice(-3)
      .map((t) => ({
        pergunta: t.descricaoImagem ? `${t.pergunta}\n\n[Print anexado: ${t.descricaoImagem}]` : t.pergunta,
        resposta: t.resposta!,
      }));
    setConversa((c) => [
      ...c,
      { id, pergunta: q, modo: modoUsado, carregando: true, previas: imagens, qtdPrints: imagens.length },
    ]);
    setTexto("");
    setAnexos([]);
    setAvisoAnexo(null);

    let atualizacao: Partial<Turno>;
    try {
      const { data, error } = await supabase.functions.invoke("biblioteca-perguntar", {
        body: { pergunta: q, modo: modoUsado, area: area || undefined, imagens, historico },
      });
      if (error) {
        let msg = "Não consegui responder agora. Tente de novo em instantes.";
        try {
          const corpo = await (error as { context?: Response }).context?.json();
          if (corpo?.error) msg = corpo.error;
        } catch {
          /* mantém a mensagem padrão */
        }
        atualizacao = { erro: msg };
      } else if (data?.error) {
        atualizacao = { erro: data.error };
      } else {
        atualizacao = {
          resposta: data?.resposta || "Sem resposta.",
          fontes: data?.fontes || [],
          descricaoImagem: data?.descricaoImagem,
        };
      }
    } catch {
      atualizacao = { erro: "Sem conexão com o servidor. Verifique a internet e tente de novo." };
    }
    setConversa((c) => c.map((t) => (t.id === id ? { ...t, ...atualizacao, carregando: false } : t)));
    inputRef.current?.focus();
  };

  const copiar = async (t: Turno) => {
    try {
      await navigator.clipboard.writeText(`${t.pergunta}\n\n${t.resposta}`);
      setCopiado(t.id);
      setTimeout(() => setCopiado(null), 1500);
    } catch {
      /* sem permissão de área de transferência */
    }
  };

  const podeEnviar = !carregando && (texto.trim().length >= 3 || anexos.length > 0);

  return (
    <div className="space-y-8">
      {/* Card de pergunta */}
      <section
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setArrastando(true);
          }
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          adicionarArquivos(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "rounded-3xl border bg-card p-5 shadow-sm transition sm:p-7",
          arrastando ? "border-primary ring-4 ring-primary/10" : "border-border",
        )}
      >
        <div className="flex items-start gap-4">
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary sm:flex">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold leading-snug sm:text-[1.35rem]">
              Pergunte sobre qualquer tela, número ou função
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A IA consulta o código do uon1 — funções do banco, importações do SGA, telas e guias — e responde citando
              as fontes. Pode anexar prints.
            </p>
          </div>
        </div>

        {/* Modos */}
        <div className="mt-5 flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de resposta">
          {MODOS.map((m) => {
            const ativo = modo === m.id;
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={ativo}
                title={m.dica}
                onClick={() => setModo(m.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition",
                  ativo
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card text-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4" /> {m.rotulo}
              </button>
            );
          })}
        </div>

        {/* Campo */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            perguntar(texto);
          }}
          className="mt-4 rounded-2xl border border-input bg-background/60 transition focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/15"
        >
          {anexos.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {anexos.map((a) => (
                <div key={a.id} className="group relative h-16 w-24 overflow-hidden rounded-xl border border-border bg-muted">
                  <img src={a.dataUrl} alt={a.nome} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label="Remover print"
                    onClick={() => setAnexos((x) => x.filter((y) => y.id !== a.id))}
                    className="absolute right-1 top-1 rounded-full bg-foreground/70 p-0.5 text-background opacity-90 transition hover:bg-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onPaste={(e) => {
                const arquivos = Array.from(e.clipboardData.files);
                if (arquivos.some((f) => f.type.startsWith("image/"))) {
                  e.preventDefault();
                  adicionarArquivos(arquivos);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  perguntar(texto);
                }
              }}
              rows={3}
              maxLength={1000}
              placeholder="Ex.: O card “cadastros do mês” usa a DATA CONTRATO ou a DATA CADASTRO do SGA?"
              aria-label="Sua pergunta"
              className="min-h-[88px] flex-1 resize-none bg-transparent px-4 py-3 text-[0.95rem] text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!podeEnviar}
              aria-label="Perguntar"
              className="mb-3 mr-3 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-muted-foreground/40"
            >
              {carregando ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
            </button>
          </div>
        </form>

        {/* Rodapé do card */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              aria-label="Área"
              className="h-10 appearance-none rounded-full border border-border bg-card pl-4 pr-10 text-sm font-medium text-foreground transition hover:bg-muted focus:outline-none focus:ring-[3px] focus:ring-ring/15"
            >
              {AREAS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.rotulo}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          <button
            type="button"
            onClick={() => arquivoRef.current?.click()}
            disabled={anexos.length >= MAX_ANEXOS}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
          >
            <ImagePlus className="h-4 w-4 text-accent-brand" /> Anexar print
          </button>
          <input
            ref={arquivoRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              adicionarArquivos(Array.from(e.target.files || []));
              e.target.value = "";
            }}
          />
          <span className="ml-auto hidden text-xs text-muted-foreground md:inline">
            Cole (Ctrl+V) ou arraste prints · Enter envia · Shift+Enter quebra linha
          </span>
        </div>
        <p className="mt-2.5 text-xs text-muted-foreground">
          {avisoAnexo ? (
            <span className="font-medium text-destructive">{avisoAnexo}</span>
          ) : (
            "Os prints são usados só para responder esta pergunta — não ficam salvos."
          )}
        </p>
      </section>

      {/* Sugestões */}
      {conversa.length === 0 && (
        <section>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Sugestões</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {SUGESTOES.map((s) => (
              <button
                key={s.texto}
                type="button"
                onClick={() => {
                  setModo(s.modo);
                  perguntar(s.texto, s.modo);
                }}
                className="group rounded-3xl border border-border bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">{ROTULO_MODO[s.modo]}</p>
                <p className="mt-2 text-[0.95rem] leading-snug text-foreground">{s.texto}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Conversa */}
      {conversa.length > 0 && (
        <section className="space-y-4">
          {conversa.map((t) => (
            <article
              key={t.id}
              className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 pl-7 shadow-sm sm:p-7 sm:pl-9"
            >
              <span className="absolute inset-y-0 left-0 w-1 bg-accent-brand" aria-hidden />
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">{ROTULO_MODO[t.modo] || "Pergunta"}</p>
                {!!t.qtdPrints && (
                  <span className="rounded-lg bg-accent-brand/[0.12] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-accent-brand">
                    {t.qtdPrints} {t.qtdPrints === 1 ? "print" : "prints"}
                  </span>
                )}
              </div>
              <h3 className="mt-1.5 text-lg font-semibold leading-snug sm:text-xl">{t.pergunta}</h3>
              {!!t.previas?.length && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {t.previas.map((src, i) => (
                    <img key={i} src={src} alt={`Print ${i + 1}`} className="h-20 rounded-xl border border-border object-cover" />
                  ))}
                </div>
              )}

              <div className="mt-4 border-t border-dashed border-border pt-4">
                {t.carregando ? (
                  <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <Sparkles className="h-4 w-4 animate-pulse text-accent-brand" />
                    {t.qtdPrints ? "Lendo o print e consultando o código do uon1…" : "Consultando o código do uon1…"}
                  </div>
                ) : t.erro ? (
                  <div className="rounded-2xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3 text-sm text-destructive">
                    {t.erro}
                    {!t.qtdPrints && (
                      <button
                        type="button"
                        onClick={() => {
                          setConversa((c) => c.filter((x) => x.id !== t.id));
                          perguntar(t.pergunta, t.modo);
                        }}
                        className="ml-2 font-semibold underline-offset-2 hover:underline"
                      >
                        Tentar de novo
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <Markdown texto={t.resposta || ""} />
                    {!!t.fontes?.length && (
                      <div className="mt-5">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Fontes consultadas
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {t.fontes.map((f) => (
                            <span
                              key={f.titulo}
                              title={f.origem}
                              className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                            >
                              <span className="font-semibold text-primary">{TIPO_ROTULO[f.tipo] || f.tipo}</span>
                              <span className="truncate">{nomeFonte(f)}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => copiar(t)}
                        className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      >
                        {copiado === t.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiado === t.id ? "Copiado" : "Copiar resposta"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </article>
          ))}
          <div ref={fimRef} className="flex justify-end">
            <button
              type="button"
              disabled={carregando}
              onClick={() => setConversa([])}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Nova conversa
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
