import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, ArrowLeft, ArrowRight, CornerDownLeft, Download } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import vangardLogo from "/images/vangard-logo.png";

// === Máscaras ===
function maskPlaca(v: string) {
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  if (s.length <= 3) return s;
  return `${s.slice(0, 3)}-${s.slice(3)}`;
}
function maskCPF(v: string) {
  const s = v.replace(/\D/g, "").slice(0, 11);
  return s
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
function maskCNPJ(v: string) {
  const s = v.replace(/\D/g, "").slice(0, 14);
  return s
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}
function maskCEP(v: string) {
  const s = v.replace(/\D/g, "").slice(0, 8);
  return s.replace(/^(\d{5})(\d)/, "$1-$2");
}
function maskTelefone(v: string) {
  const s = v.replace(/\D/g, "").slice(0, 11);
  if (s.length <= 10) {
    return s
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return s
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

export default function FormularioPublico() {
  const { slug } = useParams<{ slug: string }>();
  const [valores, setValores] = useState<Record<string, any>>({});
  const [honey, setHoney] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0); // 1..N

  const { data: form, isLoading, error } = useQuery({
    queryKey: ["formulario_publico", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formularios")
        .select("*, formulario_perguntas(*)")
        .eq("slug", slug!)
        .eq("status", "publicado")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const perguntas = useMemo(
    () =>
      [...((form?.formulario_perguntas as any[]) || [])].sort(
        (a, b) => a.ordem - b.ordem
      ),
    [form]
  );

  const cor = form?.cor_tema || "#362C89";
  const total = perguntas.length;
  const perguntaAtual = started && step >= 1 && step <= total ? perguntas[step - 1] : null;

  useEffect(() => {
    if (form?.titulo) document.title = form.titulo;
  }, [form]);

  const enviar = useMutation({
    mutationFn: async () => {
      if (honey) return;
      for (const p of perguntas) {
        if (p.obrigatorio) {
          const v = valores[p.id];
          const vazio =
            v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
          if (vazio) throw new Error(`"${p.enunciado}" é obrigatória`);
        }
      }
      const { error } = await supabase.from("formulario_respostas").insert({
        formulario_id: form!.id,
        user_agent: navigator.userAgent,
        dados: valores,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setEnviado(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const validarAtual = (): boolean => {
    if (!perguntaAtual) return true;
    if (!perguntaAtual.obrigatorio) return true;
    const v = valores[perguntaAtual.id];
    const vazio = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    if (vazio) {
      toast.error("Esta pergunta é obrigatória");
      return false;
    }
    return true;
  };

  const avancar = () => {
    if (!validarAtual()) return;
    if (step >= total) enviar.mutate();
    else setStep((s) => s + 1);
  };
  const voltar = () => setStep((s) => Math.max(1, s - 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!started || enviado) return;
      if (e.key === "Enter" && !e.shiftKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "TEXTAREA") return;
        e.preventDefault();
        avancar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, enviado, step, valores, total]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        Carregando...
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-2">
            <h1 className="text-xl font-bold">Formulário indisponível</h1>
            <p className="text-sm text-muted-foreground">
              Este formulário não existe ou ainda não está publicado.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const renderShell = (children: React.ReactNode) => (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: `linear-gradient(135deg, ${cor}0d 0%, ${cor}03 60%, #ffffff 100%)` }}
    >
      <header className="w-full border-b border-border/40 bg-white/70 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <img src="/images/vangard-logo.png" alt="Vangard" className="h-9 object-contain" />
          {started && !enviado && total > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {Math.min(step, total)} / {total}
            </span>
          )}
        </div>
        {started && !enviado && total > 0 && (
          <div className="h-1 bg-muted/40">
            <div
              className="h-full transition-all duration-500 ease-out"
              style={{ width: `${(Math.min(step, total) / total) * 100}%`, backgroundColor: cor }}
            />
          </div>
        )}
      </header>
      <div className="flex-1 flex items-center justify-center px-6 py-10">{children}</div>
      <footer className="text-center text-[11px] text-muted-foreground py-4">
        Processado pela plataforma <span className="font-medium">Uon1</span>
      </footer>
    </div>
  );

  const baixarPDF = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    // Título
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(form.titulo || "Respostas", 40, 50);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text(
      `Enviado em ${new Date().toLocaleString("pt-BR")}`,
      40,
      68
    );
    doc.setTextColor(0);

    const rows = perguntas.map((p: any, i: number) => {
      const v = valores[p.id];
      const texto = Array.isArray(v) ? v.join(", ") : v ?? "—";
      return [`${i + 1}. ${p.enunciado}`, String(texto || "—")];
    });

    autoTable(doc, {
      startY: 90,
      head: [["Pergunta", "Resposta"]],
      body: rows,
      styles: { fontSize: 10, cellPadding: 8, valign: "top" },
      headStyles: { fillColor: cor, textColor: 255 },
      columnStyles: {
        0: { cellWidth: pageWidth * 0.45, fontStyle: "bold" },
        1: { cellWidth: pageWidth * 0.45 },
      },
    });

    const safe = (form.titulo || "respostas")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    doc.save(`${safe}-${Date.now()}.pdf`);
  };

  if (enviado) {
    return renderShell(
        <Card className="max-w-lg w-full rounded-3xl border-0 shadow-xl">
          <CardContent className="p-12 text-center space-y-5">
            <CheckCircle2 className="h-16 w-16 mx-auto" style={{ color: cor }} />
            <h1 className="text-3xl font-bold tracking-tight">Obrigado!</h1>
            <p className="text-muted-foreground">
              {(form.config as any)?.mensagem_agradecimento || "Resposta enviada com sucesso!"}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
              <Button
                onClick={baixarPDF}
                className="gap-2 rounded-full"
                style={{ backgroundColor: cor, color: "white" }}
              >
                <Download className="h-4 w-4" /> Baixar PDF das respostas
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  setValores({});
                  setEnviado(false);
                  setStarted(false);
                  setStep(0);
                }}
              >
                Enviar outra resposta
              </Button>
            </div>
          </CardContent>
        </Card>
    );
  }

  if (!started) {
    return renderShell(
        <div className="max-w-2xl w-full text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {form.logo_url && (
            <img src={form.logo_url} alt="" className="h-16 mx-auto object-contain" />
          )}
          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">{form.titulo}</h1>
            {form.descricao && (
              <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
                {form.descricao}
              </p>
            )}
          </div>
          <div className="flex flex-col items-center gap-3 pt-4">
            <Button
              size="lg"
              className="text-base px-8 h-12 rounded-full shadow-lg hover:shadow-xl transition-all"
              style={{ backgroundColor: cor, color: "white" }}
              onClick={() => {
                setStarted(true);
                setStep(1);
              }}
            >
              Começar <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              Pressione{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">Enter</kbd> a
              qualquer momento
            </p>
          </div>
        </div>
    );
  }

  if (perguntaAtual) {
    return renderShell(
        <form
          key={perguntaAtual.id}
          onSubmit={(e) => {
            e.preventDefault();
            avancar();
          }}
          className="max-w-2xl w-full space-y-8 animate-in fade-in slide-in-from-bottom-3 duration-300"
        >
          <input
            type="text"
            value={honey}
            onChange={(e) => setHoney(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            aria-hidden
          />

          <div className="flex items-start gap-3">
            <span className="text-sm font-semibold tabular-nums shrink-0 mt-2" style={{ color: cor }}>
              {step}.
            </span>
            <div className="space-y-2 flex-1">
              <Label className="text-2xl sm:text-3xl font-semibold leading-snug block">
                {perguntaAtual.enunciado}
                {perguntaAtual.obrigatorio && <span className="text-destructive ml-1">*</span>}
              </Label>
              {perguntaAtual.descricao && (
                <p className="text-sm text-muted-foreground">{perguntaAtual.descricao}</p>
              )}
            </div>
          </div>

          <div className="pl-7">{renderInputBig(perguntaAtual, valores, setValores, cor)}</div>

          <div className="flex items-center justify-between pl-7 pt-4">
            <Button type="button" variant="ghost" onClick={voltar} disabled={step <= 1} className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                size="lg"
                disabled={enviar.isPending}
                className="rounded-full px-7 shadow-md hover:shadow-lg gap-2"
                style={{ backgroundColor: cor, color: "white" }}
              >
                {step >= total ? (enviar.isPending ? "Enviando..." : "Enviar") : "OK"}
                <CornerDownLeft className="h-4 w-4" />
              </Button>
              {step < total && (
                <span className="hidden sm:inline text-xs text-muted-foreground">
                  pressione{" "}
                  <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">Enter</kbd>
                </span>
              )}
            </div>
          </div>
        </form>
    );
  }

  return renderShell(<div />);
}

function renderInputBig(
  p: any,
  valores: Record<string, any>,
  setValores: (v: any) => void,
  cor: string
) {
  const v = valores[p.id] ?? (p.tipo === "checkbox" ? [] : "");
  const set = (val: any) => setValores({ ...valores, [p.id]: val });
  const underline =
    "w-full bg-transparent border-0 border-b-2 border-muted-foreground/30 rounded-none px-0 text-xl sm:text-2xl py-3 focus-visible:ring-0 transition-colors h-auto";
  const focusStyle = { caretColor: cor } as React.CSSProperties;

  switch (p.tipo) {
    case "texto_longo":
      return (
        <Textarea
          autoFocus
          value={v}
          onChange={(e) => set(e.target.value)}
          rows={4}
          placeholder="Sua resposta..."
          className="text-lg rounded-xl border-2 focus-visible:ring-2"
          style={{ ...focusStyle, borderColor: `${cor}33` }}
        />
      );
    case "numero":
      return (
        <Input
          autoFocus
          type="number"
          value={v}
          onChange={(e) => set(e.target.value)}
          placeholder="Digite um número..."
          className={underline}
          style={{ ...focusStyle, borderBottomColor: v ? cor : undefined }}
        />
      );
    case "data":
      return (
        <Input
          autoFocus
          type="date"
          value={v}
          onChange={(e) => set(e.target.value)}
          className={underline}
          style={focusStyle}
        />
      );
    case "email":
      return (
        <Input
          autoFocus
          type="email"
          value={v}
          onChange={(e) => set(e.target.value)}
          placeholder="nome@email.com"
          className={underline}
          style={{ ...focusStyle, borderBottomColor: v ? cor : undefined }}
        />
      );
    case "telefone":
      return (
        <Input
          autoFocus
          type="tel"
          value={v}
          onChange={(e) => set(e.target.value)}
          placeholder="(00) 00000-0000"
          className={underline}
          style={{ ...focusStyle, borderBottomColor: v ? cor : undefined }}
        />
      );
    case "radio":
      return (
        <RadioGroup value={v} onValueChange={set} className="space-y-2">
          {(p.opcoes || []).map((o: string, i: number) => {
            const selected = v === o;
            return (
              <label
                key={i}
                htmlFor={`${p.id}-${i}`}
                className="flex items-center gap-3 rounded-xl border-2 px-4 py-3 cursor-pointer transition-all hover:bg-muted/40"
                style={{
                  borderColor: selected ? cor : "hsl(var(--border))",
                  backgroundColor: selected ? `${cor}10` : undefined,
                }}
              >
                <span
                  className="h-7 w-7 rounded-md border-2 flex items-center justify-center text-xs font-bold shrink-0 bg-white"
                  style={{
                    borderColor: selected ? cor : "hsl(var(--border))",
                    color: cor,
                  }}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <RadioGroupItem value={o} id={`${p.id}-${i}`} className="sr-only" />
                <span className="text-base flex-1">{o}</span>
              </label>
            );
          })}
        </RadioGroup>
      );
    case "checkbox": {
      const arr: string[] = Array.isArray(v) ? v : [];
      return (
        <div className="space-y-2">
          {(p.opcoes || []).map((o: string, i: number) => {
            const selected = arr.includes(o);
            return (
              <label
                key={i}
                className="flex items-center gap-3 rounded-xl border-2 px-4 py-3 cursor-pointer transition-all hover:bg-muted/40"
                style={{
                  borderColor: selected ? cor : "hsl(var(--border))",
                  backgroundColor: selected ? `${cor}10` : undefined,
                }}
              >
                <Checkbox
                  checked={selected}
                  onCheckedChange={(c) =>
                    set(c ? [...arr, o] : arr.filter((x) => x !== o))
                  }
                />
                <span className="text-base flex-1">{o}</span>
              </label>
            );
          })}
        </div>
      );
    }
    case "dropdown":
      return (
        <Select value={v} onValueChange={set}>
          <SelectTrigger className="text-lg h-12 rounded-xl">
            <SelectValue placeholder="Selecione..." />
          </SelectTrigger>
          <SelectContent>
            {(p.opcoes || []).map((o: string, i: number) => (
              <SelectItem key={i} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    default:
      return (
        <Input
          autoFocus
          value={v}
          onChange={(e) => set(e.target.value)}
          placeholder="Digite aqui..."
          className={underline}
          style={{ ...focusStyle, borderBottomColor: v ? cor : undefined }}
        />
      );
  }
}