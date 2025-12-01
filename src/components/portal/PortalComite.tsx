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
import { PARECERES_COMITE, PARECERES_ASSOCIACAO, PARECERES_ANALISTA } from "@/constants/perguntasComite";
import { exportDeliberacaoPDF } from "@/utils/pdfDeliberacao";
import { useSinistroPerguntas, calcularPesoRespostas, SinistroPergunta, SinistroPerguntaCategoria } from "@/hooks/useSinistroPerguntas";

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
  const [parecerAnalista, setParecerAnalista] = useState({
    parecer: "",
    justificativa: ""
  });
  const [parecerAssociacao, setParecerAssociacao] = useState({
    parecer: "",
    justificativa: ""
  });
  const [saving, setSaving] = useState(false);

  // Status badge com cores baseado no parecer da associação
  const getStatusBadge = (status: string, parecerAssociacao?: string) => {
    // Priorizar parecer da associação
    if (parecerAssociacao) {
      const parecerAssocConfig = PARECERES_ASSOCIACAO.find(p => p.value === parecerAssociacao);
      if (parecerAssocConfig) {
        return <Badge className={`${parecerAssocConfig.cor} ${parecerAssocConfig.textCor}`}>{parecerAssocConfig.label}</Badge>;
      }
    }

    const statusLower = status?.toLowerCase() || "";

    // Verificar se é um dos pareceres do comitê
    const parecerConfig = PARECERES_COMITE.find(p => 
      p.value.toLowerCase() === statusLower || 
      status === p.value
    );
    
    if (parecerConfig) {
      return <Badge className={`${parecerConfig.cor} ${parecerConfig.textCor}`}>{parecerConfig.label}</Badge>;
    }

    // Fallback para status antigos
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
      // Buscar vistorias
      const { data: vistorias, error } = await supabase
        .from("vistorias")
        .select("*")
        .eq("corretora_id", corretoraId)
        .in("status", ["em_analise", "aprovada", "reprovada", "concluida"])
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Buscar acompanhamentos separadamente (usar atendimento_id ou id da vistoria)
      if (vistorias && vistorias.length > 0) {
        // Coletar todos os IDs possíveis (atendimento_id ou id da vistoria)
        const allIds = vistorias.map(v => v.atendimento_id || v.id).filter(Boolean);
        
        if (allIds.length > 0) {
          const { data: acompanhamentos } = await supabase
            .from("sinistro_acompanhamento")
            .select("atendimento_id, parecer_associacao, parecer_analista, comite_status, financeiro_valor_aprovado")
            .in("atendimento_id", allIds);

          // Merge data - usar atendimento_id ou id da vistoria para matching
          const sinistrosComAcomp = vistorias.map(v => ({
            ...v,
            acompanhamento: acompanhamentos?.find(a => a.atendimento_id === (v.atendimento_id || v.id))
          }));
          
          setSinistros(sinistrosComAcomp);
        } else {
          setSinistros(vistorias || []);
        }
      } else {
        setSinistros([]);
      }
    } catch (error: any) {
      console.error("Error fetching sinistros:", error);
      toast.error("Erro ao carregar sinistros");
    } finally {
      setLoading(false);
    }
  };

  // Função para mapear tags auto_preenchivel para valores da vistoria
  const getAutoFillValue = (tag: string, vistoria: any): string => {
    if (!vistoria) return '';
    
    const mappings: Record<string, () => string> = {
      // Dados do cliente
      cliente_nome: () => vistoria?.cliente_nome || '',
      cliente_cpf: () => vistoria?.cliente_cpf || '',
      cliente_telefone: () => vistoria?.cliente_telefone || '',
      cliente_email: () => vistoria?.cliente_email || '',
      cliente_endereco: () => vistoria?.endereco || '',
      
      // Dados do veículo
      veiculo_placa: () => vistoria?.veiculo_placa || '',
      veiculo_marca: () => vistoria?.veiculo_marca || '',
      veiculo_modelo: () => vistoria?.veiculo_modelo || '',
      veiculo_ano: () => vistoria?.veiculo_ano || '',
      veiculo_cor: () => vistoria?.veiculo_cor || '',
      veiculo_chassi: () => vistoria?.veiculo_chassi || '',
      veiculo_valor_fipe: () => vistoria?.veiculo_valor_fipe ? formatCurrency(vistoria.veiculo_valor_fipe) : '',
      veiculo_tipo: () => vistoria?.veiculo_tipo || '',
      veiculo_quilometragem: () => vistoria?.quilometragem?.toString() || '',
      veiculo_uf: () => vistoria?.veiculo_uf || '',
      
      // Dados do sinistro
      sinistro_data: () => {
        const data = vistoria?.data_incidente || vistoria?.data_evento;
        return data ? new Date(data).toLocaleDateString('pt-BR') : '';
      },
      sinistro_hora: () => vistoria?.hora_evento || '',
      sinistro_local: () => vistoria?.endereco || '',
      sinistro_tipo: () => vistoria?.tipo_sinistro || '',
      sinistro_descricao: () => vistoria?.relato_incidente || vistoria?.narrar_fatos || '',
      
      // Dados do condutor
      condutor_nome: () => vistoria?.condutor_veiculo || vistoria?.cliente_nome || '',
      condutor_cpf: () => vistoria?.cnh_dados?.cpf || vistoria?.cliente_cpf || '',
      condutor_cnh: () => vistoria?.cnh_dados?.numero || '',
      condutor_telefone: () => vistoria?.cliente_telefone || '',
      
      // Dados da associação
      numero_sinistro: () => vistoria?.numero ? `SIN-${new Date().getFullYear()}-${String(vistoria.numero).padStart(6, '0')}` : '',
      
      // Perguntas da vistoria (boolean para sim/não)
      fez_bo: () => vistoria?.fez_bo === true ? 'Sim' : vistoria?.fez_bo === false ? 'Não' : '',
      foi_hospital: () => vistoria?.foi_hospital === true ? 'Sim' : vistoria?.foi_hospital === false ? 'Não' : '',
      policia_foi_local: () => vistoria?.policia_foi_local === true ? 'Sim' : vistoria?.policia_foi_local === false ? 'Não' : '',
      motorista_faleceu: () => vistoria?.motorista_faleceu === true ? 'Sim' : vistoria?.motorista_faleceu === false ? 'Não' : '',
      tem_terceiros: () => vistoria?.tem_terceiros === true ? 'Sim' : vistoria?.tem_terceiros === false ? 'Não' : '',
      local_tem_camera: () => vistoria?.local_tem_camera === true ? 'Sim' : vistoria?.local_tem_camera === false ? 'Não' : '',
      estava_chovendo: () => vistoria?.estava_chovendo === true ? 'Sim' : vistoria?.estava_chovendo === false ? 'Não' : '',
      acionou_assistencia_24h: () => vistoria?.acionou_assistencia_24h === true ? 'Sim' : vistoria?.acionou_assistencia_24h === false ? 'Não' : '',
      houve_remocao_veiculo: () => vistoria?.houve_remocao_veiculo === true ? 'Sim' : vistoria?.houve_remocao_veiculo === false ? 'Não' : '',
      vitima_ou_causador: () => vistoria?.vitima_ou_causador || '',
      placa_terceiro: () => vistoria?.placa_terceiro || '',
    };
    
    const getValue = mappings[tag];
    return getValue ? getValue() : '';
  };

  // Auto-preencher respostas baseado nos dados da vistoria e nas perguntas configuradas
  const autoFillFromVistoria = async (vistoria: any, existingRespostas: Record<string, string>) => {
    // Buscar APENAS perguntas configuradas com auto_preenchivel
    const { data: perguntasDb } = await supabase
      .from('sinistro_perguntas')
      .select('id, auto_preenchivel')
      .not('auto_preenchivel', 'is', null)
      .neq('auto_preenchivel', '');

    const novasRespostas = { ...existingRespostas };
    
    // Preencher APENAS das perguntas configuradas no banco de dados
    perguntasDb?.forEach(pergunta => {
      if (pergunta.auto_preenchivel && !novasRespostas[pergunta.id]) {
        const valor = getAutoFillValue(pergunta.auto_preenchivel, vistoria);
        if (valor) {
          novasRespostas[pergunta.id] = valor;
        }
      }
    });
    
    return novasRespostas;
  };

  const handleOpenDeliberacao = async (sinistro: any) => {
    setSelectedSinistro(sinistro);

    // Usar atendimento_id ou id da vistoria como fallback
    const recordId = sinistro.atendimento_id || sinistro.id;

    // Carregar respostas existentes do acompanhamento
    const { data: acompData, error } = await supabase
      .from("sinistro_acompanhamento")
      .select("entrevista_respostas, comite_status, comite_decisao, financeiro_valor_aprovado, comite_observacoes, parecer_analista, parecer_analista_justificativa, parecer_associacao, parecer_associacao_justificativa")
      .eq("atendimento_id", recordId)
      .maybeSingle();

    if (error) {
      console.error("Erro ao carregar acompanhamento:", error);
    }

    // Buscar TODAS as perguntas válidas do banco para filtrar respostas antigas
    // Usar tipo EXATO (case-sensitive) do sinistro
    const tipoExato = (sinistro.tipo_sinistro || '').trim();
    
    const { data: perguntasValidas } = await supabase
      .from('sinistro_perguntas')
      .select('id')
      .eq('tipo_sinistro', tipoExato)
      .eq('ativo', true);

    const perguntaIdsValidos = new Set((perguntasValidas || []).map(p => p.id));

    let respostasFinais: Record<string, string> = {};
    
    if (acompData?.entrevista_respostas) {
      const respostasRaw = acompData.entrevista_respostas as Record<string, string>;
      // FILTRAR: manter SOMENTE respostas de perguntas válidas do banco
      respostasFinais = Object.fromEntries(
        Object.entries(respostasRaw).filter(([key]) => perguntaIdsValidos.has(key))
      );
    }
    
    // Auto-preencher com dados da vistoria
    respostasFinais = await autoFillFromVistoria(sinistro, respostasFinais);
    setRespostas(respostasFinais);

    setDeliberacao({
      decisao: acompData?.comite_status || "",
      valor_aprovado: acompData?.financeiro_valor_aprovado?.toString() || sinistro.valor_indenizacao?.toString() || "",
      justificativa: acompData?.comite_observacoes || "",
    });

    setParecerAnalista({
      parecer: acompData?.parecer_analista || acompData?.comite_status || "",
      justificativa: acompData?.parecer_analista_justificativa || ""
    });

    setParecerAssociacao({
      parecer: acompData?.parecer_associacao || "",
      justificativa: acompData?.parecer_associacao_justificativa || ""
    });

    setDialogOpen(true);
  };

  /**
   * Auto-save das respostas da entrevista sempre que o usuário altera algo.
   */
  const [savingRespostas, setSavingRespostas] = useState(false);

  const salvarRespostas = async () => {
    if (!selectedSinistro) return;

    const recordId = selectedSinistro.atendimento_id || selectedSinistro.id;
    if (!recordId) {
      toast.error("Erro: ID do sinistro não encontrado");
      return;
    }

    try {
      setSavingRespostas(true);
      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !currentUser) {
        toast.error("Usuário não autenticado");
        return;
      }

      const { data: existing, error: existingError } = await supabase
        .from("sinistro_acompanhamento")
        .select("id")
        .eq("atendimento_id", recordId)
        .maybeSingle();

      if (existingError) {
        console.error("Erro ao buscar acompanhamento:", existingError);
        toast.error("Erro ao salvar respostas");
        return;
      }

      // FILTRAR: salvar APENAS respostas de perguntas válidas do banco
      const perguntaIdsValidos = new Set(perguntasDb.map(p => p.id));
      const respostasFiltradas = Object.fromEntries(
        Object.entries(respostas).filter(([key]) => perguntaIdsValidos.has(key))
      );

      const payload = {
        entrevista_respostas: respostasFiltradas,
        entrevista_data: new Date().toISOString(),
      };

      if (existing) {
        const { error } = await supabase
          .from("sinistro_acompanhamento")
          .update(payload)
          .eq("atendimento_id", recordId);

        if (error) {
          console.error("Erro ao salvar respostas (update):", error);
          toast.error("Erro ao salvar respostas");
          return;
        }
      } else {
        const { error } = await supabase.from("sinistro_acompanhamento").insert({
          ...payload,
          atendimento_id: recordId,
          created_by: currentUser.id,
        });

        if (error) {
          console.error("Erro ao salvar respostas (insert):", error);
          toast.error("Erro ao salvar respostas");
          return;
        }
      }
      
      toast.success("Respostas salvas com sucesso");
    } catch (err) {
      console.error("Erro inesperado ao salvar respostas:", err);
      toast.error("Erro ao salvar respostas");
    } finally {
      setSavingRespostas(false);
    }
  };

  const handleRespostaChange = (perguntaId: string, valor: string) => {
    setRespostas((prev) => ({
      ...prev,
      [perguntaId]: valor,
    }));
  };

  const handleSalvarDeliberacao = async () => {
    if (!selectedSinistro) return;

    // Usar atendimento_id ou id da vistoria como fallback
    const recordId = selectedSinistro.atendimento_id || selectedSinistro.id;
    
    if (!recordId) {
      toast.error("Erro: ID do sinistro não encontrado");
      return;
    }

    try {
      setSaving(true);

      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      // Verificar se já existe registro de acompanhamento
      const { data: existing } = await supabase
        .from("sinistro_acompanhamento")
        .select("id")
        .eq("atendimento_id", recordId)
        .maybeSingle();

      // FILTRAR: salvar APENAS respostas de perguntas válidas do banco
      const perguntaIdsValidosDelib = new Set(perguntasDb.map(p => p.id));
      const respostasFiltradasDelib = Object.fromEntries(
        Object.entries(respostas).filter(([key]) => perguntaIdsValidosDelib.has(key))
      );

      const acompanhamentoData = {
        // mantemos as respostas no payload também, para garantir consistência
        entrevista_respostas: respostasFiltradasDelib,
        entrevista_data: new Date().toISOString(),
        // Parecer do Analista
        parecer_analista: parecerAnalista.parecer || null,
        parecer_analista_justificativa: parecerAnalista.justificativa || null,
        parecer_analista_data: parecerAnalista.parecer ? new Date().toISOString() : null,
        // Parecer da Associação
        parecer_associacao: parecerAssociacao.parecer || null,
        parecer_associacao_justificativa: parecerAssociacao.justificativa || null,
        parecer_associacao_data: parecerAssociacao.parecer ? new Date().toISOString() : null,
        // Campos legados para compatibilidade
        comite_status: parecerAnalista.parecer || null,
        comite_decisao: parecerAssociacao.justificativa || null,
        comite_observacoes: parecerAssociacao.justificativa || null,
        comite_data: new Date().toISOString(),
        financeiro_valor_aprovado: parseFloat(deliberacao.valor_aprovado) || null,
      };

      if (existing) {
        const { error } = await supabase
          .from("sinistro_acompanhamento")
          .update(acompanhamentoData)
          .eq("atendimento_id", recordId);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("sinistro_acompanhamento").insert({
          ...acompanhamentoData,
          atendimento_id: recordId,
          created_by: currentUser?.id,
        });

        if (error) throw error;
      }

      // Atualizar status da vistoria se necessário
      if (parecerAssociacao.parecer) {
        let novoStatus = selectedSinistro.status;
        if (parecerAssociacao.parecer === "aprovado") {
          novoStatus = "aprovada";
        } else if (parecerAssociacao.parecer === "negado") {
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

  // Hook para carregar perguntas do banco baseado no tipo de sinistro selecionado
  const tipoSinistroSelecionado = selectedSinistro?.tipo_sinistro || '';
  const { perguntas: perguntasDb, categorias: categoriasDb, loading: loadingPerguntas } = useSinistroPerguntas(tipoSinistroSelecionado);

  // Filtrar respostas antigas quando perguntas do banco forem carregadas
  useEffect(() => {
    if (!loadingPerguntas && perguntasDb.length > 0 && Object.keys(respostas).length > 0) {
      const perguntaIdsValidos = new Set(perguntasDb.map(p => p.id));
      const respostasFiltradas = Object.fromEntries(
        Object.entries(respostas).filter(([key]) => perguntaIdsValidos.has(key))
      );
      // Só atualizar se houver diferença (evita loop infinito)
      if (Object.keys(respostasFiltradas).length !== Object.keys(respostas).length) {
        setRespostas(respostasFiltradas);
      }
    }
  }, [loadingPerguntas, perguntasDb]);

  // Calcular peso das respostas usando APENAS perguntas do banco
  const perguntaIds = new Set(perguntasDb.map(p => p.id));
  const respostasFiltradas = Object.fromEntries(
    Object.entries(respostas).filter(([k]) => perguntaIds.has(k))
  );
  const { total: pesoTotal, maxPossivel, percentual: percentualPeso, alertas } = calcularPesoRespostas(respostasFiltradas, perguntasDb);

  const totalPerguntas = perguntasDb.length;
  const perguntasRespondidas = Object.keys(respostasFiltradas).filter((k) => respostasFiltradas[k]).length;

  const renderPerguntaDb = (pergunta: SinistroPergunta) => {
    const valor = respostas[pergunta.id] || '';

    return (
      <div key={pergunta.id} className="space-y-1.5">
        <Label className="text-xs font-medium flex items-center gap-2">
          {pergunta.pergunta}
          {pergunta.obrigatoria && <span className="text-destructive">*</span>}
        </Label>

        {pergunta.tipo_campo === 'select' && pergunta.opcoes && (
          <Select value={valor} onValueChange={(v) => handleRespostaChange(pergunta.id, v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {(pergunta.opcoes as string[]).filter(opcao => opcao?.trim()).map((opcao) => (
                <SelectItem key={opcao} value={opcao} className="text-xs">{opcao}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {pergunta.tipo_campo === 'text' && (
          <Input
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
            placeholder="Digite..."
            className="h-8 text-xs"
          />
        )}

        {pergunta.tipo_campo === 'textarea' && (
          <Textarea
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
            placeholder="Digite..."
            rows={2}
            className="text-xs"
          />
        )}

        {pergunta.tipo_campo === 'date' && (
          <Input
            type="date"
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
            className="h-8 text-xs"
          />
        )}

        {pergunta.tipo_campo === 'valor' && (
          <Input
            type="number"
            value={valor}
            onChange={(e) => handleRespostaChange(pergunta.id, e.target.value)}
            placeholder="0,00"
            className="h-8 text-xs"
          />
        )}
      </div>
    );
  };

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
                    <TableCell>{getStatusBadge(sinistro.status, sinistro.acompanhamento?.parecer_associacao)}</TableCell>
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
        <DialogContent className="max-w-5xl max-h-[95vh] flex flex-col bg-white">
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
                {/* Perguntas - COLUNA ÚNICA, ORDEM 1–62, dentro de box branco */}
                <div className="col-span-2 overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Questionário de Avaliação</h3>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {perguntasRespondidas}/{totalPerguntas} respondidas
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={salvarRespostas}
                        disabled={savingRespostas}
                        className="gap-1 h-7"
                      >
                        <Save className="h-3 w-3" />
                        {savingRespostas ? "Salvando..." : "Salvar Respostas"}
                      </Button>
                    </div>
                  </div>
                  <ScrollArea className="flex-1 pr-4">
                    <Card className="p-4 bg-white border rounded-md shadow-sm">
                      <div className="space-y-6">
                        {loadingPerguntas ? (
                          <p className="text-muted-foreground text-center py-8">Carregando perguntas...</p>
                        ) : perguntasDb.length === 0 ? (
                          <p className="text-muted-foreground text-center py-8">
                            Nenhuma pergunta cadastrada para este tipo de sinistro. Configure as perguntas em Configurações de Sinistro.
                          </p>
                        ) : categoriasDb.length > 0 ? (
                          categoriasDb.map(categoria => (
                            <div key={categoria.id} className="space-y-4">
                              <h3 className="font-semibold text-sm border-b pb-2">{categoria.nome}</h3>
                              <div className="space-y-3">
                                {(categoria.perguntas || []).map(renderPerguntaDb)}
                              </div>
                            </div>
                          ))
                        ) : (
                          perguntasDb.map(renderPerguntaDb)
                        )}
                      </div>
                    </Card>
                  </ScrollArea>
                </div>

                {/* Decisão - 1 coluna, com scroll próprio e cards alinhados na parte de baixo */}
                <div className="overflow-hidden flex flex-col justify-end">
                  <h3 className="text-sm font-semibold mb-2">Decisão do Comitê</h3>
                  <ScrollArea className="flex-1">
                    <Card className="flex-1 p-4 bg-white">
                      <div className="space-y-4">
                        {/* Resultado da Análise baseado nas respostas */}
                        {perguntasDb.length > 0 && (
                          <div className={`p-3 border-2 rounded-lg space-y-2 ${
                            percentualPeso <= 30 ? 'bg-green-600 border-green-600' :
                            percentualPeso <= 50 ? 'bg-lime-500 border-lime-500' :
                            percentualPeso <= 70 ? 'bg-yellow-400 border-yellow-400' :
                            percentualPeso <= 85 ? 'bg-orange-500 border-orange-500' :
                            'bg-red-600 border-red-600'
                          }`}>
                            <h4 className={`font-medium text-sm ${percentualPeso <= 70 && percentualPeso > 50 ? 'text-black' : 'text-white'}`}>Resultado da Análise</h4>
                            <p className={`text-xs font-bold ${percentualPeso <= 70 && percentualPeso > 50 ? 'text-black' : 'text-white'}`}>
                              {percentualPeso <= 30 ? 'Evento passivo de aprovação - Nenhuma das respostas informadas indicam indícios de atenção' :
                               percentualPeso <= 50 ? 'Evento passível de ressarcimento' :
                               percentualPeso <= 70 ? 'Evento requer atenção - Mudanças no andamento' :
                               percentualPeso <= 85 ? 'Evento requer atenção - Análise jurídica/sindicância/perícia' :
                               'Evento requer atenção - Passível de negativa/análise jurídica'}
                            </p>
                            {alertas.length > 0 && (
                              <div className={`text-xs mt-2 p-2 rounded ${percentualPeso <= 70 && percentualPeso > 50 ? 'bg-black/10' : 'bg-white/20'}`}>
                                <p className={`font-medium mb-1 ${percentualPeso <= 70 && percentualPeso > 50 ? 'text-black' : 'text-white'}`}>Pontos de atenção ({alertas.length}):</p>
                                <ul className={`list-disc list-inside space-y-0.5 ${percentualPeso <= 70 && percentualPeso > 50 ? 'text-black/80' : 'text-white/90'}`}>
                                  {alertas.slice(0, 5).map((alerta, i) => (
                                    <li key={i} className="truncate">{alerta}</li>
                                  ))}
                                  {alertas.length > 5 && (
                                    <li>...e mais {alertas.length - 5} item(s)</li>
                                  )}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Parecer do Analista */}
                        <div className="p-3 border rounded-lg space-y-3">
                          <h4 className="font-medium text-sm">Parecer do Analista</h4>
                          <div className="space-y-2">
                            <Label className="text-xs">Parecer *</Label>
                            <Select
                              value={parecerAnalista.parecer}
                              onValueChange={(value) => setParecerAnalista({ ...parecerAnalista, parecer: value })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o parecer" />
                              </SelectTrigger>
                              <SelectContent>
                                {PARECERES_ANALISTA.map((parecer) => (
                                  <SelectItem key={parecer.value} value={parecer.value}>
                                    <div className="flex items-center gap-2">
                                      <div className={`w-2 h-2 rounded-full ${parecer.cor}`} />
                                      <span className="text-xs">{parecer.label}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">Justificativa do Analista</Label>
                            <Textarea
                              value={parecerAnalista.justificativa}
                              onChange={(e) => setParecerAnalista({ ...parecerAnalista, justificativa: e.target.value })}
                              placeholder="Descreva sua análise..."
                              rows={3}
                              className="text-xs"
                            />
                          </div>
                        </div>

                        {/* Parecer da Associação */}
                        <div className={`p-3 border-2 rounded-lg space-y-3 ${parecerAnalista.parecer ? 'border-primary/30 bg-primary/5' : 'border-muted bg-muted/30 opacity-60'}`}>
                          <h4 className="font-medium text-sm text-primary">Parecer da Associação</h4>
                          <p className="text-xs text-muted-foreground">
                            {parecerAnalista.parecer 
                              ? "Decisão final exibida na tela de sinistros" 
                              : "Aguardando parecer do analista para liberar"}
                          </p>
                          <div className="space-y-2">
                            <Label className="text-xs">Decisão *</Label>
                            <Select
                              value={parecerAssociacao.parecer}
                              onValueChange={(value) => setParecerAssociacao({ ...parecerAssociacao, parecer: value })}
                              disabled={!parecerAnalista.parecer}
                            >
                              <SelectTrigger disabled={!parecerAnalista.parecer}>
                                <SelectValue placeholder="Selecione a decisão" />
                              </SelectTrigger>
                              <SelectContent>
                                {PARECERES_ASSOCIACAO.map((parecer) => (
                                  <SelectItem key={parecer.value} value={parecer.value}>
                                    <div className="flex items-center gap-2">
                                      <div className={`w-3 h-3 rounded-full ${parecer.cor}`} />
                                      <span className="font-medium">{parecer.label}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-xs">Justificativa da Associação</Label>
                            <Textarea
                              value={parecerAssociacao.justificativa}
                              onChange={(e) => setParecerAssociacao({ ...parecerAssociacao, justificativa: e.target.value })}
                              placeholder="Descreva a decisão da associação..."
                              rows={4}
                              className="text-xs"
                              disabled={!parecerAnalista.parecer}
                            />
                          </div>
                        </div>

                        <Separator />

                        <div className="flex gap-2 pb-1">
                          <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                            Cancelar
                          </Button>
                          <Button
                            onClick={handleSalvarDeliberacao}
                            disabled={saving}
                            className="flex-1 gap-2"
                          >
                            <Save className="h-4 w-4" />
                            {saving ? "Salvando..." : "Salvar"}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </ScrollArea>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
