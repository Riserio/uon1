import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

interface Dossie {
  corretora_id: string;
  corretora_nome: string | null;
  encontrado: boolean;
  erro: string | null;
  cadastro: any[];
  associado: any[];
  boletos: any[];
  mgf: any[];
  eventos: any[];
}

/**
 * Consulta on-demand por placa/CPF em TODAS as associações com API Hinova ativa.
 * Não persiste nada — só exibe o dossiê em tempo real.
 */
export default function ConsultaAssociado() {
  const [placa, setPlaca] = useState("");
  const [cpf, setCpf] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    associacoes_consultadas: number;
    associacoes_com_dados: number;
    dossies: Dossie[];
  } | null>(null);

  const buscar = async () => {
    if (!placa && !cpf) {
      toast.error("Informe placa ou CPF");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("consultar-associado-hinova", {
        body: { placa, cpf },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Falha na consulta");
      setResult(data);
      if (data.associacoes_com_dados === 0) toast.info("Nenhum resultado encontrado");
    } catch (e: any) {
      toast.error(e.message || "Erro na consulta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Consulta de Associado / Veículo</h1>
        <p className="text-sm text-muted-foreground">
          Busca em tempo real em todas as associações com API Hinova ativa. Nenhum dado é armazenado.
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="pt-6 flex flex-col sm:flex-row gap-3">
          <Input placeholder="Placa (ex: ABC1D23)" value={placa} onChange={(e) => setPlaca(e.target.value)} className="rounded-xl" />
          <Input placeholder="CPF (somente números)" value={cpf} onChange={(e) => setCpf(e.target.value)} className="rounded-xl" />
          <Button onClick={buscar} disabled={loading} className="gap-2 rounded-xl">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar
          </Button>
        </CardContent>
      </Card>

      {result && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {result.associacoes_com_dados} de {result.associacoes_consultadas} associação(ões) com resultado.
          </p>
          {result.dossies
            .filter((d) => d.encontrado || d.erro)
            .map((d) => (
              <Card key={d.corretora_id} className="rounded-2xl bg-muted/40 backdrop-blur">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{d.corretora_nome || d.corretora_id}</span>
                    {d.erro ? (
                      <Badge variant="destructive">Erro</Badge>
                    ) : (
                      <div className="flex gap-2 flex-wrap">
                        <Badge variant="secondary">Cadastro: {d.cadastro.length}</Badge>
                        <Badge variant="secondary">Associado: {d.associado.length}</Badge>
                        <Badge variant="secondary">Boletos: {d.boletos.length}</Badge>
                        <Badge variant="secondary">MGF: {d.mgf.length}</Badge>
                        <Badge variant="secondary">Eventos/Vistorias: {d.eventos.length}</Badge>
                      </div>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {d.erro && <p className="text-destructive">{d.erro}</p>}
                  {d.cadastro.length > 0 && (
                    <Bloco titulo="Cadastro / Veículo" itens={d.cadastro} />
                  )}
                  {d.associado.length > 0 && (
                    <Bloco titulo="Associado" itens={d.associado} />
                  )}
                  {d.boletos.length > 0 && (
                    <Bloco titulo="Boletos / Cobrança" itens={d.boletos} />
                  )}
                  {d.mgf.length > 0 && (
                    <Bloco titulo="Lançamentos Financeiros (MGF)" itens={d.mgf} />
                  )}
                  {d.eventos.length > 0 && (
                    <Bloco titulo="Eventos SGA / Vistorias" itens={d.eventos} />
                  )}
                </CardContent>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}

function Bloco({ titulo, itens }: { titulo: string; itens: any[] }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="border rounded-xl p-3">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center justify-between font-medium"
      >
        <span>{titulo} ({itens.length})</span>
        <span className="text-xs text-muted-foreground">{aberto ? "ocultar" : "ver detalhes"}</span>
      </button>
      {aberto && (
        <pre className="mt-2 max-h-96 overflow-auto text-xs bg-background/60 p-2 rounded-lg">
          {JSON.stringify(itens, null, 2)}
        </pre>
      )}
    </div>
  );
}