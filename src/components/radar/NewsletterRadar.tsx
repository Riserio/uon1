import { forwardRef, useEffect, useRef, useState } from "react";
import { Loader2, Mail, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { assinarNewsletter, emailValido, lembrarAssinatura, TEXTO_ACEITE } from "@/lib/radar/newsletter";

interface Props {
  /** abre o campo de e-mail (botão do topo da página) */
  aberto: boolean;
  onAbrir: () => void;
  onAssinado: () => void;
}

/**
 * Convite compacto para a newsletter do Radar: uma frase com botão; ao tocar,
 * abre o e-mail e o aceite na mesma faixa. Quem já assinou neste aparelho não vê.
 */
export const NewsletterRadar = forwardRef<HTMLElement, Props>(function NewsletterRadar({ aberto, onAbrir, onAssinado }, ref) {
  const [email, setEmail] = useState("");
  const [aceite, setAceite] = useState(false);
  const [site, setSite] = useState(""); // armadilha para robôs
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState<{ email: string; jaAtivo?: boolean } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (aberto) campo.current?.focus({ preventScroll: true });
  }, [aberto]);

  const assinar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!emailValido(email)) return setErro("Informe um e-mail válido.");
    if (!aceite) return setErro("Marque a autorização para assinar.");
    setEnviando(true);
    try {
      const r = await assinarNewsletter(email, "", site);
      lembrarAssinatura(email.trim(), r.jaAtivo ? "ativo" : "pendente");
      setPronto({ email: email.trim(), jaAtivo: r.jaAtivo });
      onAssinado();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível assinar agora");
    } finally {
      setEnviando(false);
    }
  };

  const base =
    "relative overflow-hidden rounded-2xl border border-border/60 bg-background px-4 py-3.5 pl-5 shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-accent-brand scroll-mt-24";

  if (pronto) {
    return (
      <section ref={ref} aria-label="Newsletter do Radar" className={base} role="status">
        <p className="flex items-start gap-2.5 text-sm">
          <MailCheck className="h-5 w-5 shrink-0 text-accent-brand" />
          <span className="text-muted-foreground">
            {pronto.jaAtivo ? (
              <>Você já assina a newsletter do Radar.</>
            ) : (
              <>
                Quase lá: confirme pelo link que enviamos para <strong className="text-foreground">{pronto.email}</strong>.
              </>
            )}
          </span>
        </p>
      </section>
    );
  }

  return (
    <section ref={ref} id="newsletter" aria-label="Newsletter do Radar" className={base}>
      {!aberto ? (
        <div className="flex items-center gap-3 flex-wrap">
          <Mail className="h-5 w-5 shrink-0 text-accent-brand" />
          <p className="min-w-0 max-w-2xl text-sm">
            <span className="font-serif font-semibold text-base">Assine a newsletter</span>
            <span className="block text-muted-foreground text-xs sm:inline sm:text-sm sm:ml-1.5">e receba as matérias novas no e-mail.</span>
          </p>
          <Button size="sm" onClick={onAbrir} className="shrink-0 rounded-full bg-accent-brand text-accent-brand-foreground hover:bg-accent-brand/90 px-4">
            Assinar
          </Button>
        </div>
      ) : (
        <form onSubmit={assinar} className="space-y-2.5" noValidate>
          <p className="font-serif font-semibold">Assine a newsletter do Radar</p>
          <div className="flex gap-2 max-w-md">
            <Input
              ref={campo}
              type="email"
              inputMode="email"
              autoComplete="email"
              aria-label="Seu e-mail"
              placeholder="Seu e-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
              required
              className="h-10 rounded-full flex-1 min-w-0"
            />
            <Button
              type="submit"
              disabled={enviando}
              className="h-10 shrink-0 rounded-full bg-accent-brand text-accent-brand-foreground hover:bg-accent-brand/90 px-4"
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assinar"}
            </Button>
          </div>
          {/* campo escondido: pessoas não veem nem preenchem */}
          <input
            type="text"
            name="site"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={site}
            onChange={(e) => setSite(e.target.value)}
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
          />
          <label htmlFor="news-aceite" className="flex items-start gap-2 cursor-pointer">
            <Checkbox id="news-aceite" checked={aceite} onCheckedChange={(v) => setAceite(v === true)} className="mt-0.5 h-4 w-4" />
            <span className="text-xs leading-snug text-muted-foreground">{TEXTO_ACEITE}</span>
          </label>
          {erro && (
            <p className="text-xs font-medium text-destructive" role="alert">
              {erro}
            </p>
          )}
        </form>
      )}
    </section>
  );
});
