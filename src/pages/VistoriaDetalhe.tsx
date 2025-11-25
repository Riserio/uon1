import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ArrowLeft, Download, FileText, Camera, Check, X, Send, MapPin, User, Car, FileCheck, MessageSquare, Brain, Clock, Phone, Mail, Hash, Shield, MessageCircle, ChevronLeft, ChevronRight, Calendar, DollarSign, Edit, Eye } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { generateVistoriaPDF } from "@/components/VistoriaPDF";
import { useAuth } from "@/hooks/useAuth";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
export default function VistoriaDetalhe() {
  const {
    id
  } = useParams();
  const navigate = useNavigate();
  const {
    user
  } = useAuth();
  const [vistoria, setVistoria] = useState<any>(null);
  const [fotos, setFotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFoto, setSelectedFoto] = useState<number>(0);
  const [corretora, setCorretora] = useState<any>(null);
  const [administradora, setAdministradora] = useState<any>(null);
  const [fotosReprovar, setFotosReprovar] = useState<{
    [key: string]: boolean;
  }>({});
  const [observacaoReprovacao, setObservacaoReprovacao] = useState<{
    [key: string]: string;
  }>({});
  const [isAprovacaoModalOpen, setIsAprovacaoModalOpen] = useState(false);
  const [currentFotoAprovacao, setCurrentFotoAprovacao] = useState<any>(null);
  useEffect(() => {
    loadVistoria();
  }, [id]);
  const loadVistoria = async () => {
    try {
      const {
        data: vistoriaData,
        error: vistoriaError
      } = await supabase.from("vistorias").select(`
          *,
          corretoras (
            id,
            nome,
            cnpj,
            telefone,
            email,
            logo_url
          )
        `).eq("id", id).single();
      if (vistoriaError) throw vistoriaError;
      setVistoria(vistoriaData);
      if (vistoriaData.corretoras) {
        setCorretora(vistoriaData.corretoras);
        // Load administradora data separately
        const { data: adminData } = await supabase
          .from("administradora")
          .select("*")
          .limit(1)
          .maybeSingle();
        
        if (adminData) {
          setAdministradora(adminData);
        }
      }
      const {
        data: fotosData,
        error: fotosError
      } = await supabase.from("vistoria_fotos").select("*").eq("vistoria_id", id).order("ordem");
      if (fotosError) throw fotosError;
      setFotos(fotosData || []);
    } catch (error) {
      console.error("Erro ao carregar vistoria:", error);
      toast.error("Erro ao carregar vistoria");
    } finally {
      setLoading(false);
    }
  };
  const handleAnalisarComIA = async () => {
    if (!vistoria?.id) {
      toast.error("Nenhuma vistoria selecionada");
      return;
    }
    const toastId = toast.loading("Analisando fotos com IA...");
    try {
      const fotosAnalise = fotos.map(foto => ({
        id: foto.id,
        posicao: foto.posicao,
        url: foto.arquivo_url
      }));
      console.log("Enviando para análise:", {
        vistoria_id: vistoria.id,
        fotos: fotosAnalise
      });
      const {
        data: functionData,
        error: functionError
      } = await supabase.functions.invoke("analisar-vistoria-ia", {
        body: {
          vistoria_id: vistoria.id,
          fotos: fotosAnalise
        }
      });
      if (functionError) {
        console.error("Function error:", functionError);
        throw functionError;
      }
      console.log("Resposta da análise:", functionData);
      toast.dismiss(toastId);
      toast.success("Análise concluída com sucesso!");
      await loadVistoria();
    } catch (error: any) {
      console.error("Erro na análise:", error);
      toast.dismiss(toastId);
      toast.error(error.message || "Erro ao analisar fotos");
    }
  };
  const handleAprovarVistoria = async () => {
    try {
      const {
        error
      } = await supabase.from("vistorias").update({
        status: "aprovada",
        completed_at: new Date().toISOString()
      }).eq("id", id);
      if (error) throw error;
      toast.success("Vistoria aprovada com sucesso!");
      await loadVistoria();
    } catch (error) {
      console.error("Erro ao aprovar vistoria:", error);
      toast.error("Erro ao aprovar vistoria");
    }
  };
  const handleAprovarFoto = async (fotoId: string) => {
    try {
      const {
        error
      } = await supabase.from("vistoria_fotos").update({
        status_aprovacao: "aprovada",
        aprovada_em: new Date().toISOString(),
        aprovada_por: user?.id,
        analise_manual: true,
        observacao_reprovacao: null
      }).eq("id", fotoId);
      if (error) throw error;
      toast.success("Foto aprovada!");
      await loadVistoria();
      setIsAprovacaoModalOpen(false);
      setCurrentFotoAprovacao(null);
    } catch (error) {
      console.error("Erro ao aprovar foto:", error);
      toast.error("Erro ao aprovar foto");
    }
  };
  const handleReprovarFoto = async (fotoId: string) => {
    const observacao = observacaoReprovacao[fotoId];
    if (!observacao || observacao.trim() === "") {
      toast.error("Por favor, informe o motivo da reprovação");
      return;
    }
    try {
      const {
        error
      } = await supabase.from("vistoria_fotos").update({
        status_aprovacao: "reprovada",
        aprovada_em: new Date().toISOString(),
        aprovada_por: user?.id,
        analise_manual: true,
        observacao_reprovacao: observacao
      }).eq("id", fotoId);
      if (error) throw error;
      const {
        error: emailError
      } = await supabase.functions.invoke("solicitar-mais-fotos", {
        body: {
          vistoria_id: id,
          foto_id: fotoId,
          motivo: observacao
        }
      });
      if (emailError) console.error("Erro ao enviar email:", emailError);
      toast.success("Foto reprovada e solicitação enviada!");
      await loadVistoria();
      setObservacaoReprovacao({
        ...observacaoReprovacao,
        [fotoId]: ""
      });
      setIsAprovacaoModalOpen(false);
      setCurrentFotoAprovacao(null);
    } catch (error) {
      console.error("Erro ao reprovar foto:", error);
      toast.error("Erro ao reprovar foto");
    }
  };
  const handleAprovarFotosMultiplas = async () => {
    try {
      const fotosParaAprovar = Object.keys(fotosReprovar).filter(id => !fotosReprovar[id]);
      if (fotosParaAprovar.length === 0) {
        toast.error("Selecione pelo menos uma foto para aprovar");
        return;
      }
      const {
        error
      } = await supabase.from("vistoria_fotos").update({
        status_aprovacao: "aprovada",
        aprovada_em: new Date().toISOString(),
        aprovada_por: user?.id,
        analise_manual: true
      }).in("id", fotosParaAprovar);
      if (error) throw error;
      toast.success(`${fotosParaAprovar.length} foto(s) aprovada(s)!`);
      setFotosReprovar({});
      await loadVistoria();
    } catch (error) {
      console.error("Erro ao aprovar fotos:", error);
      toast.error("Erro ao aprovar fotos");
    }
  };
  const handleReprovarFotosMultiplas = async () => {
    try {
      const fotosParaReprovar = Object.keys(fotosReprovar).filter(id => fotosReprovar[id]);
      if (fotosParaReprovar.length === 0) {
        toast.error("Selecione pelo menos uma foto para reprovar");
        return;
      }
      const hasObservacoesVazias = fotosParaReprovar.some(id => !observacaoReprovacao[id] || observacaoReprovacao[id].trim() === "");
      if (hasObservacoesVazias) {
        toast.error("Todas as fotos reprovadas devem ter um motivo");
        return;
      }
      for (const fotoId of fotosParaReprovar) {
        const {
          error
        } = await supabase.from("vistoria_fotos").update({
          status_aprovacao: "reprovada",
          aprovada_em: new Date().toISOString(),
          aprovada_por: user?.id,
          analise_manual: true,
          observacao_reprovacao: observacaoReprovacao[fotoId]
        }).eq("id", fotoId);
        if (error) throw error;
      }
      const {
        error: emailError
      } = await supabase.functions.invoke("solicitar-mais-fotos", {
        body: {
          vistoria_id: id,
          fotos_reprovadas: fotosParaReprovar.map(id => ({
            foto_id: id,
            motivo: observacaoReprovacao[id]
          }))
        }
      });
      if (emailError) console.error("Erro ao enviar email:", emailError);
      toast.success(`${fotosParaReprovar.length} foto(s) reprovada(s)!`);
      setFotosReprovar({});
      setObservacaoReprovacao({});
      await loadVistoria();
    } catch (error) {
      console.error("Erro ao reprovar fotos:", error);
      toast.error("Erro ao reprovar fotos");
    }
  };
  const openAprovacaoModal = foto => {
    setCurrentFotoAprovacao(foto);
    setIsAprovacaoModalOpen(true);
  };
  const getFotoStatusBadge = foto => {
    if (foto.status_aprovacao === "aprovada") {
      return <Badge variant="default" className="bg-green-500">
          <Check className="w-3 h-3 mr-1" />
          Aprovada
        </Badge>;
    } else if (foto.status_aprovacao === "reprovada") {
      return <Badge variant="destructive">
          <X className="w-3 h-3 mr-1" />
          Reprovada
        </Badge>;
    } else {
      return <Badge variant="secondary">Pendente</Badge>;
    }
  };
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>;
  }
  if (!vistoria) {
    return <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Vistoria não encontrada</p>
        <Button onClick={() => navigate("/sinistros")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
      </div>;
  }
  return <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 dark:from-background dark:via-background dark:to-background">
      <div className="container mx-auto p-4 md:p-6 lg:p-8 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <Button variant="outline" onClick={() => navigate("/sinistros")} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>

          <div className="flex gap-2">
            {!vistoria.observacoes_ia && <Button onClick={handleAnalisarComIA} className="gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700">
                <Brain className="h-4 w-4" />
                Analisar com IA
              </Button>}

            <Button onClick={async () => {
            toast.loading("Gerando PDF...");
            await generateVistoriaPDF(vistoria, fotos, corretora, administradora);
            toast.dismiss();
            toast.success("PDF gerado com sucesso!");
          }} className="gap-2">
              <Download className="h-4 w-4" />
              Exportar PDF
            </Button>
          </div>
        </div>

        <Tabs defaultValue="dados" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto">
            <TabsTrigger value="dados" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Dados</span>
            </TabsTrigger>
            <TabsTrigger value="fotos" className="gap-2">
              <Camera className="h-4 w-4" />
              <span className="hidden sm:inline">Fotos</span>
            </TabsTrigger>
            <TabsTrigger value="analise" className="gap-2" disabled={!vistoria.observacoes_ia}>
              <Brain className="h-4 w-4" />
              <span className="hidden sm:inline">Análise IA</span>
            </TabsTrigger>
            <TabsTrigger value="aprovacao" className="gap-2">
              <FileCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Aprovação</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-6">
            <Card className="border-2 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-t-lg">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-2xl flex items-center gap-3">
                    <FileText className="h-7 w-7" />
                    Vistoria #{vistoria.numero}
                  </CardTitle>
                  <Badge variant="secondary" className={cn("text-sm", vistoria.status === "aprovada" && "bg-green-500 text-white", vistoria.status === "concluida" && "bg-blue-500 text-white", vistoria.status === "pendente" && "bg-yellow-500 text-white")}>
                    {vistoria.status}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-8">
                <div className="grid md:grid-cols-3 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-purple-600 dark:text-purple-400">
                      <User className="h-5 w-5" />
                      <h3>Dados do Cliente</h3>
                    </div>
                    <div className="space-y-2 pl-7">
                      <p className="text-sm">
                        <span className="font-medium">Nome:</span>{" "}
                        <span className="text-muted-foreground">{vistoria.cliente_nome || "N/A"}</span>
                      </p>
                      <p className="text-sm">
                        <span className="font-medium">CPF:</span>{" "}
                        <span className="text-muted-foreground">{vistoria.cliente_cpf || "N/A"}</span>
                      </p>
                      <p className="text-sm">
                        <span className="font-medium">Email:</span>{" "}
                        <span className="text-muted-foreground">{vistoria.cliente_email || "N/A"}</span>
                      </p>
                      <p className="text-sm">
                        <span className="font-medium">Telefone:</span>{" "}
                        <span className="text-muted-foreground">{vistoria.cliente_telefone || "N/A"}</span>
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-purple-600 dark:text-purple-400">
                      <Car className="h-5 w-5" />
                      <h3>Dados do Veículo</h3>
                    </div>
                    <div className="space-y-2 pl-7">
                      <p className="text-sm">
                        <span className="font-medium">Placa:</span>{" "}
                        <span className="text-muted-foreground font-mono">{vistoria.veiculo_placa || "N/A"}</span>
                      </p>
                      <p className="text-sm">
                        <span className="font-medium">Marca:</span>{" "}
                        <span className="text-muted-foreground">{vistoria.veiculo_marca || "N/A"}</span>
                      </p>
                      <p className="text-sm">
                        <span className="font-medium">Modelo:</span>{" "}
                        <span className="text-muted-foreground">{vistoria.veiculo_modelo || "N/A"}</span>
                      </p>
                      <p className="text-sm">
                        <span className="font-medium">Ano:</span>{" "}
                        <span className="text-muted-foreground">{vistoria.veiculo_ano || "N/A"}</span>
                      </p>
                      <p className="text-sm">
                        <span className="font-medium">Cor:</span>{" "}
                        <span className="text-muted-foreground">{vistoria.veiculo_cor || "N/A"}</span>
                      </p>
                      <p className="text-sm">
                        <span className="font-medium">Chassi:</span>{" "}
                        <span className="text-muted-foreground font-mono text-xs">{vistoria.veiculo_chassi || "N/A"}</span>
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-purple-600 dark:text-purple-400">
                      <Calendar className="h-5 w-5" />
                      <h3>Informações da Vistoria</h3>
                    </div>
                    <div className="space-y-2 pl-7">
                      <p className="text-sm">
                        <span className="font-medium">Tipo:</span>{" "}
                        <span className="text-muted-foreground capitalize">{vistoria.tipo_vistoria}</span>
                      </p>
                      <p className="text-sm">
                        <span className="font-medium">Abertura:</span>{" "}
                        <span className="text-muted-foreground capitalize">{vistoria.tipo_abertura}</span>
                      </p>
                      <p className="text-sm">
                        <span className="font-medium">Criada:</span>{" "}
                        <span className="text-muted-foreground">{format(new Date(vistoria.created_at), "dd/MM/yyyy HH:mm", {
                        locale: ptBR
                      })}</span>
                      </p>
                      {vistoria.completed_at && <p className="text-sm">
                          <span className="font-medium">Concluída:</span>{" "}
                          <span className="text-muted-foreground">{format(new Date(vistoria.completed_at), "dd/MM/yyyy HH:mm", {
                          locale: ptBR
                        })}</span>
                        </p>}
                      {vistoria.data_incidente && <p className="text-sm">
                          <span className="font-medium">Data Incidente:</span>{" "}
                          <span className="text-muted-foreground">{format(new Date(vistoria.data_incidente), "dd/MM/yyyy", {
                          locale: ptBR
                        })}</span>
                        </p>}
                    </div>
                  </div>
                </div>

                {vistoria.relato_incidente && <>
                    <Separator />
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-purple-600 dark:text-purple-400">
                        <MessageSquare className="h-5 w-5" />
                        <h3>Relato do Incidente</h3>
                      </div>
                      <p className="text-sm text-muted-foreground pl-7 whitespace-pre-wrap">{vistoria.relato_incidente}</p>
                    </div>
                  </>}

                {vistoria.endereco && <>
                    <Separator />
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-purple-600 dark:text-purple-400">
                        <MapPin className="h-5 w-5" />
                        <h3>Local</h3>
                      </div>
                      <p className="text-sm text-muted-foreground pl-7">{vistoria.endereco}</p>
                    </div>
                  </>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fotos" className="space-y-6">
            <Card className="border-2 shadow-lg overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-blue-500 to-purple-500 text-white">
                <CardTitle className="flex items-center gap-3">
                  <Camera className="h-6 w-6" />
                  Fotos da Vistoria
                </CardTitle>
              </CardHeader>

              <CardContent className="p-0">
                {fotos.length > 0 ? <div className="grid lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border">
                    <div className="lg:col-span-2 p-4">
                      <div className="aspect-[16/10] bg-black rounded-lg overflow-hidden relative group">
                        <img src={fotos[selectedFoto]?.arquivo_url} alt={fotos[selectedFoto]?.posicao} className="w-full h-full object-contain" />

                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors pointer-events-none" />

                        <button onClick={() => setSelectedFoto(prev => Math.max(0, prev - 1))} disabled={selectedFoto === 0} className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30">
                          <ChevronLeft className="h-6 w-6" />
                        </button>

                        <button onClick={() => setSelectedFoto(prev => Math.min(fotos.length - 1, prev + 1))} disabled={selectedFoto === fotos.length - 1} className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30">
                          <ChevronRight className="h-6 w-6" />
                        </button>

                        <div className="absolute bottom-4 left-4 right-4 bg-black/70 backdrop-blur-sm text-white p-3 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold capitalize">{fotos[selectedFoto]?.posicao?.replace(/_/g, " ")}</p>
                              <p className="text-xs text-gray-300">Foto {selectedFoto + 1} de {fotos.length}</p>
                            </div>
                            {getFotoStatusBadge(fotos[selectedFoto])}
                          </div>
                        </div>
                      </div>

                      {fotos[selectedFoto]?.analise_ia?.analise && <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
                          <h4 className="font-semibold text-purple-900 dark:text-purple-300 mb-2 flex items-center gap-2">
                            <Brain className="h-4 w-4" />
                            Análise por IA
                          </h4>
                          <p className="text-sm text-muted-foreground">{fotos[selectedFoto].analise_ia.analise}</p>
                        </div>}
                    </div>

                    <div className="p-4 space-y-2 max-h-[600px] overflow-y-auto">
                      <p className="text-sm font-semibold text-muted-foreground mb-3">Todas as Fotos</p>
                      {fotos.map((foto, idx) => <button key={foto.id} onClick={() => setSelectedFoto(idx)} className={cn("w-full text-left p-3 rounded-lg border-2 transition-all hover:shadow-md", selectedFoto === idx ? "border-purple-500 bg-purple-50 dark:bg-purple-950/20" : "border-border bg-card hover:border-purple-300")}>
                          <div className="flex items-center gap-3">
                            <img src={foto.arquivo_url} alt={foto.posicao} className="w-16 h-16 object-cover rounded" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium capitalize truncate">{foto.posicao.replace(/_/g, " ")}</p>
                              <div className="mt-1">{getFotoStatusBadge(foto)}</div>
                            </div>
                          </div>
                        </button>)}
                    </div>
                  </div> : <div className="p-12 text-center text-muted-foreground">
                    <Camera className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma foto disponível</p>
                  </div>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analise" className="space-y-6">
            {vistoria.observacoes_ia || vistoria.analise_ia ? <Card className="border-2 shadow-lg overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
                  <CardTitle className="flex items-center gap-3">
                    <Brain className="h-6 w-6" />
                    Análise por Inteligência Artificial
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {vistoria.observacoes_ia && <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-1 w-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full" />
                        <h4 className="font-semibold text-purple-900 dark:text-purple-300">Resumo Executivo</h4>
                      </div>
                      <div className="bg-white dark:bg-background rounded-lg border-2 border-purple-200 dark:border-purple-800 p-5">
                        {vistoria.analise_ia?.data_analise && <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 pb-3 border-b border-purple-200 dark:border-purple-800">
                            <Clock className="h-3 w-3" />
                            <span>
                              Análise realizada em {format(new Date(vistoria.analise_ia.data_analise), "dd/MM/yyyy 'às' HH:mm", {
                          locale: ptBR
                        })}
                            </span>
                          </div>}
                        <p className="whitespace-pre-wrap text-foreground/80 leading-relaxed">
                          {vistoria.observacoes_ia}
                        </p>
                      </div>
                    </div>}

                  {vistoria.analise_ia && vistoria.analise_ia.analises && vistoria.analise_ia.analises.length > 0 && <>
                      {vistoria.observacoes_ia && <Separator className="my-6" />}
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <div className="h-1 w-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full" />
                          <h4 className="font-semibold text-purple-900 dark:text-purple-300">
                            Análise Detalhada por Foto
                          </h4>
                        </div>
                        <div className="space-y-4">
                          {vistoria.analise_ia.analises.map((analise: any, index: number) => <Card key={index} className="bg-white dark:bg-background border-2 border-purple-200/50 hover:border-purple-300 transition-colors">
                              <CardContent className="p-5">
                                <div className="flex items-start gap-4">
                                  <div className="flex-shrink-0">
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-lg">
                                      {index + 1}
                                    </div>
                                  </div>
                                  <div className="flex-1 space-y-2">
                                    <h5 className="font-semibold text-purple-900 dark:text-purple-300 capitalize">
                                      {analise.posicao?.replace(/_/g, " ")}
                                    </h5>
                                    <p className="text-sm text-foreground/70 leading-relaxed">
                                      {analise.analise}
                                    </p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>)}
                        </div>
                      </div>
                    </>}

                  {vistoria.danos_detectados && vistoria.danos_detectados.length > 0 && <>
                      <Separator className="my-6" />
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <div className="h-1 w-12 bg-gradient-to-r from-red-500 to-orange-500 rounded-full" />
                          <h4 className="font-semibold text-red-900 dark:text-red-300">
                            Danos Detectados
                          </h4>
                        </div>
                        <div className="grid gap-3">
                          {vistoria.danos_detectados.map((dano: string, idx: number) => <div key={idx} className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
                              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold">
                                !
                              </div>
                              <p className="text-sm text-foreground/80">{dano}</p>
                            </div>)}
                        </div>
                      </div>
                    </>}

                  {vistoria.analise_ia?.veiculo && <>
                      <Separator className="my-6" />
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <div className="h-1 w-12 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full" />
                          <h4 className="font-semibold text-blue-900 dark:text-blue-300">
                            Informações do Veículo Detectadas
                          </h4>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                          {vistoria.analise_ia.veiculo.PLACA && <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                              <p className="text-xs text-muted-foreground mb-1">Placa</p>
                              <p className="font-mono font-bold text-lg">{vistoria.analise_ia.veiculo.PLACA}</p>
                            </div>}
                          {vistoria.analise_ia.veiculo.MARCA && <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                              <p className="text-xs text-muted-foreground mb-1">Marca</p>
                              <p className="font-semibold text-lg">{vistoria.analise_ia.veiculo.MARCA}</p>
                            </div>}
                          {vistoria.analise_ia.veiculo.MODELO && <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                              <p className="text-xs text-muted-foreground mb-1">Modelo</p>
                              <p className="font-semibold text-lg">{vistoria.analise_ia.veiculo.MODELO}</p>
                            </div>}
                          {vistoria.analise_ia.veiculo.ANO && <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                              <p className="text-xs text-muted-foreground mb-1">Ano</p>
                              <p className="font-semibold text-lg">{vistoria.analise_ia.veiculo.ANO}</p>
                            </div>}
                        </div>
                      </div>
                    </>}
                </CardContent>
              </Card> : <Card className="border-2 shadow-lg">
                <CardContent className="p-12 text-center text-muted-foreground">
                  <Brain className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">Nenhuma análise disponível</p>
                  <p className="text-sm">
                    Clique em "Analisar com IA" para gerar uma análise automática desta vistoria
                  </p>
                </CardContent>
              </Card>}
          </TabsContent>

          <TabsContent value="aprovacao" className="space-y-6">
            <Card className="border-2 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-green-500 to-emerald-500 text-white">
                <CardTitle className="flex items-center gap-3">
                  <FileCheck className="h-6 w-6" />
                  Aprovação de Fotos
                </CardTitle>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={handleAprovarFotosMultiplas} variant="default" className="gap-2">
                    <Check className="h-4 w-4" />
                    Aprovar Selecionadas
                  </Button>
                  <Button onClick={handleReprovarFotosMultiplas} variant="destructive" className="gap-2">
                    <X className="h-4 w-4" />
                    Reprovar Selecionadas
                  </Button>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {fotos.map(foto => <Card key={foto.id} className={cn("overflow-hidden border-2 transition-all", fotosReprovar[foto.id] ? "border-destructive" : "border-border", foto.status_aprovacao === "aprovada" && "border-green-500", foto.status_aprovacao === "reprovada" && "border-red-500")}>
                      <CardContent className="p-0">
                        <div className="relative aspect-video bg-black">
                          <img src={foto.arquivo_url} alt={foto.posicao} className="w-full h-full object-contain" />
                          <button onClick={() => openAprovacaoModal(foto)} className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors">
                            <Eye className="h-4 w-4" />
                          </button>
                          <div className="absolute top-2 left-2">{getFotoStatusBadge(foto)}</div>
                        </div>

                        <div className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium capitalize">{foto.posicao.replace(/_/g, " ")}</p>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={fotosReprovar[foto.id] || false} onChange={e => setFotosReprovar({
                            ...fotosReprovar,
                            [foto.id]: e.target.checked
                          })} className="w-4 h-4 rounded border-gray-300" />
                              <span className="text-xs text-muted-foreground">Reprovar</span>
                            </label>
                          </div>

                          {fotosReprovar[foto.id] && <Textarea placeholder="Motivo da reprovação..." value={observacaoReprovacao[foto.id] || ""} onChange={e => setObservacaoReprovacao({
                          ...observacaoReprovacao,
                          [foto.id]: e.target.value
                        })} className="text-sm" rows={2} />}

                          {foto.status_aprovacao === "reprovada" && foto.observacao_reprovacao && <div className="text-xs bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-2 rounded">
                              <p className="font-semibold text-red-900 dark:text-red-300 mb-1">Motivo:</p>
                              <p className="text-red-800 dark:text-red-400">{foto.observacao_reprovacao}</p>
                            </div>}
                        </div>
                      </CardContent>
                    </Card>)}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isAprovacaoModalOpen} onOpenChange={setIsAprovacaoModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="capitalize">
              {currentFotoAprovacao?.posicao?.replace(/_/g, " ")}
            </DialogTitle>
            <DialogDescription>
              Visualize e aprove ou reprove esta foto
            </DialogDescription>
          </DialogHeader>

          {currentFotoAprovacao && <div className="space-y-4">
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                <img src={currentFotoAprovacao.arquivo_url} alt={currentFotoAprovacao.posicao} className="w-full h-full object-contain" />
              </div>

              {currentFotoAprovacao.analise_ia?.analise && <div className="p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
                  <h4 className="font-semibold text-purple-900 dark:text-purple-300 mb-2">
                    Análise por IA
                  </h4>
                  <p className="text-sm text-muted-foreground">{currentFotoAprovacao.analise_ia.analise}</p>
                </div>}

              <div className="space-y-2">
                <Label htmlFor="observacao-modal">Motivo da Reprovação (obrigatório caso reprove)</Label>
                <Textarea id="observacao-modal" placeholder="Descreva o motivo..." value={observacaoReprovacao[currentFotoAprovacao.id] || ""} onChange={e => setObservacaoReprovacao({
                ...observacaoReprovacao,
                [currentFotoAprovacao.id]: e.target.value
              })} rows={3} />
              </div>
            </div>}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsAprovacaoModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => handleReprovarFoto(currentFotoAprovacao?.id)} className="gap-2">
              <X className="h-4 w-4" />
              Reprovar
            </Button>
            <Button onClick={() => handleAprovarFoto(currentFotoAprovacao?.id)} className="gap-2">
              <Check className="h-4 w-4" />
              Aprovar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>;
}
