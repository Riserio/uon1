import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUp,
  Check,
  Copy,
  Loader2,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Markdown } from "./Markdown";

/**
 * "Pergunte à Biblioteca": dúvidas sobre o funcionamento do uon1 respondidas
 * a partir do próprio código (edge function `biblioteca-perguntar`).
 */

type Fonte = { titulo: string; origem: string; tipo: string };
type Turno = {
  id: string;
  pergunta: string;
  resposta?: string;
  fontes?: Fonte[];
  erro?: string;
  carregando?: boolean;
};

const SUGESTOES = [
  "O card “cadastros do mês” conta renovações?",
  "Como é calculada a inadimplência no BI?",
  "Em que horário a base de veículos sincroniza com a Hinova?",
  "De onde vem a sinistralidade financeira?",
  "O que a função calcular_dashboard_cobranca faz?",
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

/**
 * `children` recebe as duas partes já montadas — a caixa de pergunta (que vai
 * na faixa do topo) e a conversa (que vai abaixo, no fundo da página).
 */
export default function PergunteBiblioteca({
  children,
}: {
  children: (partes: {
    caixa: ReactNode;
    conversa: ReactNode;
    temConversa: boolean;
  }) => ReactNode;
}) {
  const [conversa, setConversa] = useState<Turno[]>(carregarConversa);
  const [texto, setTexto] = useState("");
  const [copiado, setCopiado] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const carregando = conversa.some((t) => t.carregando);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        CHAVE,
        JSON.stringify(conversa.filter((t) => !t.carregando)),
      );
    } catch {
      /* armazenamento indisponível: segue só em memória */
    }
  }, [conversa]);

  useEffect(() => {
    if (conversa.length)
      fimRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [conversa]);

  const perguntar = async (pergunta: string) => {
    const q = pergunta.trim();
    if (q.length < 3 || carregando) return;
    const id = crypto.randomUUID();
    const historico = conversa
      .filter((t) => t.resposta)
      .slice(-3)
      .map((t) => ({ pergunta: t.pergunta, resposta: t.resposta! }));
    setConversa((c) => [...c, { id, pergunta: q, carregando: true }]);
    setTexto("");

    let atualizacao: Partial<Turno>;
    try {
      const { data, error } = await supabase.functions.invoke(
        "biblioteca-perguntar",
        {
          body: { pergunta: q, historico },
        },
      );
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
        };
      }
    } catch {
      atualizacao = {
        erro: "Sem conexão com o servidor. Verifique a internet e tente de novo.",
      };
    }
    setConversa((c) =>
      c.map((t) =>
        t.id === id ? { ...t, ...atualizacao, carregando: false } : t,
      ),
    );
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

  const caixa = (
    <div className="space-y-4">
      {/* Caixa de pergunta */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          perguntar(texto);
        }}
        className="rounded-3xl bg-card p-2 shadow-[0_12px_32px_-8px_hsl(var(--foreground)/0.25)] ring-1 ring-black/5"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                perguntar(texto);
              }
            }}
            rows={2}
            maxLength={1000}
            placeholder="Pergunte sobre qualquer número, tela ou função do uon1…"
            aria-label="Sua pergunta"
            className="min-h-[56px] flex-1 resize-none bg-transparent px-4 py-3 text-[0.98rem] text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
          />
          <button
            type="submit"
            disabled={carregando || texto.trim().length < 3}
            aria-label="Perguntar"
            className="mb-1.5 mr-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-brand text-accent-brand-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {carregando ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ArrowUp className="h-5 w-5" />
            )}
          </button>
        </div>
      </form>

      {conversa.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {SUGESTOES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => perguntar(s)}
              className="rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-[0.8rem] text-white/90 transition hover:bg-white/20"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const conversaEl = conversa.length > 0 && (
    <div className="space-y-4">
      {conversa.map((t) => (
        <article
          key={t.id}
          className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 pl-7 text-foreground shadow-sm sm:p-6 sm:pl-8"
        >
          <span
            className="absolute inset-y-0 left-0 w-1 bg-accent-brand"
            aria-hidden
          />
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
            Pergunta
          </p>
          <h3 className="mt-1.5 font-serif text-lg font-semibold leading-snug sm:text-xl">
            {t.pergunta}
          </h3>

          <div className="mt-4 border-t border-dashed border-border pt-4">
            {t.carregando ? (
              <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 animate-pulse text-accent-brand" />
                Consultando o código do uon1…
              </div>
            ) : t.erro ? (
              <div className="rounded-2xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3 text-sm text-destructive">
                {t.erro}
                <button
                  type="button"
                  onClick={() => {
                    setConversa((c) => c.filter((x) => x.id !== t.id));
                    perguntar(t.pergunta);
                  }}
                  className="ml-2 font-semibold underline-offset-2 hover:underline"
                >
                  Tentar de novo
                </button>
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
                          <span className="font-semibold text-primary">
                            {TIPO_ROTULO[f.tipo] || f.tipo}
                          </span>
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
                    {copiado === t.id ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
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
    </div>
  );

  return (
    <>
      {children({
        caixa,
        conversa: conversaEl,
        temConversa: conversa.length > 0,
      })}
    </>
  );
}
