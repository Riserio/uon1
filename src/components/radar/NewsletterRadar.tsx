import { forwardRef, useState } from "react";
import { Loader2, Mail, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assinarNewsletter, emailValido, TEXTO_ACEITE } from "@/lib/radar/newsletter";

/**
 * Inscrição na newsletter do Radar (página pública). A pessoa informa o e-mail,
 * marca o aceite de comunicações e publicidade e confirma pelo link enviado.
 */
export const NewsletterRadar = forwardRef<HTMLElement>(function NewsletterRadar(_props, ref) {
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [aceite, setAceite] = useState(false);
  const [site, setSite] = useState(""); // armadilha para robôs
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState<{ email: string; jaAtivo?: boolean } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const assinar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!emailValido(email)) return setErro("Informe um e-mail válido.");
    if (!aceite) return setErro("Para assinar, marque a autorização de envio.");
    setEnviando(true);
    try {
      const r = await assinarNewsletter(email, nome, site);
      setPronto({ email: email.trim(), jaAtivo: r.jaAtivo });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível assinar agora");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section
      ref={ref}
      id="newsletter"
      aria-label="Newsletter do Radar"
      className="relative overflow-hidden rounded-3xl border border-border/60 bg-background p-6 pl-7 sm:p-8 sm:pl-9 shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-accent-brand scroll-mt-24"
    >
      {pronto ? (
        <div className="flex items-start gap-4" role="status">
          <span className="h-12 w-12 shrink-0 rounded-2xl bg-accent-brand/10 text-accent-brand flex items-center justify-center">
            <MailCheck className="h-6 w-6" />
          </span>
          <div className="space-y-1">
            <h2 className="font-serif text-2xl font-semibold">{pronto.jaAtivo ? "Você já é assinante" : "Confira seu e-mail"}</h2>
            <p className="text-muted-foreground">
              {pronto.jaAtivo ? (
                <>O endereço <strong className="text-foreground">{pronto.email}</strong> já recebe as novidades do Radar.</>
              ) : (
                <>
                  Enviamos um link de confirmação para <strong className="text-foreground">{pronto.email}</strong>. Toque nele para começar a receber as
                  matérias. Se não chegar em alguns minutos, olhe a caixa de spam.
                </>
              )}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-[1fr_1.15fr] md:items-start">
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-brand">Newsletter</p>
            <h2 className="font-serif text-2xl sm:text-3xl font-semibold leading-tight">Receba o Radar no seu e-mail</h2>
            <p className="text-muted-foreground">
              Toda matéria nova de órgãos oficiais e do setor chega na sua caixa de entrada, uma vez por dia, só quando houver novidade.
            </p>
          </div>

          <form onSubmit={assinar} className="space-y-3" noValidate>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="news-email">E-mail</Label>
                <Input
                  id="news-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="voce@empresa.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={255}
                  required
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="news-nome">
                  Nome <span className="text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <Input
                  id="news-nome"
                  autoComplete="name"
                  placeholder="Como podemos te chamar"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  maxLength={120}
                  className="h-11 rounded-xl"
                />
              </div>
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
            <label htmlFor="news-aceite" className="flex items-start gap-3 rounded-xl bg-muted/50 p-3 cursor-pointer">
              <Checkbox id="news-aceite" checked={aceite} onCheckedChange={(v) => setAceite(v === true)} className="mt-0.5" />
              <span className="text-sm leading-relaxed text-muted-foreground">{TEXTO_ACEITE}</span>
            </label>
            {erro && (
              <p className="text-sm font-medium text-destructive" role="alert">
                {erro}
              </p>
            )}
            <Button type="submit" disabled={enviando} className="w-full sm:w-auto h-11 rounded-xl bg-accent-brand text-accent-brand-foreground hover:bg-accent-brand/90 px-6">
              {enviando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              Assinar newsletter
            </Button>
          </form>
        </div>
      )}
    </section>
  );
});
