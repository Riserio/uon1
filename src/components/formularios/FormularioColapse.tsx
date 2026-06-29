import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, Shield } from "lucide-react";
import { maskCEP, maskCNPJ, maskCPF, maskPlaca, maskTelefone } from "./masks";

/**
 * Colapse style (antigo "sinistro"): cabeçalho fixo Vangard + perguntas dinâmicas
 * agrupadas por cards de seção (tipo "secao" = divisor visual).
 */
export default function FormularioColapse({ form }: { form: any }) {
  const [valores, setValores] = useState<Record<string, any>>({});
  const [honey, setHoney] = useState("");
  const [enviado, setEnviado] = useState(false);

  const perguntas = useMemo(
    () =>
      [...((form?.formulario_perguntas as any[]) || [])].sort(
        (a, b) => a.ordem - b.ordem,
      ),
    [form],
  );

  // Agrupa perguntas em "blocos" delimitados por perguntas tipo "secao".
  const blocos = useMemo(() => {
    const out: { titulo: string | null; descricao: string | null; itens: any[] }[] = [
      { titulo: null, descricao: null, itens: [] },
    ];
    for (const p of perguntas) {
      if (p.tipo === "secao") {
        out.push({ titulo: p.enunciado, descricao: p.descricao || null, itens: [] });
      } else {
        out[out.length - 1].itens.push(p);
      }
    }
    return out.filter((b, i) => i === 0 || b.itens.length > 0 || b.titulo);
  }, [perguntas]);

  const totalCampos = perguntas.filter((p) => p.tipo !== "secao").length;
  const respondidos = perguntas.filter((p) => {
    if (p.tipo === "secao") return false;
    const v = valores[p.id];
    return !(v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0));
  }).length;
  const progresso = totalCampos > 0 ? Math.round((respondidos / totalCampos) * 100) : 0;

  const enviar = useMutation({
    mutationFn: async () => {
      if (honey) return;
      for (const p of perguntas) {
        if (p.tipo === "secao") continue;
        if (p.obrigatorio) {
          const v = valores[p.id];
          const vazio =
            v === undefined ||
            v === null ||
            v === "" ||
            (Array.isArray(v) && v.length === 0);
          if (vazio) throw new Error(`"${p.enunciado}" é obrigatória`);
        }
      }
      const { error } = await supabase.from("formulario_respostas").insert({
        formulario_id: form.id,
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

  const headerLogo = form?.logo_url || "/images/vangard-logo.png";
  const headerTitulo = form?.titulo || "Formulário";

  if (enviado) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-stone-200 p-10 text-center space-y-4">
          <CheckCircle2 className="h-14 w-14 mx-auto text-green-600" />
          <h1 className="text-2xl font-bold">Resposta enviada</h1>
          <p className="text-sm text-stone-600">
            {(form.config as any)?.mensagem_agradecimento || "Recebemos suas informações."}
          </p>
          <Button
            onClick={() => {
              setValores({});
              setEnviado(false);
            }}
            className="rounded-md bg-stone-900 hover:bg-stone-700"
          >
            Enviar nova resposta
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-[14px] text-stone-800">
      <header className="sticky top-0 z-50 bg-stone-900 text-white">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={headerLogo}
              alt="Vangard"
              className="h-9 object-contain bg-white/95 rounded-md px-2 py-1"
            />
            <div className="min-w-0">
              <div className="font-semibold text-base truncate">{headerTitulo}</div>
              <div className="text-[11px] text-stone-300 truncate flex items-center gap-1">
                <Shield className="h-3 w-3" /> Vangard Gestora
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-stone-400">
              Progresso
            </div>
            <div className="text-xl font-bold tabular-nums">{progresso}%</div>
          </div>
        </div>
        <Progress value={progresso} className="h-[3px] rounded-none bg-stone-800" />
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {form.descricao && (
          <section className="bg-white border border-stone-200 rounded-xl p-5">
            <p className="text-sm text-stone-600 whitespace-pre-wrap">{form.descricao}</p>
          </section>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar.mutate();
          }}
          className="space-y-4"
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

          {blocos.map((b, bi) => (
            <section
              key={bi}
              className="bg-white border border-stone-200 rounded-xl overflow-hidden"
            >
              {b.titulo && (
                <div className="px-5 py-3 bg-stone-900 text-white">
                  <div className="font-semibold text-sm uppercase tracking-wide">
                    {b.titulo}
                  </div>
                  {b.descricao && (
                    <div className="text-[11px] text-stone-300 mt-0.5">{b.descricao}</div>
                  )}
                </div>
              )}
              {b.itens.length > 0 && (
                <div className="p-5 grid sm:grid-cols-2 gap-4">
                  {b.itens.map((p) => (
                    <CampoColapse
                      key={p.id}
                      p={p}
                      valor={valores[p.id]}
                      setValor={(v) => setValores((prev) => ({ ...prev, [p.id]: v }))}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={enviar.isPending}
              className="bg-stone-900 hover:bg-stone-700 text-white rounded-md px-6"
            >
              {enviar.isPending ? "Enviando..." : "Enviar"}
            </Button>
          </div>
        </form>

        <footer className="text-center text-[11px] text-stone-500 py-6">
          Processado pela plataforma <span className="font-medium">Uon1</span> · Vangard
        </footer>
      </main>
    </div>
  );
}

function CampoColapse({
  p,
  valor,
  setValor,
}: {
  p: any;
  valor: any;
  setValor: (v: any) => void;
}) {
  const fullWidth = p.tipo === "texto_longo" || p.tipo === "checkbox" || p.tipo === "radio";
  const v = valor ?? (p.tipo === "checkbox" ? [] : "");
  const inner = (() => {
    switch (p.tipo) {
      case "texto_longo":
        return <Textarea value={v} onChange={(e) => setValor(e.target.value)} rows={3} />;
      case "numero":
        return <Input type="number" value={v} onChange={(e) => setValor(e.target.value)} />;
      case "data":
        return <Input type="date" value={v} onChange={(e) => setValor(e.target.value)} />;
      case "email":
        return <Input type="email" value={v} onChange={(e) => setValor(e.target.value)} placeholder="nome@email.com" />;
      case "telefone":
        return <Input type="tel" value={v} onChange={(e) => setValor(maskTelefone(e.target.value))} placeholder="(00) 00000-0000" />;
      case "placa":
        return <Input value={v} onChange={(e) => setValor(maskPlaca(e.target.value))} placeholder="ABC-1D23" maxLength={8} className="uppercase tracking-widest" />;
      case "cpf":
        return <Input inputMode="numeric" value={v} onChange={(e) => setValor(maskCPF(e.target.value))} placeholder="000.000.000-00" maxLength={14} />;
      case "cnpj":
        return <Input inputMode="numeric" value={v} onChange={(e) => setValor(maskCNPJ(e.target.value))} placeholder="00.000.000/0000-00" maxLength={18} />;
      case "cep":
        return <Input inputMode="numeric" value={v} onChange={(e) => setValor(maskCEP(e.target.value))} placeholder="00000-000" maxLength={9} />;
      case "radio":
        return (
          <RadioGroup value={v} onValueChange={setValor} className="flex flex-wrap gap-3">
            {(p.opcoes || []).map((o: string, i: number) => (
              <label key={i} className="flex items-center gap-2 cursor-pointer bg-stone-50 border border-stone-200 rounded-md px-3 py-1.5">
                <RadioGroupItem value={o} id={`${p.id}-${i}`} />
                <span className="text-sm">{o}</span>
              </label>
            ))}
          </RadioGroup>
        );
      case "checkbox": {
        const arr: string[] = Array.isArray(v) ? v : [];
        return (
          <div className="space-y-1">
            {(p.opcoes || []).map((o: string, i: number) => {
              const selected = arr.includes(o);
              return (
                <label key={i} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={(c) =>
                      setValor(c ? [...arr, o] : arr.filter((x) => x !== o))
                    }
                  />
                  <span className="text-sm">{o}</span>
                </label>
              );
            })}
          </div>
        );
      }
      case "dropdown":
        return (
          <Select value={v} onValueChange={setValor}>
            <SelectTrigger className="bg-white">
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
        return <Input value={v} onChange={(e) => setValor(e.target.value)} />;
    }
  })();
  return (
    <div className={fullWidth ? "sm:col-span-2 space-y-1.5" : "space-y-1.5"}>
      <Label className="text-xs font-medium text-stone-700 flex items-center gap-1">
        {p.enunciado}
        {p.obrigatorio && <span className="text-red-600">*</span>}
      </Label>
      {p.descricao && <p className="text-[11px] text-stone-500 -mt-1">{p.descricao}</p>}
      {inner}
    </div>
  );
}