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
import { CheckCircle2 } from "lucide-react";

export default function FormularioPublico() {
  const { slug } = useParams<{ slug: string }>();
  const [valores, setValores] = useState<Record<string, any>>({});
  const [honey, setHoney] = useState("");
  const [enviado, setEnviado] = useState(false);

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

  useEffect(() => {
    if (form?.titulo) document.title = form.titulo;
  }, [form]);

  const enviar = useMutation({
    mutationFn: async () => {
      if (honey) return; // bot
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

  if (enviado) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{
          background: `linear-gradient(135deg, ${cor}11 0%, ${cor}05 100%)`,
        }}
      >
        <Card className="max-w-lg w-full rounded-2xl">
          <CardContent className="p-10 text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 mx-auto" style={{ color: cor }} />
            <h1 className="text-2xl font-bold">{form.titulo}</h1>
            <p className="text-muted-foreground">
              {(form.config as any)?.mensagem_agradecimento ||
                "Resposta enviada com sucesso!"}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setValores({});
                setEnviado(false);
              }}
            >
              Enviar outra resposta
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen py-10 px-4"
      style={{ background: `linear-gradient(135deg, ${cor}11 0%, ${cor}05 100%)` }}
    >
      <div className="max-w-2xl mx-auto space-y-4">
        <Card className="rounded-2xl overflow-hidden">
          <div className="h-2" style={{ backgroundColor: cor }} />
          <CardContent className="p-6 space-y-2">
            {form.logo_url && (
              <img src={form.logo_url} alt="" className="h-12 mb-2 object-contain" />
            )}
            <h1 className="text-2xl font-bold">{form.titulo}</h1>
            {form.descricao && (
              <p className="text-muted-foreground text-sm">{form.descricao}</p>
            )}
            <p className="text-xs text-destructive">* Indica pergunta obrigatória</p>
          </CardContent>
        </Card>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar.mutate();
          }}
          className="space-y-4"
        >
          {/* honeypot */}
          <input
            type="text"
            value={honey}
            onChange={(e) => setHoney(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            aria-hidden
          />

          {perguntas.map((p: any) => (
            <Card key={p.id} className="rounded-2xl">
              <CardContent className="p-5 space-y-3">
                <Label className="text-base font-medium">
                  {p.enunciado}
                  {p.obrigatorio && <span className="text-destructive ml-1">*</span>}
                </Label>
                {p.descricao && (
                  <p className="text-xs text-muted-foreground -mt-2">{p.descricao}</p>
                )}
                {renderInput(p, valores, setValores)}
              </CardContent>
            </Card>
          ))}

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              size="lg"
              disabled={enviar.isPending}
              style={{ backgroundColor: cor, color: "white" }}
            >
              {enviar.isPending ? "Enviando..." : "Enviar"}
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground pt-4">
            Este formulário é processado pela plataforma Uon1.
          </p>
        </form>
      </div>
    </div>
  );
}

function renderInput(
  p: any,
  valores: Record<string, any>,
  setValores: (v: any) => void
) {
  const v = valores[p.id] ?? (p.tipo === "checkbox" ? [] : "");
  const set = (val: any) => setValores({ ...valores, [p.id]: val });
  switch (p.tipo) {
    case "texto_longo":
      return <Textarea value={v} onChange={(e) => set(e.target.value)} rows={4} />;
    case "numero":
      return <Input type="number" value={v} onChange={(e) => set(e.target.value)} />;
    case "data":
      return <Input type="date" value={v} onChange={(e) => set(e.target.value)} />;
    case "email":
      return <Input type="email" value={v} onChange={(e) => set(e.target.value)} />;
    case "telefone":
      return <Input type="tel" value={v} onChange={(e) => set(e.target.value)} />;
    case "radio":
      return (
        <RadioGroup value={v} onValueChange={set}>
          {(p.opcoes || []).map((o: string, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <RadioGroupItem value={o} id={`${p.id}-${i}`} />
              <Label htmlFor={`${p.id}-${i}`} className="font-normal cursor-pointer">
                {o}
              </Label>
            </div>
          ))}
        </RadioGroup>
      );
    case "checkbox": {
      const arr: string[] = Array.isArray(v) ? v : [];
      return (
        <div className="space-y-2">
          {(p.opcoes || []).map((o: string, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <Checkbox
                id={`${p.id}-${i}`}
                checked={arr.includes(o)}
                onCheckedChange={(c) =>
                  set(c ? [...arr, o] : arr.filter((x) => x !== o))
                }
              />
              <Label htmlFor={`${p.id}-${i}`} className="font-normal cursor-pointer">
                {o}
              </Label>
            </div>
          ))}
        </div>
      );
    }
    case "dropdown":
      return (
        <Select value={v} onValueChange={set}>
          <SelectTrigger>
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
      return <Input value={v} onChange={(e) => set(e.target.value)} />;
  }
}