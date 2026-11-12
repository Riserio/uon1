import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Download, Plus, Search, Settings2, Target } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComercialKanban } from "@/components/comercial/ComercialKanban";
import { LeadDialog } from "@/components/comercial/LeadDialog";
import { VendedoresTab } from "@/components/comercial/VendedoresTab";
import { FunilConfigDialog } from "@/components/comercial/FunilConfigDialog";
import { CotacoesTab, type CotacaoComLead } from "@/components/comercial/CotacoesTab";
import { CotacaoDialog } from "@/components/comercial/CotacaoDialog";
import { EquipePainel } from "@/components/comercial/EquipePainel";
import { AuditoriaTab } from "@/components/comercial/AuditoriaTab";
import { NotificacoesButton, type ComercialNotificacao } from "@/components/comercial/NotificacoesButton";
import { useNomesUsuarios } from "@/components/comercial/useNomesUsuarios";
import { baixarCsv } from "@/components/comercial/csv";
import {
  NIVEL_LABEL,
  type ComercialEtapa,
  type ComercialFunil,
  type ComercialLead,
  type ComercialVendedor,
} from "@/components/comercial/types";
import { somenteDigitos } from "@/components/comercial/utils";
import { usePermissoes } from "@/hooks/usePermissoes";
import { useComercialAcesso } from "@/hooks/useComercialAcesso";

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
  const { podeVer } = usePermissoes();
  const verFunil = podeVer("comercial", "funil");
  const verVendedores = podeVer("comercial", "vendedores");
  // Hierarquia (Vendedor → Líder → Gerente → Admin). O banco (RLS) já devolve só
  // o que o nível permite; aqui a tela só se adapta.
  const { acesso, nivel, gestor, podeEditarLead, podeEditarVendedor } = useComercialAcesso();
  const verEquipe = nivel === "lider" || gestor;
  const [filtroVendedor, setFiltroVendedor] = useState(TODOS);
  const [filtroLider, setFiltroLider] = useState(TODOS);
  const [filtroGerente, setFiltroGerente] = useState(TODOS);
  const [filtroProduto, setFiltroProduto] = useState(TODOS);
  const [verArquivados, setVerArquivados] = useState(false);
  const [aba, setAba] = useState<string | null>(null);
  const [leadAberto, setLeadAberto] = useState<{ lead: ComercialLead | null; etapaId?: string } | null>(null);
  const [cotacaoAberta, setCotacaoAberta] = useState<CotacaoComLead | null>(null);
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

  const { data: cotacoes = [] } = useQuery({
    queryKey: ["comercial_cotacoes", "funil", funilId],
    enabled: !!funilId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("comercial_cotacoes")
        .select("*, lead:comercial_leads!inner(nome, funil_id)")
        .eq("lead.funil_id", funilId)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data as CotacaoComLead[];
    },
  });

  const nomes = useNomesUsuarios([
    ...leads.flatMap((l) => [l.lider_id, l.gerente_id]),
    ...cotacoes.flatMap((c) => [c.lider_id, c.gerente_id]),
  ]);

  const meuVendedor = vendedores.find((v) => v.id === acesso?.vendedor_id) ?? null;
  const vendedoresEditaveis = useMemo(() => new Set(acesso?.vendedores_editaveis ?? []), [acesso]);
  // Opções do filtro: vendedores com registro visível ou no meu alcance.
  const vendedoresFiltro = useMemo(() => {
    const ids = new Set([...(acesso?.vendedores_visiveis ?? []), ...leads.map((l) => l.vendedor_id)]);
    return nivel === "admin" ? vendedores : vendedores.filter((v) => ids.has(v.id));
  }, [vendedores, leads, acesso, nivel]);
  const lideresFiltro = [...new Set(leads.map((l) => l.lider_id).filter(Boolean) as string[])];
  const gerentesFiltro = [...new Set(leads.map((l) => l.gerente_id).filter(Boolean) as string[])];

  const passaFiltros = (r: { vendedor_id: string | null; lider_id?: string | null; gerente_id?: string | null; produto: string | null; arquivado_em?: string | null }) => {
    if (!verArquivados && r.arquivado_em) return false;
    if (filtroVendedor === SEM_VENDEDOR && r.vendedor_id) return false;
    if (filtroVendedor !== TODOS && filtroVendedor !== SEM_VENDEDOR && r.vendedor_id !== filtroVendedor) return false;
    if (filtroLider !== TODOS && r.lider_id !== filtroLider) return false;
    if (filtroGerente !== TODOS && r.gerente_id !== filtroGerente) return false;
    if (filtroProduto !== TODOS && r.produto !== filtroProduto) return false;
    return true;
  };

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoDigitos = somenteDigitos(busca);
    return leads.filter((l) => {
      if (!passaFiltros(l)) return false;
      if (!termo) return true;
      const texto = [l.nome, l.associacao, l.cargo, l.indicador_nome, l.observacoes].filter(Boolean).join(" ").toLowerCase();
      return texto.includes(termo) || (termoDigitos.length >= 4 && (l.whatsapp || "").includes(termoDigitos));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, busca, filtroVendedor, filtroLider, filtroGerente, filtroProduto, verArquivados]);

  const cotacoesFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return cotacoes.filter((c) => passaFiltros(c) && (!termo || (c.lead?.nome ?? "").toLowerCase().includes(termo)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cotacoes, busca, filtroVendedor, filtroLider, filtroGerente, filtroProduto, verArquivados]);

  const tipoEtapa = new Map(etapas.map((e) => [e.id, e.tipo]));
  const ganhoIds = new Set(etapas.filter((e) => e.tipo === "ganho").map((e) => e.id));
  const perdidoIds = new Set(etapas.filter((e) => e.tipo === "perdido").map((e) => e.id));
  const resumo = {
    andamento: filtrados.filter((l) => tipoEtapa.get(l.etapa_id) === "aberta").length,
    ganhos: filtrados.filter((l) => tipoEtapa.get(l.etapa_id) === "ganho").length,
    perdidos: filtrados.filter((l) => tipoEtapa.get(l.etapa_id) === "perdido").length,
  };
  const finalizados = resumo.ganhos + resumo.perdidos;
  const conversao = finalizados > 0 ? (resumo.ganhos / finalizados) * 100 : null;
  const emitidas = cotacoesFiltradas.filter((c) => c.status === "emitida");
  const valorEmitido = emitidas.reduce((t, c) => t + Number(c.valor || 0), 0);

  const nomeVendedor = new Map(vendedores.map((v) => [v.id, v.nome]));
  const exportarLeads = () =>
    baixarCsv(
      `leads-${funil?.slug ?? "funil"}-${format(new Date(), "yyyy-MM-dd")}.csv`,
      filtrados.map((l) => ({
        Nome: l.nome,
        Associacao: l.associacao ?? "",
        Cargo: l.cargo ?? "",
        WhatsApp: l.whatsapp ?? "",
        Produto: l.produto ?? "",
        Etapa: etapas.find((e) => e.id === l.etapa_id)?.nome ?? "",
        Vendedor: (l.vendedor_id && nomeVendedor.get(l.vendedor_id)) || "",
        Lider: (l.lider_id && nomes.get(l.lider_id)) || "",
        Gerente: (l.gerente_id && nomes.get(l.gerente_id)) || "",
        Origem: l.origem,
        "Motivo cancelamento": l.motivo_perda ?? "",
        "Criado em": format(new Date(l.created_at), "dd/MM/yyyy"),
      })),
    );

  const abrirNotificacao = (n: ComercialNotificacao) => {
    if (n.entidade === "lead") {
      const l = leads.find((x) => x.id === n.entidade_id);
      if (l) return setLeadAberto({ lead: l });
    } else {
      const c = cotacoes.find((x) => x.id === n.entidade_id);
      if (c) return setCotacaoAberta(c);
    }
    toast.info("Esse registro está em outro funil — troque o funil para abrir.");
  };

  // Identificação no topo: "Líder – Equipe X / Gerente Y"
  const identificacao = acesso
    ? [
        NIVEL_LABEL[nivel],
        acesso.equipe && `Equipe ${acesso.equipe}`,
        nivel !== "gerente" && nivel !== "admin" && acesso.lider && nivel !== "lider" && `Líder ${acesso.lider}`,
        acesso.gerente && nivel !== "gerente" && nivel !== "admin" && `Gerente ${acesso.gerente}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  const abaPadrao = verFunil ? "funil" : "cotacoes";

  return (
    <div className="container mx-auto p-6 space-y-6">
      <PageHeader
        icon={Target}
        title="Comercial"
        subtitle={identificacao ?? "Funis de vendas, follow-up de leads e QR code dos vendedores."}
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
            <NotificacoesButton onAbrir={abrirNotificacao} />
            {funil && gestor && (
              <Button variant="outline" size="icon" title="Configurar funil" onClick={() => setConfig("editar")}>
                <Settings2 className="h-4 w-4" />
              </Button>
            )}
            {gestor && (
              <Button variant="outline" onClick={() => setConfig("novo")}>
                <Plus className="h-4 w-4 mr-1" /> Funil
              </Button>
            )}
            {funil && etapas.length > 0 && (gestor || meuVendedor) && (
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
            {gestor && (
              <Button onClick={() => setConfig("novo")}>
                <Plus className="h-4 w-4 mr-1" /> Criar funil
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Tabs value={aba ?? abaPadrao} onValueChange={setAba} className="space-y-4">
          <TabsList>
            {verFunil && <TabsTrigger value="funil">Funil</TabsTrigger>}
            <TabsTrigger value="cotacoes">Cotações</TabsTrigger>
            {verEquipe && <TabsTrigger value="equipe">{nivel === "lider" ? "Minha equipe" : "Equipes"}</TabsTrigger>}
            {verVendedores && <TabsTrigger value="vendedores">Vendedores</TabsTrigger>}
            {gestor && <TabsTrigger value="auditoria">Auditoria</TabsTrigger>}
          </TabsList>

          {!gestor && !meuVendedor && nivel !== "nenhum" && (
            <div className="rounded-xl border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
              Seu usuário ainda não está vinculado a um vendedor — peça ao gerente para vincular em Comercial → Vendedores.
            </div>
          )}

          {(aba ?? abaPadrao) !== "vendedores" && (aba ?? abaPadrao) !== "auditoria" && (
            <>
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
                <Resumo rotulo="Em andamento" valor={resumo.andamento} />
                <Resumo rotulo="Fechados" valor={resumo.ganhos} classe="text-green-600" />
                <Resumo rotulo="Cancelados" valor={resumo.perdidos} classe="text-destructive" />
                <Resumo
                  rotulo="Conversão"
                  valor={conversao === null ? "—" : `${conversao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
                  ajuda="Fechados ÷ (fechados + cancelados)"
                />
                <Resumo
                  rotulo={`Emitido (${emitidas.length})`}
                  valor={valorEmitido.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
                  ajuda="Soma das cotações emitidas"
                />
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar por nome, associação, cargo, indicador ou WhatsApp"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>
                {nivel === "admin" && gerentesFiltro.length > 0 && (
                  <Filtro valor={filtroGerente} onChange={setFiltroGerente} todos="Todos os gerentes"
                    opcoes={gerentesFiltro.map((id) => ({ id, nome: nomes.get(id) ?? "…" }))} />
                )}
                {gestor && lideresFiltro.length > 0 && (
                  <Filtro valor={filtroLider} onChange={setFiltroLider} todos="Todos os líderes"
                    opcoes={lideresFiltro.map((id) => ({ id, nome: nomes.get(id) ?? "…" }))} />
                )}
                {verEquipe && (
                  <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>Todos os vendedores</SelectItem>
                      {nivel === "admin" && <SelectItem value={SEM_VENDEDOR}>Sem vendedor</SelectItem>}
                      {vendedoresFiltro.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
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
                {gestor && (
                  <label className="flex items-center gap-2 text-sm text-muted-foreground px-1">
                    <Switch checked={verArquivados} onCheckedChange={setVerArquivados} /> Arquivados
                  </label>
                )}
                {gestor && (aba ?? abaPadrao) === "funil" && (
                  <Button variant="outline" onClick={exportarLeads} disabled={filtrados.length === 0}>
                    <Download className="h-4 w-4 mr-1" /> Exportar
                  </Button>
                )}
              </div>
            </>
          )}

          {verFunil && (
            <TabsContent value="funil" className="space-y-4">
              <ComercialKanban
                funilId={funil.id}
                etapas={etapas}
                leads={filtrados}
                vendedores={vendedores}
                onAbrir={(lead, etapaId) => setLeadAberto({ lead, etapaId })}
                podeMover={podeEditarLead}
              />
            </TabsContent>
          )}

          <TabsContent value="cotacoes">
            <CotacoesTab
              cotacoes={cotacoesFiltradas}
              vendedores={vendedores}
              nomes={nomes}
              mostrarResponsavel={nivel !== "direto"}
              podeExportar={gestor}
              onAbrir={setCotacaoAberta}
            />
          </TabsContent>

          {verEquipe && (
            <TabsContent value="equipe">
              <EquipePainel
                nivel={nivel}
                leads={filtrados}
                cotacoes={cotacoesFiltradas}
                vendedores={vendedores}
                nomes={nomes}
                ganhoIds={ganhoIds}
                perdidoIds={perdidoIds}
                podeExportar={gestor}
              />
            </TabsContent>
          )}

          {verVendedores && (
            <TabsContent value="vendedores">
              <VendedoresTab funil={funil} vendedores={vendedores} leads={leads} ganhoIds={ganhoIds} podeGerir={gestor} />
            </TabsContent>
          )}

          {gestor && (
            <TabsContent value="auditoria">
              <AuditoriaTab />
            </TabsContent>
          )}
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
          vendedorFixoId={gestor ? null : meuVendedor?.id ?? null}
          podeEditar={podeEditarLead(leadAberto?.lead ?? null)}
          gestor={gestor}
          vendedoresPermitidos={nivel === "admin" ? null : vendedoresEditaveis}
          podeEditarVendedor={podeEditarVendedor}
        />
      )}

      {cotacaoAberta && (
        <CotacaoDialog
          open={!!cotacaoAberta}
          onOpenChange={(o) => !o && setCotacaoAberta(null)}
          leadId={cotacaoAberta.lead_id}
          leadNome={cotacaoAberta.lead?.nome ?? ""}
          produtos={funil?.produtos ?? []}
          cotacao={cotacaoAberta}
          podeEditar={podeEditarVendedor(cotacaoAberta.vendedor_id)}
          gestor={gestor}
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

function Filtro({
  valor,
  onChange,
  todos,
  opcoes,
}: {
  valor: string;
  onChange: (v: string) => void;
  todos: string;
  opcoes: { id: string; nome: string }[];
}) {
  return (
    <Select value={valor} onValueChange={onChange}>
      <SelectTrigger className="w-[190px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>{todos}</SelectItem>
        {opcoes
          .sort((a, b) => a.nome.localeCompare(b.nome))
          .map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.nome}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
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
