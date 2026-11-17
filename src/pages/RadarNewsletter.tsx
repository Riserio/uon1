import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, MailX, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelarNewsletter, confirmarNewsletter, esquecerAssinatura, lembrarAssinatura } from "@/lib/radar/newsletter";

type Estado = { fase: "carregando" } | { fase: "ok"; email?: string } | { fase: "erro"; msg: string };

/** Link dos e-mails da newsletter: confirma ou cancela a inscrição. */
export default function RadarNewsletter() {
  const [params] = useSearchParams();
  const acao = params.get("acao") === "cancelar" ? "cancelar" : "confirmar";
  const token = params.get("t") ?? "";
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const feito = useRef(false);

  useEffect(() => {
    document.title = "Newsletter do Radar | Vangard Gestora";
    if (feito.current) return;
    feito.current = true;
    if (!token) return setEstado({ fase: "erro", msg: "Link inválido." });
    (acao === "cancelar" ? cancelarNewsletter(token) : confirmarNewsletter(token))
      .then((r) => {
        // reconhece o aparelho: quem confirmou não vê mais o convite; quem cancelou volta a ver
        if (acao === "cancelar") esquecerAssinatura();
        else lembrarAssinatura(r.email ?? "", "ativo");
        setEstado({ fase: "ok", email: r.email });
      })
      .catch((e) => setEstado({ fase: "erro", msg: e instanceof Error ? e.message : "Link inválido." }));
  }, [acao, token]);

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <header className="bg-background/90 border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center">
          <Link to="/radar">
            <img src="/images/vangard-logo.png" alt="Vangard Gestora" className="h-8 object-contain" />
          </Link>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-3xl border border-border/60 bg-background p-8 shadow-sm text-center space-y-4">
          {estado.fase === "carregando" ? (
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
          ) : estado.fase === "erro" ? (
            <>
              <XCircle className="h-12 w-12 mx-auto text-destructive" />
              <h1 className="font-serif text-2xl font-semibold">Não deu certo</h1>
              <p className="text-muted-foreground">{estado.msg}</p>
            </>
          ) : acao === "confirmar" ? (
            <>
              <CheckCircle2 className="h-12 w-12 mx-auto text-accent-brand" />
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Newsletter</p>
              <h1 className="font-serif text-2xl font-semibold">Inscrição confirmada</h1>
              <p className="text-muted-foreground">
                {estado.email ? <strong className="text-foreground">{estado.email}</strong> : "Seu e-mail"} vai receber as novidades do Radar do mercado sempre que
                houver matéria nova.
              </p>
            </>
          ) : (
            <>
              <MailX className="h-12 w-12 mx-auto text-muted-foreground" />
              <h1 className="font-serif text-2xl font-semibold">Inscrição cancelada</h1>
              <p className="text-muted-foreground">
                {estado.email ? <strong className="text-foreground">{estado.email}</strong> : "Seu e-mail"} não vai mais receber a newsletter nem as comunicações
                da Vangard Gestora. Se mudar de ideia, é só assinar de novo.
              </p>
            </>
          )}
          {estado.fase !== "carregando" && (
            <Link to="/radar" className="inline-block pt-2">
              <Button className="rounded-xl">Ir para o Radar do mercado</Button>
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
