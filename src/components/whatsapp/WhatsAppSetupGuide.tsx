import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, ChevronRight, MessageCircle, Phone, FileText, Bot } from "lucide-react";

interface Etapa {
  id: string;
  aba: string;
  titulo: string;
  descricao: string;
  icone: React.ReactNode;
  concluida: boolean;
}

/**
 * Guia de configuração do WhatsApp em 3 passos.
 * Mostra o progresso real (números conectados, templates e automações ativas)
 * e leva direto à aba certa — elimina a confusão de "por onde começo?".
 */
export function WhatsAppSetupGuide({ onNavigate }: { onNavigate: (aba: string) => void }) {
  const [counts, setCounts] = useState<{ numeros: number; templates: number; automacoes: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const client = supabase as any;
        const cfg = await client.from("whatsapp_config").select("id", { count: "exact", head: true }).eq("ativo", true);
        const tpl = await client.from("whatsapp_templates").select("id", { count: "exact", head: true });
        const flows = await client.from("whatsapp_flows").select("id", { count: "exact", head: true }).eq("ativo", true);
        setCounts({ numeros: cfg.count || 0, templates: tpl.count || 0, automacoes: flows.count || 0 });
      } catch {
        setCounts({ numeros: 0, templates: 0, automacoes: 0 });
      }
    })();
  }, []);

  if (!counts) return null;

  const etapas: Etapa[] = [
    {
      id: "numero", aba: "config",
      titulo: "1. Conectar número",
      descricao: counts.numeros > 0 ? `${counts.numeros} número(s) ativo(s)` : "Cadastre o número e o webhook de envio",
      icone: <Phone className="h-4 w-4" />,
      concluida: counts.numeros > 0,
    },
    {
      id: "templates", aba: "templates",
      titulo: "2. Criar templates",
      descricao: counts.templates > 0 ? `${counts.templates} template(s) criado(s)` : "Modelos de mensagem para os envios",
      icone: <FileText className="h-4 w-4" />,
      concluida: counts.templates > 0,
    },
    {
      id: "automacoes", aba: "automacoes",
      titulo: "3. Ativar automações",
      descricao: counts.automacoes > 0 ? `${counts.automacoes} automação(ões) ativa(s)` : "Fluxos automáticos de cobrança e eventos",
      icone: <Bot className="h-4 w-4" />,
      concluida: counts.automacoes > 0,
    },
  ];

  const concluidas = etapas.filter((e) => e.concluida).length;
  if (concluidas === etapas.length) return null; // tudo configurado: guia some

  return (
    <Card className="rounded-2xl border-primary/20 bg-primary/[0.03]">
      <CardContent className="p-4">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="h-8 w-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <MessageCircle className="h-4 w-4 text-emerald-600" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Configuração do WhatsApp</p>
            <p className="text-xs text-muted-foreground">{concluidas} de {etapas.length} passos concluídos</p>
          </div>
          <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden shrink-0">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(concluidas / etapas.length) * 100}%` }} />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {etapas.map((e) => (
            <button
              key={e.id}
              onClick={() => onNavigate(e.aba)}
              className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all hover:shadow-sm ${
                e.concluida
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-border/60 bg-card hover:border-primary/40"
              }`}
            >
              <span className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                e.concluida ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"
              }`}>
                {e.concluida ? <CheckCircle2 className="h-4 w-4" /> : e.icone}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-xs font-semibold ${e.concluida ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{e.titulo}</span>
                <span className="block text-[11px] text-muted-foreground truncate">{e.descricao}</span>
              </span>
              {!e.concluida && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
