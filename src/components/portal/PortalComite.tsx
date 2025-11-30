import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { MessageSquare, DollarSign, TrendingUp, FileDown, Save } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { PERGUNTAS_COMITE, CATEGORIAS_PERGUNTAS, ORDEM_CATEGORIAS, PerguntaComite } from "@/constants/perguntasComite";
import { exportDeliberacaoPDF } from "@/utils/pdfDeliberacao";

interface PortalComiteProps {
  corretoraId?: string;
}

export default function PortalComite({ corretoraId }: PortalComiteProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sinistros, setSinistros] = useState<any[]>([]);
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [selectedSinistro, setSelectedSinistro] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [deliberacao, setDeliberacao] = useState({
    decisao: "",
    valor_aprovado: "",
    justificativa: "",
  });
  const [saving, setSaving] = useState(false);

  // Status badge com cores
  const getStatusBadge = (status: string) => {
    const statusLower = status?.toLowerCase() || "";

    if (statusLower === "aprovada" || statusLower === "aprovado") {
      return <Badge className="bg-green-500 hover:bg-green-600 text-white">Aprovada</Badge>;
    }
    if (statusLower === "em_analise" || statusLower === "em análise") {
      return <Badge className="bg-orange-500 hover:bg-orange-600 text-white">Em Análise</Badge>;
    }
    if (statusLower === "negado" || statusLower === "negada" || statusLower === "reprovada") {
      return <Badge className="bg-red-500 hover:bg-red-600 text-white">Negada</Badge>;
    }
    if (statusLower === "sindicancia" || statusLower === "sindicância") {
      return <Badge className="bg-purple-500 hover:bg-purple-600 text-white">Sindicância</Badge>;
    }
    if (statusLower === "pericia" || statusLower === "perícia técnica") {
      return <Badge className="bg-blue-500 hover:bg-blue-600 text-white">Perícia Técnica</Badge>;
    }

    // Cor automática para outros status
    return <Badge variant="secondary">{status || "Pendente"}</Badge>;
  };

  useEffect(() => {
    if (corretoraId) {
      fetchSinistrosParaComite();
    }
  }, [corretoraId]);

  const fetchSinistrosParaComite = async () => {
    if (!corretoraId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("vistorias")
        .select("*")
        .eq("corretora_id", corretoraId)
        .in("status", ["em_analise", "aprovada", "reprovada", "concluida"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSinistros(data || []);
    } catch (error: any) {
      console.error("Error fetching sinistros:", error);
      toast.error("Erro ao carregar sinistros");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDeliberacao = async (sinistro: any) => {
    setSelectedSinistro(sinistro);

    // Carregar respostas existentes do acompanhamento
    const { data: acompData, error } = await supabase
      .from("sinistro_acompanhamento")
      .select("entrevista_respostas, comite_status, comite_decisao, financeiro_valor_aprovado, comite_observacoes")
      .eq("atendimento_id", sinistro.atendimento_id)
      .maybeSingle();

    if (error) {
      console.error("Erro ao carregar acompanhamento:", error);
    }

    if (acompData?.entrevista_respostas) {
      setRespostas(acompData.entrevista_respostas as Record<string, string>);
    } else {
      // Pré-preencher com dados do sinistro
      const respostasIniciais: Record<string, string> = {};
      if (sinistro.cliente_nome) respostasIniciais.nome_associado = sinistro.cliente_nome;
      if (sinistro.veiculo_placa) respostasIniciais.placa = sinistro.veiculo_placa;
      if (sinistro.veiculo_marca && sinistro.veiculo_modelo) {
        respostasIniciais.marca_modelo = `${sinistro.veiculo_marca} ${sinistro.veiculo_modelo}`;
      }
      if (sinistro.veiculo_ano) respostasIniciais.ano_fabricacao = sinistro.veiculo_ano;
      if (sinistro.tipo_sinistro) respostasIniciais.tipo_evento = sinistro.tipo_sinistro;
      if (sinistro.data_incidente) {
        respostasIniciais.data_evento = sinistro.data_incidente.split("T")[0];
      }
      setRespostas(respostasIniciais);
    }

    setDeliberacao({
      decisao: acompData?.comite_status || "",
      valor_aprovado: acompData?.financeiro_valor_aprovado?.toString() || sinistro.valor_indenizacao?.toString() || "",
      justificativa: acompData?.comite_observacoes || "",
    });

    setDialogOpen(true);
  };

  /**
   * Auto-save das respostas da entrevista sempre que o usuário altera algo.
   */
  const salvarRespostasAutomaticamente = async (novasRespostas: Record<string, string>) => {
    if (!selectedSinistro) return;

    try {
      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !currentUser) {
        console.error("Usuário não autenticado para auto-save:", userError);
        return;
      }

      const { data: existing, error: existingError } = await supabase
        .from("sinistro_acompanhamento")
        .select("id")
        .eq("atendimento_id", selectedSinistro.atendimento_id)
        .maybeSingle();

      if (existingError) {
        console.error("Erro ao buscar acompanhamento para auto-save:", existingError);
        return;
      }

      const payload = {
        entrevista_respostas: novasRespostas,
        entrevista_data: new Date().toISOString(),
      };

      if (existing) {
        const { error } = await supabase
          .from("sinistro_acompanhamento")
          .update(payload)
          .eq("atendimento_id", selectedSinistro.atendimento_id);

        if (error) {
          console.error("Erro ao auto-salvar respostas (update):", error);
        }
      } else {
        const { error } = await supabase.from("sinistro_acompanhamento").insert({
          ...payload,
          atendimento_id: selectedSinistro.atendimento_id,
          created_by: currentUser.id,
        });

        if (error) {
          console.error("Erro ao auto-salvar respostas (insert):", error);
        }
      }
    } catch (err) {
      console.error("Erro inesperado ao auto-salvar respostas:", err);
    }
  };

  const handleRespostaChange = (perguntaId: string, valor: string) => {
    setRespostas((prev) => {
      const novasRespostas = {
        ...prev,
        [perguntaId]: valor,
      };

      // Auto-save das respostas da entrevista
      void salvarRespostasAutomaticamente(novasRespostas);

      return novasRespostas;
    });
  };

  const handleSalvarDeliberacao = async () => {
    if (!selectedSinistro) return;

    try {
      setSaving(true);

      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      // Verificar se já existe registro de acompanhamento
      const { data: existing } = await supabase
        .from("sinistro_acompanhamento")
        .select("id")
        .eq("atendimento_id", selectedSinistro.atendimento_id)
        .maybeSingle();

      const acompanhamentoData = {
        // mantemos as respostas no payload também, para garantir consistência
        entrevista_respostas: respostas,
        entrevista_data: new Date().toISOString(),
        comite_status: deliberacao.decisao || null,
        comite_decisao: deliberacao.justificativa || null,
        comite_observacoes: deliberacao.justificativa || null,
        comite_data: new Date().toISOString(),
        financeiro_valor_aprovado: parseFloat(deliberacao.valor_aprovado) || null,
      };

      if (existing) {
        const { error } = await supabase
          .from("sinistro_acompanhamento")
          .update(acompanhamentoData)
          .eq("atendimento_id", selectedSinistro.atendimento_id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("sinistro_acompanhamento").insert({
          ...acompanhamentoData,
          atendimento_id: selectedSinistro.atendimento_id,
          created_by: currentUser?.id,
        });

        if (error) throw error;
      }

      // Atualizar status da vistoria se necessário
      if (deliberacao.decisao) {
        let novoStatus = selectedSinistro.status;
        if (deliberacao.decisao === "Aprovado") {
          novoStatus = "aprovada";
        } else if (deliberacao.decisao === "Negado") {
          novoStatus = "reprovada";
        }

        if (novoStatus !== selectedSinistro.status) {
          await supabase
            .from("vistorias")
            .update({
              status: novoStatus,
              valor_indenizacao: parseFloat(deliberacao.valor_aprovado) || null,
            })
            .eq("id", selectedSinistro.id);
        }
      }

      toast.success("Deliberação salva com sucesso");
      setDialogOpen(false);
      fetchSinistrosParaComite();
    } catch (error: any) {
      console.error("Error saving deliberacao:", error);
      toast.error("Erro ao salvar deliberação");
    } finally {
      setSaving(false);
    }
  };

  const handleExportPDF = async () => {
    if (!selectedSinistro) return;

    try {
      const comiteData = {
        parecer_analista: respostas.parecer_analista,
        decisao: deliberacao.decisao,
        valor_aprovado: parseFloat(deliberacao.valor_aprovado) || undefined,
        justificativa: deliberacao.justificativa,
        data_deliberacao: new Date().toISOString(),
      };

      // Buscar fotos se houver
      const { data: vistoriaFotos } = await supabase
        .from("vistoria_fotos")
        .select("foto_url, tipo_foto")
        .eq("vistoria_id", selectedSinistro.id);

      const fotos = (vistoriaFotos || []).map((f: any) => ({
        url: f.foto_url || "",
        tipo: f.tipo_foto || "Foto",
      }));

      await exportDeliberacaoPDF(selectedSinistro, respostas, comiteData, fotos);
      toast.success("PDF gerado com sucesso");
    } catch (error) {
      console.error("Error exporting PDF:", error);
      toast.error("Erro ao gerar PDF");
    }
  };

  const getValorEstimado = (sinistro: any) => {
    return sinistro.valor_indenizacao || sinistro.custo_reparo || sinistro.custo_perda_total || 0;
  };

  const sinistrosFiltrados = sinistros.filter((s) => {
    if (filtroStatus === "todos") return true;
    return s.status === filtroStatus;
  });

  // Ordena perguntas por número extraído do ID (ex.: "Q01", "1", "10")
  const ordenarPerguntasNumericamente = (perguntas: PerguntaComite[]) => {
    return [...perguntas].sort((a, b) => {
      const numA = parseInt(String(a.id).replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(String(b.id).replace(/\D/g, ""), 10) || 0;
      return numA - numB;
    });
  };

  const renderPergunta = (pergunta: PerguntaComite) => {
    const valor = respostas[pergunta.id] || "";

    return (
      <div key={pergunta.id} className="space-y-1.5">
        <Label className="text-xs font-medium">
          {pergunta.pergunta}
          {pergunta.obrigatoria && <span className="text-destructive ml-1">*</span>}
        </Label>

        {pergunta.tipo === "select" && pergunta.opcoes && (
          <Select value={valor} onValueChange={(v) => handleRespostaChange(pergunta.id, v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {pergunta.opcoes.map((opcao) => (
                <SelectItem key={opcao} value={opcao} className="text-xs">
                  {opcao}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {pergunta.tipo === "text" && (
          <Input
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
            placeholder="Digite..."
            className="h-8 text-xs"
          />
        )}

        {pergunta.tipo === "textarea" && (
          <Textarea
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
            placeholder="Digite..."
            rows={2}
            className="text-xs"
          />
        )}

        {pergunta.tipo === "date" && (
          <Input
            type="date"
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
            className="h-8 text-xs"
          />
        )}
      </div>
    );
  };

  const perguntasRespondidas = Object.keys(respostas).filter((k) => respostas[k]).length;
  const totalPerguntas = PERGUNTAS_COMITE.length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Comitê</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sinistros.length}</div>
            <p className="text-xs text-muted-foreground">Processos para deliberação</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(sinistros.reduce((sum, s) => sum + getValorEstimado(s), 0))}
            </div>
            <p className="text-xs text-muted-foreground">Valor estimado total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sinistros.length > 0
                ? formatCurrency(sinistros.reduce((sum, s) => sum + getValorEstimado(s), 0) / sinistros.length)
                : "R$ 0,00"}
            </div>
            <p className="text-xs text-muted-foreground">Valor médio por sinistro</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Sinistros para Deliberação</CardTitle>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="em_analise">Em Análise</SelectItem>
                <SelectItem value="aprovada">Aprovados</SelectItem>
                <SelectItem value="reprovada">Negados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">Carregando...</div>
          ) : sinistrosFiltrados.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Nenhum sinistro para deliberação</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Valor Estimado</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sinistrosFiltrados.map((sinistro) => (
                  <TableRow key={sinistro.id}>
                    <TableCell className="font-medium">#{sinistro.numero}</TableCell>
                    <TableCell>{sinistro.tipo_sinistro || "N/A"}</TableCell>
                    <TableCell>{sinistro.cliente_nome || "N/A"}</TableCell>
                    <TableCell>
                      {sinistro.veiculo_placa ? (
                        <div>
                          <div className="font-medium">{sinistro.veiculo_placa}</div>
                          <div className="text-xs text-muted-foreground">
                            {sinistro.veiculo_marca} {sinistro.veiculo_modelo}
                          </div>
                        </div>
                      ) : (
                        "N/A"
                      )}
                    </TableCell>
                    <TableCell>{new Date(sinistro.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="text-right">{formatCurrency(getValorEstimado(sinistro))}</TableCell>
                    <TableCell>{getStatusBadge(sinistro.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => handleOpenDeliberacao(sinistro)}>
                        Deliberar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Deliberação */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Deliberação - Sinistro #{selectedSinistro?.numero}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-2">
                  <FileDown className="h-4 w-4" />
                  Exportar PDF
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

          {selectedSinistro && (
            <div className="flex-1 overflow-hidden flex flex-col gap-4">
              {/* Informações do Sinistro */}
              <Card className="bg-muted/50 flex-shrink-0">
                <CardContent className="pt-4 pb-3">
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Cliente</p>
                      <p className="font-medium">{selectedSinistro.cliente_nome || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Tipo</p>
                      <p className="font-medium">{selectedSinistro.tipo_sinistro || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Veículo</p>
                      <p className="font-medium">
                        {selectedSinistro.veiculo_marca} {selectedSinistro.veiculo_modelo} -{" "}
                        {selectedSinistro.veiculo_placa}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Status</p>
                      {getStatusBadge(selectedSinistro.status)}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Perguntas e Decisão lado a lado */}
              <div className="flex-1 overflow-hidden grid grid-cols-3 gap-4">
                {/* Perguntas - COLUNA ÚNICA, CATEGORIAS EM ORDEM E PERGUNTAS EM ORDEM NUMÉRICA */}
                <div className="col-span-2 overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Questionário de Avaliação</h3>
                    <Badge variant="outline" className="text-xs">
                      {perguntasRespondidas}/{totalPerguntas} respondidas
                    </Badge>
                  </div>
                  <ScrollArea className="flex-1 pr-4">
                    <div className="space-y-4">
                      {ORDEM_CATEGORIAS.map((categoria) => {
                        const perguntas = CATEGORIAS_PERGUNTAS[categoria];
                        if (!perguntas || perguntas.length === 0) return null;

                        const perguntasOrdenadas = ordenarPerguntasNumericamente(perguntas);

                        return (
                          <Card key={categoria} className="p-3">
                            <h4 className="text-xs font-semibold mb-2 text-primary">{categoria}</h4>
                            <div className="space-y-3">{perguntasOrdenadas.map(renderPergunta)}</div>
                          </Card>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                {/* Decisão - 1 coluna */}
                <div className="overflow-hidden flex flex-col">
                  <h3 className="text-sm font-semibold mb-2">Decisão do Comitê</h3>
                  <Card className="flex-1 p-4">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Parecer do Analista *</Label>
                        <Select
                          value={deliberacao.decisao}
                          onValueChange={(value) => setDeliberacao({ ...deliberacao, decisao: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a decisão" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Aprovado">
                              <span className="text-green-600 font-medium">Aprovado</span>
                            </SelectItem>
                            <SelectItem value="Negado">
                              <span className="text-red-600 font-medium">Negado</span>
                            </SelectItem>
                            <SelectItem value="Sindicância">
                              <span className="text-purple-600 font-medium">Sindicância</span>
                            </SelectItem>
                            <SelectItem value="Necessário Análise Jurídica">
                              <span className="text-orange-600 font-medium">Necessário Análise Jurídica</span>
                            </SelectItem>
                            <SelectItem value="Perícia Técnica">
                              <span className="text-blue-600 font-medium">Perícia Técnica</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {deliberacao.decisao === "Aprovado" && (
                        <div className="space-y-2">
                          <Label>Valor Aprovado *</Label>
                          <CurrencyInput
                            value={deliberacao.valor_aprovado}
                            onValueChange={(values) =>
                              setDeliberacao({ ...deliberacao, valor_aprovado: values.value || "" })
                            }
                            placeholder="R$ 0,00"
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label>Justificativa / Observações *</Label>
                        <Textarea
                          value={deliberacao.justificativa}
                          onChange={(e) => setDeliberacao({ ...deliberacao, justificativa: e.target.value })}
                          placeholder="Descreva a justificativa da decisão..."
                          rows={6}
                        />
                      </div>

                      <Separator />

                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                          Cancelar
                        </Button>
                        <Button
                          onClick={handleSalvarDeliberacao}
                          disabled={saving || !deliberacao.justificativa}
                          className="flex-1 gap-2"
                        >
                          <Save className="h-4 w-4" />
                          {saving ? "Salvando..." : "Salvar"}
                        </Button>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
