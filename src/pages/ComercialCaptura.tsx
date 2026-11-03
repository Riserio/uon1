import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MaskedInput } from "@/components/ui/masked-input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FunilPublico {
  nome: string;
  descricao: string | null;
  produtos: string[];
  vendedor: string | null;
}

/**
 * Cadastro rápido aberto pelo QR code do vendedor: /c/:funil/:vendedor.
 * Sem login. Lê e grava só por RPC (comercial_funil_publico / comercial_registrar_lead_publico).
 */
export default function ComercialCaptura() {
  const { funil: funilSlug, vendedor } = useParams<{ funil: string; vendedor?: string }>();
  const [nome, setNome] = useState("");
  const [associacao, setAssociacao] = useState("");
  const [cargo, setCargo] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [indicacao, setIndicacao] = useState<"sim" | "nao" | "">("");
  const [indicador, setIndicador] = useState("");
  const [produto, setProduto] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["comercial_funil_publico", funilSlug, vendedor],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("comercial_funil_publico", {
        p_funil_slug: funilSlug,
        p_vendedor_codigo: vendedor ?? null,
      });
      if (error) throw error;
      return data as FunilPublico | null;
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (data?.nome) document.title = data.nome;
  }, [data?.nome]);

  const enviar = useMutation({
    mutationFn: async () => {
      if (nome.trim().length < 2) throw new Error("Informe seu nome");
      if (whatsapp.length < 10) throw new Error("Informe seu WhatsApp com DDD");
      if (!indicacao) throw new Error("Informe se veio por indicação");
      if (indicacao === "sim" && !indicador.trim()) throw new Error("Informe o nome de quem indicou");
      const { error } = await (supabase as any).rpc("comercial_registrar_lead_publico", {
        p_funil_slug: funilSlug,
        p_vendedor_codigo: vendedor ?? null,
        p_nome: nome,
        p_associacao: associacao,
        p_cargo: cargo,
        p_whatsapp: whatsapp,
        p_indicacao_externa: indicacao === "sim",
        p_indicador_nome: indicacao === "sim" ? indicador : null,
        p_produto: produto || null,
      });
      if (error) throw new Error(error.message);
    },
    onMutate: () => setErro(null),
    onError: (e: any) => setErro(e.message),
  });

  const novoCadastro = () => {
    setNome("");
    setAssociacao("");
    setCargo("");
    setWhatsapp("");
    setIndicacao("");
    setIndicador("");
    setProduto("");
    enviar.reset();
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando…</div>;
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-bold">Cadastro indisponível</h1>
          <p className="text-sm text-muted-foreground mt-1">Este link não existe ou foi desativado.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-md space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{data.nome}</h1>
          {data.descricao && <p className="text-sm text-muted-foreground">{data.descricao}</p>}
          {data.vendedor && (
            <p className="text-xs text-muted-foreground">
              Atendimento: <b className="text-foreground">{data.vendedor}</b>
            </p>
          )}
        </div>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            {enviar.isSuccess ? (
              <div className="py-8 text-center space-y-3">
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-600" />
                <h2 className="text-lg font-semibold">Cadastro recebido!</h2>
                <p className="text-sm text-muted-foreground">
                  {data.vendedor ? `${data.vendedor} vai entrar em contato pelo WhatsApp.` : "Nossa equipe vai entrar em contato pelo WhatsApp."}
                </p>
                <Button variant="outline" onClick={novoCadastro}>
                  Fazer outro cadastro
                </Button>
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  enviar.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" maxLength={150} />
                </div>
                <div className="space-y-2">
                  <Label>Nome da associação</Label>
                  <Input value={associacao} onChange={(e) => setAssociacao(e.target.value)} autoComplete="organization" maxLength={200} />
                </div>
                <div className="space-y-2">
                  <Label>Cargo</Label>
                  <Input value={cargo} onChange={(e) => setCargo(e.target.value)} autoComplete="organization-title" maxLength={120} />
                </div>
                <div className="space-y-2">
                  <Label>WhatsApp *</Label>
                  <MaskedInput
                    format="(##) #####-####"
                    placeholder="(31) 99999-9999"
                    value={whatsapp}
                    onValueChange={(v) => setWhatsapp(v.value)}
                    inputMode="tel"
                    autoComplete="tel-national"
                  />
                </div>
                {data.produtos.length > 0 && (
                  <div className="space-y-2">
                    <Label>Produto de interesse</Label>
                    <Select value={produto} onValueChange={setProduto}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {data.produtos.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Chegou até nós por indicação de alguém? *</Label>
                  <RadioGroup className="flex gap-6 pt-1" value={indicacao} onValueChange={(v) => setIndicacao(v as "sim" | "nao")}>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <RadioGroupItem value="sim" /> Sim
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <RadioGroupItem value="nao" /> Não
                    </label>
                  </RadioGroup>
                </div>
                {indicacao === "sim" && (
                  <div className="space-y-2">
                    <Label>Nome de quem indicou *</Label>
                    <Input value={indicador} onChange={(e) => setIndicador(e.target.value)} maxLength={150} />
                  </div>
                )}
                {erro && <p className="text-sm text-destructive">{erro}</p>}
                <Button type="submit" className="w-full" disabled={enviar.isPending}>
                  {enviar.isPending ? "Enviando…" : "Enviar cadastro"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
