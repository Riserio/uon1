import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { CheckCircle2, Download } from "lucide-react";
import { maskCEP, maskCNPJ, maskCPF, maskPlaca, maskTelefone, maskMoeda, maskCidade, maskDia, maskMes } from "./masks";
import { ESTADOS_BR } from "./estados";
import { baixarRespostasPDF } from "./pdfExport";

export default function FormularioGoogleForms({ form }: { form: any }) {
  const [valores, setValores] = useState<Record<string, any>>({});
  const [honey, setHoney] = useState("");
  const [enviado, setEnviado] = useState(false);

  const perguntas = useMemo(
    () => [...((form?.formulario_perguntas as any[]) || [])].sort((a, b) => a.ordem - b.ordem),
    [form],
  );
  const cor = form?.cor_tema || "#362C89";

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

  if (enviado) {
    return (
      <div className="min-h-screen bg-muted/20 px-4 py-10">
        <Card className="max-w-2xl mx-auto rounded-2xl border-t-8" style={{ borderTopColor: cor }}>
          <CardContent className="p-10 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 mx-auto" style={{ color: cor }} />
            <h1 className="text-2xl font-bold">Obrigado!</h1>
            <p className="text-muted-foreground">
              {(form.config as any)?.mensagem_agradecimento || "Resposta enviada com sucesso!"}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
              <Button
                className="gap-2"
                style={{ backgroundColor: cor, color: "white" }}
                onClick={async () => {
                  try {
                    await baixarRespostasPDF(form, valores, perguntas);
                  } catch (e) {
                    console.error("Erro ao gerar PDF:", e);
                    toast.error("Não foi possível gerar o PDF");
                  }
                }}
              >
                <Download className="h-4 w-4" /> Baixar PDF das respostas
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setValores({});
                  setEnviado(false);
                }}
              >
                Enviar outra resposta
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <Card className="rounded-2xl border-t-8" style={{ borderTopColor: cor }}>
          <CardContent className="p-8 space-y-3">
            <div className="flex items-center gap-3 mb-2">
              <img src="/images/vangard-logo.png" alt="Vangard" className="h-8 object-contain" />
              {form?.logo_url && (
                <>
                  <span className="h-7 w-px bg-border" aria-hidden />
                  <img src={form.logo_url} alt="Parceiro" className="h-8 object-contain" />
                </>
              )}
            </div>
            <h1 className="text-3xl font-bold">{form.titulo}</h1>
            {form.descricao && <p className="text-muted-foreground">{form.descricao}</p>}
          </CardContent>
        </Card>

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
          {perguntas.map((p, i) => (
            <Card key={p.id} className="rounded-2xl">
              <CardContent className="p-6 space-y-3">
                <Label className="text-base font-medium leading-snug block">
                  <span className="text-muted-foreground mr-2">{i + 1}.</span>
                  {p.enunciado}
                  {p.obrigatorio && <span className="text-destructive ml-1">*</span>}
                </Label>
                {p.descricao && <p className="text-sm text-muted-foreground">{p.descricao}</p>}
                {renderCampo(p, valores, setValores, cor)}
              </CardContent>
            </Card>
          ))}

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={enviar.isPending}
              className="rounded-md px-6"
              style={{ backgroundColor: cor, color: "white" }}
            >
              {enviar.isPending ? "Enviando..." : "Enviar"}
            </Button>
          </div>
        </form>

        <p className="text-center text-[11px] text-muted-foreground py-4">
          Processado pela plataforma <span className="font-medium">Uon1</span>
        </p>
      </div>
    </div>
  );
}

function renderCampo(
  p: any,
  valores: Record<string, any>,
  setValores: (v: any) => void,
  cor: string,
) {
  const v = valores[p.id] ?? (p.tipo === "checkbox" ? [] : "");
  const set = (val: any) => setValores({ ...valores, [p.id]: val });

  switch (p.tipo) {
    case "texto_longo":
      return <Textarea value={v} onChange={(e) => set(e.target.value)} rows={3} />;
    case "numero":
      return <Input type="number" value={v} onChange={(e) => set(e.target.value)} />;
    case "data":
      return <Input type="date" value={v} onChange={(e) => set(e.target.value)} />;
    case "email":
      return <Input type="email" value={v} onChange={(e) => set(e.target.value)} placeholder="nome@email.com" />;
    case "telefone":
      return <Input type="tel" value={v} onChange={(e) => set(maskTelefone(e.target.value))} placeholder="(00) 00000-0000" />;
    case "placa":
      return <Input value={v} onChange={(e) => set(maskPlaca(e.target.value))} placeholder="ABC-1D23" maxLength={8} className="uppercase tracking-widest" />;
    case "cpf":
      return <Input inputMode="numeric" value={v} onChange={(e) => set(maskCPF(e.target.value))} placeholder="000.000.000-00" maxLength={14} />;
    case "cnpj":
      return <Input inputMode="numeric" value={v} onChange={(e) => set(maskCNPJ(e.target.value))} placeholder="00.000.000/0000-00" maxLength={18} />;
    case "cep":
      return <Input inputMode="numeric" value={v} onChange={(e) => set(maskCEP(e.target.value))} placeholder="00000-000" maxLength={9} />;
    case "moeda":
      return <Input inputMode="numeric" value={v} onChange={(e) => set(maskMoeda(e.target.value))} placeholder="R$ 0,00" />;
    case "cidade":
      return <Input value={v} onChange={(e) => set(maskCidade(e.target.value))} placeholder="Cidade" />;
    case "dia":
      return <Input inputMode="numeric" value={v} onChange={(e) => set(maskDia(e.target.value))} placeholder="DD" maxLength={2} />;
    case "mes":
      return <Input inputMode="numeric" value={v} onChange={(e) => set(maskMes(e.target.value))} placeholder="MM" maxLength={2} />;
    case "estado":
      return (
        <Select value={v} onValueChange={set}>
          <SelectTrigger><SelectValue placeholder="Selecione o estado..." /></SelectTrigger>
          <SelectContent>
            {ESTADOS_BR.map((e) => (<SelectItem key={e.sigla} value={e.sigla}>{e.sigla} — {e.nome}</SelectItem>))}
          </SelectContent>
        </Select>
      );
    case "radio":
      return (
        <RadioGroup value={v} onValueChange={set} className="space-y-1">
          {(p.opcoes || []).map((o: string, i: number) => (
            <label key={i} className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value={o} id={`${p.id}-${i}`} style={{ borderColor: cor }} />
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
                <Checkbox checked={selected} onCheckedChange={(c) => set(c ? [...arr, o] : arr.filter((x) => x !== o))} />
                <span className="text-sm">{o}</span>
              </label>
            );
          })}
        </div>
      );
    }
    case "dropdown":
      return (
        <Select value={v} onValueChange={set}>
          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
          <SelectContent>
            {(p.opcoes || []).map((o: string, i: number) => (<SelectItem key={i} value={o}>{o}</SelectItem>))}
          </SelectContent>
        </Select>
      );
    default:
      return <Input value={v} onChange={(e) => set(e.target.value)} />;
  }
}