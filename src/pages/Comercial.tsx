import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Settings2, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComercialKanban } from "@/components/comercial/ComercialKanban";
import { LeadDialog } from "@/components/comercial/LeadDialog";
import { VendedoresTab } from "@/components/comercial/VendedoresTab";
import { FunilConfigDialog } from "@/components/comercial/FunilConfigDialog";
import type { ComercialEtapa, ComercialFunil, ComercialLead, ComercialVendedor } from "@/components/comercial/types";
import { somenteDigitos } from "@/components/comercial/utils";

const TODOS = "__todos__";
const SEM_VENDEDOR = "__sem__";
const CHAVE_FUNIL = "comercial_funil_selecionado";

export default function Comercial() {
  const [funilId, setFunilId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CHAVE_FUNIL);
    } catch {
      return null;
    }
  });
  const [busca, setBusca] = useState("");
  const [filtroVendedor, setFiltroVendedor] = useState(TODOS);
  const [filtroProduto, setFiltroProduto] = useState(TODOS);
  const [leadAberto, setLeadAberto] = useState<{ lead: ComercialLead | null; etapaId?: string } | null>(null);
  const [config, setConfig] = useState<"editar" | "novo" | null>(null);

  const { data: funis = [], isLoading: carregandoFunis } = useQuery({
    queryKey: ["comercial_funis"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("comercial_funis").select("*").order("created_at");
      if (error) throw error;
      return data as ComercialFunil[];
    },
  });

  // Funil salvo não existe mais (ou primeiro acesso): cai no primeiro ativo.
  useEffect(() => {
    if (funis.length === 0) return;
    if (!funilId || !funis.some((f) => f.id === funilId)) {
      setFunilId((funis.find((f) => f.ativo) ?? funis[0]).id);
    }
  }, [funis, funilId]);

  useEffect(() => {
    if (!funilId) return;
    try {
      localStorage.setItem(CHAVE_FUNIL, funilId);
    } catch {
      /* storage indisponível */
    }
  }, [funilId]);

  const funil = funis.find((f) => f.id === funilId) ?? null;

  const { data: etapas = [] } = useQuery({
    queryKey: ["comercial_etapas", funilId],
    enabled: !!funilId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("comercial_etapas")
        .select("*")
        .eq("funil_id", funilId)
        .order("ordem");
      if (error) throw error;
      return data as ComercialEtapa[];
    },
  });

  const { data: vendedores = [] } = useQuery({
    queryKey: ["comercial_vendedores"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("comercial_vendedores").select("*").order("nome");
      if (error) throw error;
      return data as ComercialVendedor[];
    },
  });

  // Atualiza a cada minuto e ao voltar para a aba — pega os leads que chegam pelo QR
  // sem manter canal realtime aberto.
  const { data: leads = [] } = useQuery({
    queryKey: ["comercial_leads", funilId],
    enabled: !!funilId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("comercial_leads")
        .select("*")
        .eq("funil_id", funilId)
        .order("etapa_alterada_em", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data as ComercialLead[];
    },
  });

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoDigitos = somenteDigitos(busca);
    return leads.filter((l) => {
      if (filtroVendedor === SEM_VENDEDOR && l.vendedor_id) return false;
      if (filtroVendedor !== TODOS && filtroVendedor !== SEM_VENDEDOR && l.vendedor_id !== filtroVendedor) return false;
      if (filtroProduto !== TODOS && l.produto !== filtroProduto) return false;
      if (!termo) return true;
      const texto = [l.nome, l.associacao, l.cargo, l.indicador_nome, l.observacoes].filter(Boolean).join(" ").toLowerCase();
      return texto.includes(termo) || (termoDigitos.length >= 4 && (l.whatsapp || "").includes(termoDigitos));
    });
  }, [leads, busca, filtroVendedor, filtroProduto]);

  const tipoEtapa = new Map(etapas.map((e) => [e.id, e.tipo]));
  const ganhoIds = new Set(etapas.filter((e) => e.tipo === "ganho").map((e) => e.id));
  const resumo = {
    andamento: filtrados.filter((l) => tipoEtapa.get(l.etapa_id) === "aberta").length,
    ganhos: filtrados.filter((l) => tipoEtapa.get(l.etapa_id) === "ganho").length,
    perdidos: filtrados.filter((l) => tipoEtapa.get(l.etapa_id) === "perdido").length,
  };
  const finalizados = resumo.ganhos + resumo.perdidos;
  const conversao = finalizados > 0 ? (resumo.ganhos / finalizados) * 100 : null;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <PageHeader
        icon={Target}
        title="Comercial"
        subtitle="Funis de vendas, follow-up de leads e QR code dos vendedores."
        actions={
          <>
            {funis.length > 0 && (
              <Select value={funilId ?? undefined} onValueChange={setFunilId}>
                <SelectTrigger className="w-[260px]">
                  <SelectValue placeholder="Funil" />
                </SelectTrigger>
                <SelectContent>
                  {funis.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                      {!f.ativo && " (inativo)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {funil && (
              <Button variant="outline" size="icon" title="Configurar funil" onClick={() => setConfig("editar")}>
                <Settings2 className="h-4 w-4" />
              </Button>
            )}
            <Button variant="outline" onClick={() => setConfig("novo")}>
              <Plus className="h-4 w-4 mr-1" /> Funil
            </Button>
            {funil && etapas.length > 0 && (
              <Button onClick={() => setLeadAberto({ lead: null })}>
                <Plus className="h-4 w-4 mr-1" /> Novo lead
              </Button>
            )}
          </>
        }
      />

      {carregandoFunis ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : !funil ? (
        <Card className="rounded-2xl bg-muted/40">
          <CardContent className="py-16 text-center space-y-3">
            <Target className="h-12 w-12 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground">Nenhum funil criado ainda</p>
            <Button onClick={() => setConfig("novo")}>
              <Plus className="h-4 w-4 mr-1" /> Criar funil
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="funil" className="space-y-4">
          <TabsList>
            <TabsTrigger value="funil">Funil</TabsTrigger>
            <TabsTrigger value="vendedores">Vendedores</TabsTrigger>
          </TabsList>

          <TabsContent value="funil" className="space-y-4">
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Resumo rotulo="Em andamento" valor={resumo.andamento} />
              <Resumo rotulo="Fechados" valor={resumo.ganhos} classe="text-green-600" />
              <Resumo rotulo="Cancelados" valor={resumo.perdidos} classe="text-destructive" />
              <Resumo
                rotulo="Conversão"
                valor={conversao === null ? "—" : `${conversao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
                ajuda="Fechados ÷ (fechados + cancelados)"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar por nome, associação, cargo, indicador ou WhatsApp"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
              <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos os vendedores</SelectItem>
                  <SelectItem value={SEM_VENDEDOR}>Sem vendedor</SelectItem>
                  {vendedores.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filtroProduto} onValueChange={setFiltroProduto}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos os produtos</SelectItem>
                  {funil.produtos.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ComercialKanban
              funilId={funil.id}
              etapas={etapas}
              leads={filtrados}
              vendedores={vendedores}
              onAbrir={(lead, etapaId) => setLeadAberto({ lead, etapaId })}
            />
          </TabsContent>

          <TabsContent value="vendedores">
            <VendedoresTab funil={funil} vendedores={vendedores} leads={leads} ganhoIds={ganhoIds} />
          </TabsContent>
        </Tabs>
      )}

      {funil && (
        <LeadDialog
          open={!!leadAberto}
          onOpenChange={(o) => !o && setLeadAberto(null)}
          funil={funil}
          etapas={etapas}
          vendedores={vendedores}
          lead={leadAberto?.lead ?? null}
          etapaInicialId={leadAberto?.etapaId ?? null}
        />
      )}

      <FunilConfigDialog
        open={!!config}
        onOpenChange={(o) => !o && setConfig(null)}
        funil={config === "editar" ? funil : null}
        etapas={config === "editar" ? etapas : []}
        onSalvo={setFunilId}
      />
    </div>
  );
}

function Resumo({ rotulo, valor, classe, ajuda }: { rotulo: string; valor: number | string; classe?: string; ajuda?: string }) {
  return (
    <Card className="rounded-2xl" title={ajuda}>
      <CardContent className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{rotulo}</p>
        <p className={`text-2xl font-bold tabular-nums mt-1 ${classe ?? ""}`}>{valor}</p>
      </CardContent>
    </Card>
  );
}
