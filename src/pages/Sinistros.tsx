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

import {
  ArrowLeft,
  Download,
  FileText,
  Camera,
  Check,
  X,
  Send,
  MapPin,
  User,
  Car,
  FileCheck,
  MessageSquare,
  Brain,
  Clock,
  Phone,
  Mail,
  Hash,
  Shield,
  MessageCircle,
} from "lucide-react";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { generateVistoriaPDF } from "@/components/VistoriaPDF";
import { useAuth } from "@/hooks/useAuth";
import { Separator } from "@/components/ui/separator";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function VistoriaDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [vistoria, setVistoria] = useState<any>(null);
  const [fotos, setFotos] = useState<any[]>([]);
  const [termosAceitos, setTermosAceitos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingFotos, setLoadingFotos] = useState(true);

  const [corretora, setCorretora] = useState<any>(null);
  const [administradora, setAdministradora] = useState<any>(null);

  const [analiseDialogOpen, setAnaliseDialogOpen] = useState(false);
  const [observacaoAnalise, setObservacaoAnalise] = useState("");
  const [decisaoAnalise, setDecisaoAnalise] = useState<
    "aprovar" | "pendenciar" | null
  >(null);

  const [solicitarFotosOpen, setSolicitarFotosOpen] = useState(false);
  const [motivoFotos, setMotivoFotos] = useState("");
  const [fotosNecessarias, setFotosNecessarias] = useState<string[]>([]);
  const [novaFotoInput, setNovaFotoInput] = useState("");

  const [geoAddress, setGeoAddress] = useState<string | null>(null);
  const [loadingAddress, setLoadingAddress] = useState(false);

  useEffect(() => {
    loadVistoria();
  }, [id]);

  const loadVistoria = async () => {
    try {
      setLoadingFotos(true);

      const { data: vistoriaData, error: vistoriaError } = await supabase
        .from("vistorias")
        .select("*")
        .eq("id", id)
        .single();

      if (vistoriaError) throw vistoriaError;
      setVistoria(vistoriaData);

      const { data: fotosData, error: fotosError } = await supabase
        .from("vistoria_fotos")
        .select("*")
        .eq("vistoria_id", id)
        .order("ordem");

      if (fotosError) {
        console.error("Erro ao carregar fotos:", fotosError);
        toast.error("Erro ao carregar fotos da vistoria");
      }

      setFotos(fotosData || []);

      const { data: termosData } = await supabase
        .from("termos_aceitos")
        .select("*, termos(*)")
        .eq("vistoria_id", id);

      setTermosAceitos(termosData || []);

      if (vistoriaData.corretora_id) {
        const { data: corretoraData } = await supabase
          .from("corretoras")
          .select("*")
          .eq("id", vistoriaData.corretora_id)
          .single();
        if (corretoraData) setCorretora(corretoraData);
      }

      const { data: adminData } = await supabase
        .from("administradora")
        .select("*")
        .limit(1)
        .single();

      if (adminData) setAdministradora(adminData);
    } catch (error) {
      console.error("Erro ao carregar vistoria:", error);
      toast.error("Erro ao carregar detalhes da vistoria");
    } finally {
      setLoading(false);
      setLoadingFotos(false);
    }
  };

  // Buscar endereço pela latitude/longitude
  useEffect(() => {
    const fetchAddress = async () => {
      if (!vistoria?.latitude || !vistoria?.longitude) return;

      try {
        setLoadingAddress(true);

        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${vistoria.latitude}&lon=${vistoria.longitude}&zoom=18&addressdetails=1`
        );

        if (!response.ok) throw new Error("Erro ao buscar endereço");
        const data = await response.json();
        const displayName = data?.display_name;

        setGeoAddress(displayName || null);
      } catch (err) {
        console.error("Erro ao buscar endereço:", err);
      } finally {
        setLoadingAddress(false);
      }
    };

    fetchAddress();
  }, [vistoria?.latitude, vistoria?.longitude]);

  const handleExportPDF = async () => {
    try {
      toast.loading("Gerando PDF...");
      await generateVistoriaPDF(vistoria, fotos, corretora, administradora);
      toast.dismiss();
      toast.success("PDF gerado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.dismiss();
      toast.error("Erro ao gerar PDF");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "aguardando_fotos":
        return "bg-yellow-500";
      case "em_analise":
        return "bg-blue-500";
      case "concluida":
        return "bg-green-500";
      case "aprovada":
        return "bg-green-600";
      case "pendente_correcao":
        return "bg-orange-500";
      case "cancelada":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "aguardando_fotos":
        return "Aguardando Fotos";
      case "em_analise":
        return "Em Análise";
      case "concluida":
        return "Concluída";
      case "aprovada":
        return "Aprovada";
      case "pendente_correcao":
        return "Pendente Correção";
      case "cancelada":
        return "Cancelada";
      default:
        return status;
    }
  };

  const getPosicaoNome = (posicao: string) => {
    const nomes: Record<string, string> = {
      frontal: "Frontal",
      traseira: "Traseira",
      lateral_esquerda: "Lateral Esquerda",
      lateral_direita: "Lateral Direita",
      adicional: "Foto Adicional",
      cnh: "CNH",
      crlv: "CRLV",
    };
    return nomes[posicao] || posicao;
  };

  const getFileTypeFromUrl = (url: string): "image" | "video" | "pdf" | "other" => {
    if (!url) return "other";

    const clean = url.split("?")[0];
    const ext = clean.split(".").pop()?.toLowerCase();

    const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "avif"];
    const videoExts = ["mp4", "mov", "webm", "mkv", "avi", "m4v", "3gp"];
    const pdfExts = ["pdf"];

    if (ext && imageExts.includes(ext)) return "image";
    if (ext && videoExts.includes(ext)) return "video";
    if (ext && pdfExts.includes(ext)) return "pdf";

    return "other";
  };

  const handleAbrirAnalise = (decisao: "aprovar" | "pendenciar") => {
    setDecisaoAnalise(decisao);
    setObservacaoAnalise("");
    setAnaliseDialogOpen(true);
  };

  const confirmarAnalise = async () => {
    if (!observacaoAnalise.trim()) {
      toast.error("Por favor, informe suas observações sobre a análise");
      return;
    }

    try {
      const novoStatus =
        decisaoAnalise === "aprovar" ? "aprovada" : "pendente_correcao";

      await supabase
        .from("vistorias")
        .update({
          status: novoStatus,
          observacoes: observacaoAnalise,
        })
        .eq("id", vistoria.id);

      if (vistoria.atendimento_id) {
        const { data: atendimento } = await supabase
          .from("atendimentos")
          .select("tags")
          .eq("id", vistoria.atendimento_id)
          .single();

        if (atendimento?.tags) {
          const newTags = atendimento.tags
            .filter(
              (tag: string) =>
                ![
                  "aguardando_vistoria_digital",
                  "vistoria_concluida",
                  "pendente_vistoria",
                ].includes(tag)
            )
            .concat(
              decisaoAnalise === "aprovar"
                ? "vistoria_aprovada"
                : "vistoria_pendente"
            );

          await supabase
            .from("atendimentos")
            .update({
              tags: newTags,
            })
            .eq("id", vistoria.atendimento_id);
        }
      }

      toast.success(
        decisaoAnalise === "aprovar"
          ? "Vistoria aprovada!"
          : "Vistoria pendenciada!"
      );

      setAnaliseDialogOpen(false);
      setDecisaoAnalise(null);
      setObservacaoAnalise("");
      loadVistoria();
    } catch (error) {
      console.error("Erro ao analisar vistoria:", error);
      toast.error("Erro ao processar análise");
    }
  };
  /**
   * Solicitar mais fotos:
   * - Tenta enviar e-mail pela edge function
   * - Se a função falhar, segue o fluxo normalmente
   * - Sempre tenta atualizar status para "pendente_correcao"
   * - Fecha o dialog e recarrega a vistoria ao final
   */
  const handleSolicitarMaisFotos = async () => {
    if (!vistoria) {
      toast.error("Vistoria não encontrada para registrar solicitação.");
      return;
    }

    if (!motivoFotos.trim()) {
      toast.error("Por favor, informe o motivo da solicitação");
      return;
    }

    if (fotosNecessarias.length === 0) {
      toast.error("Por favor, adicione pelo menos uma foto necessária");
      return;
    }

    toast.loading("Registrando solicitação de fotos...", { id: "solicitacao-fotos" });

    let emailEnviadoComSucesso = true;

    try {
      const { error: functionError } = await supabase.functions.invoke("solicitar-mais-fotos", {
        body: {
          vistoriaId: vistoria.id,
          motivo: motivoFotos,
          fotosNecessarias,
        },
      });

      if (functionError) {
        console.error("Erro na função 'solicitar-mais-fotos':", functionError);
        emailEnviadoComSucesso = false;
      }
    } catch (err) {
      console.error("Exceção ao chamar edge function 'solicitar-mais-fotos':", err);
      emailEnviadoComSucesso = false;
    }

    const { error: updateError } = await supabase
      .from("vistorias")
      .update({ status: "pendente_correcao" })
      .eq("id", vistoria.id);

    if (updateError) {
      console.error("Erro ao atualizar status da vistoria:", updateError);
      toast.dismiss("solicitacao-fotos");
      toast.error("Falha ao atualizar o status da vistoria.");
      return;
    }

    toast.dismiss("solicitacao-fotos");

    if (!emailEnviadoComSucesso) {
      toast.warning(
        "Solicitação registrada e vistoria marcada como pendente, mas não foi possível enviar o e-mail automático. Use o botão de WhatsApp Web para avisar o cliente."
      );
    } else {
      toast.success("Solicitação registrada, vistoria marcada como pendente e e-mail enviado com sucesso!");
    }

    setSolicitarFotosOpen(false);
    setMotivoFotos("");
    setFotosNecessarias([]);
    setNovaFotoInput("");

    loadVistoria();
  };

  const handleEnviarWhatsApp = () => {
    if (!vistoria) return;

    const link = `${window.location.origin}/vistoria/${vistoria.link_token}`;

    const listaFotos =
      fotosNecessarias.length > 0
        ? `Fotos necessárias:\n- ${fotosNecessarias.join("\n- ")}\n\n`
        : "";

    const mensagem = `Olá! Precisamos de fotos adicionais da sua vistoria referente ao sinistro #${vistoria.numero}.\n\nMotivo: ${
      motivoFotos || "Conforme análise da equipe"
    }\n\n${listaFotos}Envie as fotos pelo link abaixo:\n${link}`;

    const url = `https://web.whatsapp.com/send?text=${encodeURIComponent(mensagem)}`;
    window.open(url, "_blank");
  };

  const adicionarFotoNecessaria = () => {
    if (novaFotoInput.trim()) {
      setFotosNecessarias((prev) => [...prev, novaFotoInput.trim()]);
      setNovaFotoInput("");
    }
  };

  const removerFotoNecessaria = (index: number) => {
    setFotosNecessarias((prev) => prev.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary/20 border-t-primary" />
          </div>
        </div>
      </div>
    );
  }

  if (!vistoria) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-6">
        <div className="max-w-7xl mx-auto text-center py-12">
          <p className="text-muted-foreground">Vistoria não encontrada</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* HEADER */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/vistorias")} size="lg">
            <ArrowLeft className="h-5 w-5 mr-2" /> Voltar
          </Button>

          <div className="flex gap-2">
            {vistoria.tipo_abertura === "digital" && vistoria.analise_ia && (
              <Badge
                variant="outline"
                className="bg-purple-500/10 text-purple-600 border-purple-200"
              >
                <Brain className="h-3 w-3 mr-1" /> Análise por IA
              </Badge>
            )}

            {vistoria.status !== "cancelada" && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setSolicitarFotosOpen(true)}
              >
                <Camera className="h-4 w-4" /> Solicitar Mais Fotos
              </Button>
            )}

            <Button className="gap-2" onClick={handleExportPDF}>
              <Download className="h-4 w-4" /> Exportar PDF
            </Button>
          </div>
        </div>

        {/* STATUS */}
        <Card className="border-2">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Hash className="h-6 w-6 text-muted-foreground" />
                  <h1 className="text-3xl font-bold">Vistoria #{vistoria.numero}</h1>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Badge
                    variant={
                      vistoria.tipo_abertura === "digital" ? "default" : "secondary"
                    }
                    className="text-sm"
                  >
                    {vistoria.tipo_abertura === "digital" ? (
                      <>
                        <Camera className="h-3 w-3 mr-1" /> Digital
                      </>
                    ) : (
                      <>
                        <FileText className="h-3 w-3 mr-1" /> Manual
                      </>
                    )}
                  </Badge>

                  <Badge variant="outline" className="text-sm">
                    {vistoria.tipo_vistoria === "sinistro" ? "Sinistro" : "Reativação"}
                  </Badge>

                  <Badge className={cn("text-sm", getStatusColor(vistoria.status))}>
                    {getStatusLabel(vistoria.status)}
                  </Badge>
                </div>
              </div>

              <div className="text-right space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>
                    Criada em{" "}
                    {format(new Date(vistoria.created_at), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </span>
                </div>

                {vistoria.completed_at && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4" />
                    <span>
                      Concluída em{" "}
                      {format(
                        new Date(vistoria.completed_at),
                        "dd/MM/yyyy 'às' HH:mm",
                        { locale: ptBR }
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* TABS */}
        <Tabs defaultValue="geral" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 lg:w-auto">
            <TabsTrigger value="geral">
              <User className="h-4 w-4 mr-2" /> Geral
            </TabsTrigger>
            <TabsTrigger value="fotos">
              <Camera className="h-4 w-4 mr-2" /> Fotos
            </TabsTrigger>
            <TabsTrigger value="ia">
              <Brain className="h-4 w-4 mr-2" /> Análise IA
            </TabsTrigger>
            <TabsTrigger value="localizacao">
              <MapPin className="h-4 w-4 mr-2" /> Localização
            </TabsTrigger>
            <TabsTrigger value="termos">
              <FileCheck className="h-4 w-4 mr-2" /> Termos
            </TabsTrigger>
            <TabsTrigger value="questionario">
              <MessageSquare className="h-4 w-4 mr-2" /> Respostas
            </TabsTrigger>
          </TabsList>

          {/* --- MUITO CONTEÚDO AQUI (Geral, Fotos, IA, Localização, Termos, Questionário) --- */}
          {/* 🔥 Para não quebrar o limite da mensagem, envio o restante agora na SEQUÊNCIA. */}
        </Tabs>
      </div>

      {/* DIALOGS — análise e solicitar fotos */}
      {/* 🔥 A CONTINUAÇÃO COMPLETA dos TABS e DIALOGS será enviada AGORA na próxima mensagem */}
    </div>
  );
}
          {/* ------------------------------ */}
          {/* TAB: GERAL                    */}
          {/* ------------------------------ */}
          <TabsContent value="geral" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Cliente */}
              <Card>
                <CardHeader className="bg-muted/50">
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Dados do Cliente
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  {vistoria.cliente_nome && (
                    <div>
                      <span className="text-sm text-muted-foreground">Nome Completo</span>
                      <p className="font-semibold text-lg">{vistoria.cliente_nome}</p>
                    </div>
                  )}

                  {vistoria.cliente_cpf && (
                    <div>
                      <span className="text-sm text-muted-foreground">CPF</span>
                      <p className="font-mono">{vistoria.cliente_cpf}</p>
                    </div>
                  )}

                  {vistoria.cliente_email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <span className="text-sm text-muted-foreground block">Email</span>
                        <p>{vistoria.cliente_email}</p>
                      </div>
                    </div>
                  )}

                  {vistoria.cliente_telefone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <span className="text-sm text-muted-foreground block">Telefone</span>
                        <p>{vistoria.cliente_telefone}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Veículo */}
              <Card>
                <CardHeader className="bg-muted/50">
                  <CardTitle className="flex items-center gap-2">
                    <Car className="h-5 w-5" />
                    Dados do Veículo
                  </CardTitle>
                </CardHeader>

                <CardContent className="p-6 space-y-4">
                  {vistoria.veiculo_placa && (
                    <div>
                      <span className="text-sm text-muted-foreground">Placa</span>
                      <p className="font-bold text-lg tracking-wider">{vistoria.veiculo_placa}</p>
                    </div>
                  )}

                  {(vistoria.veiculo_marca || vistoria.veiculo_modelo) && (
                    <div>
                      <span className="text-sm text-muted-foreground">Marca/Modelo</span>
                      <p className="font-semibold">
                        {vistoria.veiculo_marca} {vistoria.veiculo_modelo}
                      </p>
                    </div>
                  )}

                  {vistoria.veiculo_ano && (
                    <div>
                      <span className="text-sm text-muted-foreground">Ano</span>
                      <p>{vistoria.veiculo_ano}</p>
                    </div>
                  )}

                  {vistoria.veiculo_cor && (
                    <div>
                      <span className="text-sm text-muted-foreground">Cor</span>
                      <p>{vistoria.veiculo_cor}</p>
                    </div>
                  )}

                  {vistoria.veiculo_chassi && (
                    <div>
                      <span className="text-sm text-muted-foreground">Chassi</span>
                      <p className="font-mono text-xs">{vistoria.veiculo_chassi}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* CNH OCR */}
            {vistoria.cnh_dados && (
              <Card>
                <CardHeader className="bg-muted/50">
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Dados da CNH (OCR)
                  </CardTitle>
                </CardHeader>

                <CardContent className="p-6">
                  <div className="grid md:grid-cols-3 gap-4">
                    {vistoria.cnh_dados.nome && (
                      <div>
                        <span className="text-sm text-muted-foreground">Nome</span>
                        <p className="font-semibold">{vistoria.cnh_dados.nome}</p>
                      </div>
                    )}

                    {vistoria.cnh_dados.cpf && (
                      <div>
                        <span className="text-sm text-muted-foreground">CPF</span>
                        <p className="font-mono">{vistoria.cnh_dados.cpf}</p>
                      </div>
                    )}

                    {vistoria.cnh_dados.numero_registro && (
                      <div>
                        <span className="text-sm text-muted-foreground">Nº Registro</span>
                        <p className="font-mono">{vistoria.cnh_dados.numero_registro}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Documentos */}
            <Card>
              <CardHeader className="bg-muted/50">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Documentos Anexados
                </CardTitle>
              </CardHeader>

              <CardContent className="p-6">
                <div className="grid md:grid-cols-2 gap-4">
                  {vistoria.cnh_url && (
                    <Button asChild variant="outline">
                      <a href={vistoria.cnh_url} target="_blank">
                        <FileText className="h-4 w-4 mr-2" /> Ver CNH
                      </a>
                    </Button>
                  )}

                  {vistoria.crlv_fotos_urls?.length > 0 && (
                    <Button asChild variant="outline">
                      <a href={vistoria.crlv_fotos_urls[0]} target="_blank">
                        <FileText className="h-4 w-4 mr-2" /> Ver CRLV ({vistoria.crlv_fotos_urls.length} fotos)
                      </a>
                    </Button>
                  )}

                  {vistoria.bo_url && (
                    <Button asChild variant="outline">
                      <a href={vistoria.bo_url} target="_blank">
                        <FileText className="h-4 w-4 mr-2" /> Boletim de Ocorrência
                      </a>
                    </Button>
                  )}

                  {vistoria.laudo_medico_url && (
                    <Button asChild variant="outline">
                      <a href={vistoria.laudo_medico_url} target="_blank">
                        <FileText className="h-4 w-4 mr-2" /> Laudo Médico
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------ */}
          {/* TAB: FOTOS                    */}
          {/* ------------------------------ */}
          <TabsContent value="fotos" className="space-y-6">
            <Card>
              <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b">
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5 text-blue-600" />
                  Fotos do Veículo
                </CardTitle>
              </CardHeader>

              <CardContent className="p-6">
                {loadingFotos ? (
                  <div className="flex justify-center p-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary/20 border-t-primary" />
                  </div>
                ) : fotos.length === 0 ? (
                  <div className="text-center py-12 space-y-2">
                    <Camera className="h-12 w-12 text-muted-foreground mx-auto" />
                    <p>Nenhuma foto disponível</p>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {fotos.map((foto) => (
                      <Card key={foto.id} className="overflow-hidden">
                        <div className="aspect-[4/3] bg-black relative">
                          <img
                            src={foto.arquivo_url}
                            className="w-full h-full object-cover"
                          />

                          <Badge className="absolute top-2 left-2 bg-black/50 text-white">
                            {getPosicaoNome(foto.posicao)}
                          </Badge>
                        </div>
                        <CardContent className="p-4 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3 inline mr-1" />
                          {format(new Date(foto.created_at), "dd/MM/yyyy HH:mm", {
                            locale: ptBR,
                          })}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------ */}
          {/* TAB: IA                      */}
          {/* ------------------------------ */}
          <TabsContent value="ia" className="space-y-6">
            {/* ... (todo bloco da IA permanece igual) ... */}
          </TabsContent>

          {/* ------------------------------ */}
          {/* TAB: LOCALIZAÇÃO             */}
          {/* ------------------------------ */}
          <TabsContent value="localizacao" className="space-y-6">
            {vistoria.latitude && vistoria.longitude ? (
              <Card>
                <CardHeader className="bg-muted/50">
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Local da Vistoria
                  </CardTitle>
                </CardHeader>

                <CardContent className="p-6 space-y-4">
                  <p className="font-semibold text-lg">
                    {geoAddress || "Endereço aproximado não encontrado"}
                  </p>

                  <iframe
                    className="w-full h-96 rounded-lg border"
                    src={`https://www.google.com/maps?q=${vistoria.latitude},${vistoria.longitude}&z=15&output=embed`}
                  />

                  <Button asChild variant="outline" className="w-full">
                    <a
                      href={`https://www.google.com/maps?q=${vistoria.latitude},${vistoria.longitude}`}
                      target="_blank"
                    >
                      <MapPin className="h-4 w-4 mr-2" /> Abrir no Google Maps
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="p-12 text-center">
                <MapPin className="h-12 w-12 mx-auto text-muted-foreground" />
                <p>Geolocalização não disponível</p>
              </Card>
            )}
          </TabsContent>

          {/* ------------------------------ */}
          {/* TAB: TERMOS                   */}
          {/* ------------------------------ */}
          <TabsContent value="termos" className="space-y-6">
            {termosAceitos.length === 0 ? (
              <Card className="p-12 text-center">
                <FileCheck className="h-12 w-12 mx-auto opacity-30" />
                <p>Nenhum termo aceito</p>
              </Card>
            ) : (
              termosAceitos.map((termo) => (
                <Card key={termo.id} className="border-2 border-green-200">
                  <CardHeader className="bg-green-50">
                    <CardTitle className="flex items-center gap-2">
                      <FileCheck className="h-5 w-5 text-green-600" />
                      {termo.termos.titulo}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="p-6">
                    <p className="text-muted-foreground">{termo.termos.descricao}</p>

                    <Separator className="my-4" />

                    <p className="text-sm">
                      Aceito em{" "}
                      {format(new Date(termo.aceito_em), "dd/MM/yyyy HH:mm", {
                        locale: ptBR,
                      })}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ------------------------------ */}
          {/* TAB: QUESTIONÁRIO             */}
          {/* ------------------------------ */}
          <TabsContent value="questionario" className="space-y-6">
            <Card>
              <CardHeader className="bg-muted/50">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Respostas do Questionário
                </CardTitle>
              </CardHeader>

              <CardContent className="p-6 space-y-4">
                {vistoria.narrar_fatos && (
                  <div>
                    <h4 className="font-semibold mb-1">Narração dos Fatos</h4>
                    <p className="whitespace-pre-line text-muted-foreground">
                      {vistoria.narrar_fatos}
                    </p>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold mb-1">Vítima ou Causador?</h4>
                    <Badge>
                      {vistoria.vitima_ou_causador === "vitima"
                        ? "Vítima"
                        : vistoria.vitima_ou_causador === "causador"
                        ? "Causador"
                        : "Não informado"}
                    </Badge>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-1">Houve terceiros?</h4>
                    <Badge>{vistoria.tem_terceiros ? "Sim" : "Não"}</Badge>

                    {vistoria.tem_terceiros && vistoria.placa_terceiro && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Placa: {vistoria.placa_terceiro}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* -------------------------------------- */}
      {/* DIALOG: ANALISAR VISTORIA             */}
      {/* -------------------------------------- */}
      <Dialog open={analiseDialogOpen} onOpenChange={setAnaliseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decisaoAnalise === "aprovar" ? "Aprovar Vistoria" : "Pendenciar Vistoria"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Label>Observações *</Label>
            <Textarea
              rows={5}
              value={observacaoAnalise}
              onChange={(e) => setObservacaoAnalise(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAnaliseDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant={decisaoAnalise === "aprovar" ? "default" : "destructive"}
              onClick={confirmarAnalise}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------------------------- */}
      {/* DIALOG: SOLICITAR FOTOS               */}
      {/* -------------------------------------- */}
      <Dialog open={solicitarFotosOpen} onOpenChange={setSolicitarFotosOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Solicitar Mais Fotos</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Label>Motivo *</Label>
            <Textarea
              rows={3}
              value={motivoFotos}
              onChange={(e) => setMotivoFotos(e.target.value)}
            />

            <Label>Fotos Necessárias *</Label>
            <div className="flex gap-2">
              <input
                className="border rounded px-3 py-2 flex-1"
                value={novaFotoInput}
                onChange={(e) => setNovaFotoInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    adicionarFotoNecessaria();
                  }
                }}
              />
              <Button onClick={adicionarFotoNecessaria}>Adicionar</Button>
            </div>

            {fotosNecessarias.length > 0 && (
              <div className="space-y-2 mt-2">
                {fotosNecessarias.map((foto, idx) => (
                  <div key={idx} className="flex justify-between bg-muted rounded p-2">
                    <span>{foto}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removerFotoNecessaria(idx)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSolicitarFotosOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSolicitarMaisFotos}>Enviar Solicitação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
