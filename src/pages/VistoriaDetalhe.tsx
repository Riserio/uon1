import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { 
  ArrowLeft, Download, FileText, Camera, Check, X, Send, 
  MapPin, User, Car, FileCheck, MessageSquare, Brain, Clock,
  Phone, Mail, Hash, Calendar, Shield
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { generateVistoriaPDF } from '@/components/VistoriaPDF';
import { useAuth } from '@/hooks/useAuth';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
  const [fotoSelecionada, setFotoSelecionada] = useState<any | null>(null);
  const [fotoDialogOpen, setFotoDialogOpen] = useState(false);
  const [observacaoReprovacao, setObservacaoReprovacao] = useState('');
  const [analiseDialogOpen, setAnaliseDialogOpen] = useState(false);
  const [observacaoAnalise, setObservacaoAnalise] = useState('');
  const [decisaoAnalise, setDecisaoAnalise] = useState<'aprovar' | 'pendenciar' | null>(null);
  const [solicitarFotosOpen, setSolicitarFotosOpen] = useState(false);
  const [motivoFotos, setMotivoFotos] = useState('');
  const [fotosNecessarias, setFotosNecessarias] = useState<string[]>([]);
  const [novaFotoInput, setNovaFotoInput] = useState('');

  useEffect(() => {
    loadVistoria();
  }, [id]);

  const loadVistoria = async () => {
    try {
      setLoadingFotos(true);
      const { data: vistoriaData, error: vistoriaError } = await supabase
        .from('vistorias')
        .select('*')
        .eq('id', id)
        .single();

      if (vistoriaError) throw vistoriaError;
      setVistoria(vistoriaData);

      const { data: fotosData, error: fotosError } = await supabase
        .from('vistoria_fotos')
        .select('*')
        .eq('vistoria_id', id)
        .order('ordem');

      if (fotosError) {
        console.error('Erro ao carregar fotos:', fotosError);
        toast.error('Erro ao carregar fotos da vistoria');
      }
      
      console.log('Fotos carregadas:', fotosData?.length || 0);
      setFotos(fotosData || []);

      // Carregar termos aceitos
      const { data: termosData } = await supabase
        .from('termos_aceitos')
        .select('*, termos(*)')
        .eq('vistoria_id', id);
      
      setTermosAceitos(termosData || []);

      // Carregar corretora se existir
      if (vistoriaData.corretora_id) {
        const { data: corretoraData } = await supabase
          .from('corretoras')
          .select('*')
          .eq('id', vistoriaData.corretora_id)
          .single();
        if (corretoraData) setCorretora(corretoraData);
      }

      // Carregar administradora
      const { data: adminData } = await supabase
        .from('administradora')
        .select('*')
        .limit(1)
        .single();
      if (adminData) setAdministradora(adminData);

    } catch (error) {
      console.error('Erro ao carregar vistoria:', error);
      toast.error('Erro ao carregar detalhes da vistoria');
    } finally {
      setLoading(false);
      setLoadingFotos(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      toast.loading('Gerando PDF...');
      await generateVistoriaPDF(vistoria, fotos, corretora, administradora);
      toast.dismiss();
      toast.success('PDF gerado com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.dismiss();
      toast.error('Erro ao gerar PDF');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'aguardando_fotos': return 'bg-yellow-500';
      case 'em_analise': return 'bg-blue-500';
      case 'concluida': return 'bg-green-500';
      case 'aprovada': return 'bg-green-600';
      case 'pendente_correcao': return 'bg-orange-500';
      case 'cancelada': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'aguardando_fotos': return 'Aguardando Fotos';
      case 'em_analise': return 'Em Análise';
      case 'concluida': return 'Concluída';
      case 'aprovada': return 'Aprovada';
      case 'pendente_correcao': return 'Pendente Correção';
      case 'cancelada': return 'Cancelada';
      default: return status;
    }
  };

  const getPosicaoNome = (posicao: string) => {
    const nomes: Record<string, string> = {
      frontal: 'Frontal',
      traseira: 'Traseira',
      lateral_esquerda: 'Lateral Esquerda',
      lateral_direita: 'Lateral Direita'
    };
    return nomes[posicao] || posicao;
  };

  const handleAprovarFoto = async (fotoId: string) => {
    try {
      setFotos(prevFotos => prevFotos.map(f => 
        f.id === fotoId 
          ? { ...f, status_aprovacao: 'aprovada', aprovada_em: new Date().toISOString(), aprovada_por: user?.id }
          : f
      ));

      const { error } = await supabase
        .from('vistoria_fotos')
        .update({
          status_aprovacao: 'aprovada',
          aprovada_por: user?.id,
          aprovada_em: new Date().toISOString(),
          observacao_reprovacao: null
        })
        .eq('id', fotoId);

      if (error) throw error;
      toast.success('Foto aprovada!');
    } catch (error) {
      console.error('Erro ao aprovar foto:', error);
      toast.error('Erro ao aprovar foto');
      loadVistoria();
    }
  };

  const handleReprovarFoto = (foto: any) => {
    setFotoSelecionada(foto);
    setObservacaoReprovacao('');
    setFotoDialogOpen(true);
  };

  const confirmarReprovacao = async () => {
    if (!observacaoReprovacao.trim()) {
      toast.error('Por favor, informe o motivo da reprovação');
      return;
    }

    try {
      const { error } = await supabase
        .from('vistoria_fotos')
        .update({
          status_aprovacao: 'reprovada',
          aprovada_por: user?.id,
          aprovada_em: new Date().toISOString(),
          observacao_reprovacao: observacaoReprovacao
        })
        .eq('id', fotoSelecionada.id);

      if (error) throw error;

      // Gerar novo link para cliente refazer fotos reprovadas
      if (vistoria.link_token) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await supabase
          .from('vistorias')
          .update({
            link_expires_at: expiresAt.toISOString(),
            status: 'pendente_correcao'
          })
          .eq('id', vistoria.id);
      }

      toast.success('Foto reprovada. Cliente será notificado para enviar nova foto.');
      setFotoDialogOpen(false);
      setFotoSelecionada(null);
      setObservacaoReprovacao('');
      loadVistoria();
    } catch (error) {
      console.error('Erro ao reprovar foto:', error);
      toast.error('Erro ao reprovar foto');
    }
  };

  const handleAprovarTodasFotos = async () => {
    try {
      const fotosPendentes = fotos.filter(f => f.status_aprovacao === 'pendente');
      
      for (const foto of fotosPendentes) {
        await supabase
          .from('vistoria_fotos')
          .update({
            status_aprovacao: 'aprovada',
            aprovada_por: user?.id,
            aprovada_em: new Date().toISOString()
          })
          .eq('id', foto.id);
      }

      await supabase
        .from('vistorias')
        .update({ status: 'aprovada' })
        .eq('id', vistoria.id);

      if (vistoria.atendimento_id) {
        const { data: atendimento } = await supabase
          .from('atendimentos')
          .select('tags')
          .eq('id', vistoria.atendimento_id)
          .single();

        if (atendimento?.tags) {
          const newTags = atendimento.tags
            .filter((tag: string) => !['aguardando_vistoria_digital', 'vistoria_concluida', 'pendente_vistoria'].includes(tag))
            .concat('vistoria_aprovada');

          await supabase
            .from('atendimentos')
            .update({ tags: newTags })
            .eq('id', vistoria.atendimento_id);
        }
      }

      toast.success('Todas as fotos foram aprovadas!');
      loadVistoria();
    } catch (error) {
      console.error('Erro ao aprovar fotos:', error);
      toast.error('Erro ao aprovar fotos');
    }
  };

  const handleAbrirAnalise = (decisao: 'aprovar' | 'pendenciar') => {
    setDecisaoAnalise(decisao);
    setObservacaoAnalise('');
    setAnaliseDialogOpen(true);
  };

  const confirmarAnalise = async () => {
    if (!observacaoAnalise.trim()) {
      toast.error('Por favor, informe suas observações sobre a análise');
      return;
    }

    try {
      const novoStatus = decisaoAnalise === 'aprovar' ? 'aprovada' : 'pendente_correcao';
      
      await supabase
        .from('vistorias')
        .update({ 
          status: novoStatus,
          observacoes: observacaoAnalise
        })
        .eq('id', vistoria.id);

      if (vistoria.atendimento_id) {
        const { data: atendimento } = await supabase
          .from('atendimentos')
          .select('tags')
          .eq('id', vistoria.atendimento_id)
          .single();

        if (atendimento?.tags) {
          const newTags = atendimento.tags
            .filter((tag: string) => !['aguardando_vistoria_digital', 'vistoria_concluida', 'pendente_vistoria'].includes(tag))
            .concat(decisaoAnalise === 'aprovar' ? 'vistoria_aprovada' : 'vistoria_pendente');

          await supabase
            .from('atendimentos')
            .update({ tags: newTags })
            .eq('id', vistoria.atendimento_id);
        }
      }

      toast.success(decisaoAnalise === 'aprovar' ? 'Vistoria aprovada!' : 'Vistoria pendenciada!');
      setAnaliseDialogOpen(false);
      setDecisaoAnalise(null);
      setObservacaoAnalise('');
      loadVistoria();
    } catch (error) {
      console.error('Erro ao analisar vistoria:', error);
      toast.error('Erro ao processar análise');
    }
  };

  const handleSolicitarMaisFotos = async () => {
    if (!motivoFotos.trim()) {
      toast.error('Por favor, informe o motivo da solicitação');
      return;
    }

    if (fotosNecessarias.length === 0) {
      toast.error('Por favor, adicione pelo menos uma foto necessária');
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('solicitar-mais-fotos', {
        body: {
          vistoriaId: vistoria.id,
          motivo: motivoFotos,
          fotosNecessarias
        }
      });

      if (error) throw error;

      toast.success('Solicitação enviada! Cliente receberá um email com o link renovado.');
      setSolicitarFotosOpen(false);
      setMotivoFotos('');
      setFotosNecessarias([]);
      setNovaFotoInput('');
      loadVistoria();
    } catch (error) {
      console.error('Erro ao solicitar fotos:', error);
      toast.error('Erro ao enviar solicitação');
    }
  };

  const adicionarFotoNecessaria = () => {
    if (novaFotoInput.trim()) {
      setFotosNecessarias([...fotosNecessarias, novaFotoInput.trim()]);
      setNovaFotoInput('');
    }
  };

  const removerFotoNecessaria = (index: number) => {
    setFotosNecessarias(fotosNecessarias.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary/20 border-t-primary"></div>
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/vistorias')} size="lg">
            <ArrowLeft className="h-5 w-5 mr-2" />
            Voltar
          </Button>

          <div className="flex gap-2">
            {vistoria.tipo_abertura === 'digital' && vistoria.analise_ia && (
              <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-200">
                <Brain className="h-3 w-3 mr-1" />
                Análise por IA
              </Badge>
            )}
            {vistoria.status !== 'cancelada' && (
              <Button 
                variant="outline" 
                className="gap-2"
                onClick={() => setSolicitarFotosOpen(true)}
              >
                <Camera className="h-4 w-4" />
                Solicitar Mais Fotos
              </Button>
            )}
            <Button className="gap-2" onClick={handleExportPDF}>
              <Download className="h-4 w-4" />
              Exportar PDF
            </Button>
          </div>
        </div>

        {/* Status Card */}
        <Card className="border-2">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Hash className="h-6 w-6 text-muted-foreground" />
                  <h1 className="text-3xl font-bold">Vistoria #{vistoria.numero}</h1>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant={vistoria.tipo_abertura === 'digital' ? 'default' : 'secondary'} className="text-sm">
                    {vistoria.tipo_abertura === 'digital' ? (
                      <><Camera className="h-3 w-3 mr-1" /> Digital</>
                    ) : (
                      <><FileText className="h-3 w-3 mr-1" /> Manual</>
                    )}
                  </Badge>
                  <Badge variant="outline" className="text-sm">
                    {vistoria.tipo_vistoria === 'sinistro' ? 'Sinistro' : 'Reativação'}
                  </Badge>
                  <Badge className={cn("text-sm", getStatusColor(vistoria.status))}>
                    {getStatusLabel(vistoria.status)}
                  </Badge>
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>Criada em {format(new Date(vistoria.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                </div>
                {vistoria.completed_at && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4" />
                    <span>Concluída em {format(new Date(vistoria.completed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs Content */}
        <Tabs defaultValue="geral" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 lg:w-auto">
            <TabsTrigger value="geral">
              <User className="h-4 w-4 mr-2" />
              Geral
            </TabsTrigger>
            <TabsTrigger value="fotos">
              <Camera className="h-4 w-4 mr-2" />
              Fotos
            </TabsTrigger>
            <TabsTrigger value="ia">
              <Brain className="h-4 w-4 mr-2" />
              Análise IA
            </TabsTrigger>
            <TabsTrigger value="localizacao">
              <MapPin className="h-4 w-4 mr-2" />
              Localização
            </TabsTrigger>
            <TabsTrigger value="termos">
              <FileCheck className="h-4 w-4 mr-2" />
              Termos
            </TabsTrigger>
            <TabsTrigger value="questionario">
              <MessageSquare className="h-4 w-4 mr-2" />
              Respostas
            </TabsTrigger>
          </TabsList>

          {/* Tab: Geral */}
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
                      <p className="font-semibold">{vistoria.veiculo_marca} {vistoria.veiculo_modelo}</p>
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

            {/* CNH Data */}
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

            {/* Documentos Anexos */}
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
                    <Button variant="outline" asChild>
                      <a href={vistoria.cnh_url} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-4 w-4 mr-2" />
                        Ver CNH
                      </a>
                    </Button>
                  )}
                  {vistoria.crlv_fotos_urls && vistoria.crlv_fotos_urls.length > 0 && (
                    <Button variant="outline" asChild>
                      <a href={vistoria.crlv_fotos_urls[0]} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-4 w-4 mr-2" />
                        Ver CRLV ({vistoria.crlv_fotos_urls.length} foto{vistoria.crlv_fotos_urls.length > 1 ? 's' : ''})
                      </a>
                    </Button>
                  )}
                  {vistoria.bo_url && (
                    <Button variant="outline" asChild>
                      <a href={vistoria.bo_url} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-4 w-4 mr-2" />
                        Boletim de Ocorrência
                      </a>
                    </Button>
                  )}
                  {vistoria.laudo_medico_url && (
                    <Button variant="outline" asChild>
                      <a href={vistoria.laudo_medico_url} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-4 w-4 mr-2" />
                        Laudo Médico
                      </a>
                    </Button>
                  )}
                  {vistoria.atestado_obito_url && (
                    <Button variant="outline" asChild>
                      <a href={vistoria.atestado_obito_url} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-4 w-4 mr-2" />
                        Atestado de Óbito
                      </a>
                    </Button>
                  )}
                  {vistoria.laudo_alcoolemia_url && (
                    <Button variant="outline" asChild>
                      <a href={vistoria.laudo_alcoolemia_url} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-4 w-4 mr-2" />
                        Laudo de Alcoolemia
                      </a>
                    </Button>
                  )}
                  {vistoria.croqui_acidente_url && (
                    <Button variant="outline" asChild>
                      <a href={vistoria.croqui_acidente_url} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-4 w-4 mr-2" />
                        Croqui do Acidente
                      </a>
                    </Button>
                  )}
                  {vistoria.assinatura_url && (
                    <Button variant="outline" asChild>
                      <a href={vistoria.assinatura_url} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-4 w-4 mr-2" />
                        Assinatura Digital
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Fotos */}
          <TabsContent value="fotos" className="space-y-6">
            <Card>
              <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/50 dark:to-purple-950/50 border-b">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <Camera className="h-5 w-5 text-blue-600" />
                      Fotos do Veículo
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {loadingFotos ? 'Carregando...' : `${fotos.length} foto${fotos.length !== 1 ? 's' : ''} ${fotos.length !== 1 ? 'registradas' : 'registrada'}`}
                    </p>
                  </div>
                  {vistoria.tipo_abertura === 'manual' && fotos.some(f => f.status_aprovacao === 'pendente') && (
                    <Button onClick={handleAprovarTodasFotos} size="sm" className="gap-2 bg-green-600 hover:bg-green-700">
                      <Check className="h-4 w-4" />
                      Aprovar Todas ({fotos.filter(f => f.status_aprovacao === 'pendente').length})
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {loadingFotos ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary/20 border-t-primary"></div>
                    <p className="text-sm text-muted-foreground">Carregando fotos...</p>
                  </div>
                ) : fotos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-4 text-center">
                    <div className="rounded-full bg-muted p-6">
                      <Camera className="h-12 w-12 text-muted-foreground/50" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-lg font-medium">Nenhuma foto disponível</p>
                      <p className="text-sm text-muted-foreground max-w-sm">
                        {vistoria.status === 'aguardando_fotos' 
                          ? 'As fotos aparecerão aqui assim que forem enviadas pelo cliente.'
                          : 'Esta vistoria não possui fotos registradas.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {fotos.map((foto) => (
                      <Card key={foto.id} className="overflow-hidden border-2 hover:border-primary/50 transition-all duration-200">
                        <div className="relative group aspect-[4/3]">
                          <img
                            src={foto.arquivo_url}
                            alt={getPosicaoNome(foto.posicao)}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              console.error('Erro ao carregar imagem:', foto.arquivo_url);
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f0f0f0" width="400" height="300"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImagem não disponível%3C/text%3E%3C/svg%3E';
                            }}
                          />
                          <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-2">
                            <Badge variant="secondary" className="bg-black/60 text-white backdrop-blur-sm">
                              {getPosicaoNome(foto.posicao)}
                            </Badge>
                            <Badge 
                              className={cn(
                                "backdrop-blur-sm",
                                foto.status_aprovacao === 'aprovada' ? 'bg-green-500 hover:bg-green-600' :
                                foto.status_aprovacao === 'reprovada' ? 'bg-red-500 hover:bg-red-600' :
                                'bg-yellow-500 hover:bg-yellow-600'
                              )}
                            >
                              {foto.status_aprovacao === 'aprovada' ? (
                                <><Check className="h-3 w-3 mr-1" /> Aprovada</>
                              ) : foto.status_aprovacao === 'reprovada' ? (
                                <><X className="h-3 w-3 mr-1" /> Reprovada</>
                              ) : (
                                <><Clock className="h-3 w-3 mr-1" /> Pendente</>
                              )}
                            </Badge>
                          </div>
                          
                          {vistoria.tipo_abertura === 'manual' && foto.status_aprovacao === 'pendente' && (
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end">
                              <div className="w-full p-3 space-y-2">
                                <p className="text-white text-xs font-medium mb-2">Ações da Foto:</p>
                                <div className="grid grid-cols-2 gap-2">
                                  <Button 
                                    size="sm" 
                                    variant="default"
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                    onClick={() => handleAprovarFoto(foto.id)}
                                  >
                                    <Check className="h-4 w-4 mr-1" />
                                    Aprovar
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="destructive"
                                    onClick={() => handleReprovarFoto(foto)}
                                  >
                                    <X className="h-4 w-4 mr-1" />
                                    Reprovar
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <CardContent className="p-4 space-y-3">
                          {foto.aprovada_em && (
                            <div className="text-xs text-muted-foreground">
                              <Clock className="h-3 w-3 inline mr-1" />
                              {format(new Date(foto.aprovada_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </div>
                          )}
                          
                          {foto.observacao_reprovacao && (
                            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3 space-y-1">
                              <p className="text-xs text-red-600 dark:text-red-400 font-semibold flex items-center gap-1">
                                <X className="h-3 w-3" />
                                Motivo da reprovação:
                              </p>
                              <p className="text-xs text-red-700 dark:text-red-300">{foto.observacao_reprovacao}</p>
                            </div>
                          )}
                          
                          {foto.analise_ia && (
                            <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3 space-y-1">
                              <p className="text-xs text-purple-600 dark:text-purple-400 font-semibold flex items-center gap-1">
                                <Brain className="h-3 w-3" />
                                Análise IA:
                              </p>
                              <p className="text-xs text-purple-700 dark:text-purple-300 leading-relaxed">
                                {typeof foto.analise_ia === 'string' ? foto.analise_ia : foto.analise_ia.analise || 'Análise não disponível'}
                              </p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Análise IA */}
          <TabsContent value="ia" className="space-y-6">
            {vistoria.analise_ia || vistoria.observacoes_ia || vistoria.danos_detectados?.length > 0 ? (
              <div className="space-y-6">
                {/* Veículo Detectado */}
                {(vistoria.veiculo_placa || vistoria.veiculo_marca || vistoria.veiculo_modelo) && (
                  <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
                    <CardHeader className="bg-blue-100/50 dark:bg-blue-900/20">
                      <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                        <Car className="h-5 w-5" />
                        Veículo Identificado pela IA
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="grid md:grid-cols-3 gap-4">
                        {vistoria.veiculo_placa && (
                          <div className="bg-white dark:bg-background rounded-lg p-4 border border-blue-200">
                            <span className="text-xs text-muted-foreground block mb-1">Placa</span>
                            <p className="font-bold text-xl tracking-wider">{vistoria.veiculo_placa}</p>
                          </div>
                        )}
                        {vistoria.veiculo_marca && (
                          <div className="bg-white dark:bg-background rounded-lg p-4 border border-blue-200">
                            <span className="text-xs text-muted-foreground block mb-1">Marca</span>
                            <p className="font-semibold text-lg">{vistoria.veiculo_marca}</p>
                          </div>
                        )}
                        {vistoria.veiculo_modelo && (
                          <div className="bg-white dark:bg-background rounded-lg p-4 border border-blue-200">
                            <span className="text-xs text-muted-foreground block mb-1">Modelo</span>
                            <p className="font-semibold text-lg">{vistoria.veiculo_modelo}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Danos Detectados */}
                {vistoria.danos_detectados && vistoria.danos_detectados.length > 0 && (
                  <Card className="border-2 border-red-200 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20">
                    <CardHeader className="bg-red-100/50 dark:bg-red-900/20">
                      <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                        <Shield className="h-5 w-5" />
                        Danos Detectados ({vistoria.danos_detectados.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="flex gap-2 flex-wrap">
                        {vistoria.danos_detectados.map((dano: string, index: number) => (
                          <Badge key={index} variant="destructive" className="text-sm px-3 py-1">
                            <X className="h-3 w-3 mr-1" />
                            {dano}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Resumo da Análise */}
                <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20">
                  <CardHeader className="bg-purple-100/50 dark:bg-purple-900/20">
                    <CardTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
                      <Brain className="h-6 w-6" />
                      Análise por Inteligência Artificial
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    {vistoria.observacoes_ia && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="h-1 w-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"></div>
                          <h4 className="font-semibold text-purple-900 dark:text-purple-300">Resumo Executivo</h4>
                        </div>
                        <div className="bg-white dark:bg-background rounded-lg border-2 border-purple-200 dark:border-purple-800 p-5">
                          <p className="whitespace-pre-wrap text-foreground/80 leading-relaxed">
                            {vistoria.observacoes_ia}
                          </p>
                        </div>
                      </div>
                    )}

                    {vistoria.analise_ia && vistoria.analise_ia.analises && vistoria.analise_ia.analises.length > 0 && (
                      <>
                        {vistoria.observacoes_ia && <Separator className="my-6" />}
                        <div>
                          <div className="flex items-center gap-2 mb-4">
                            <div className="h-1 w-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"></div>
                            <h4 className="font-semibold text-purple-900 dark:text-purple-300">Análise Detalhada por Foto</h4>
                          </div>
                          <div className="space-y-4">
                            {vistoria.analise_ia.analises.map((analise: any, index: number) => (
                              <Card key={index} className="bg-white dark:bg-background border-2 border-purple-200/50 hover:border-purple-300 transition-colors">
                                <CardContent className="p-5">
                                  <div className="flex items-start gap-4">
                                    <div className="flex-shrink-0">
                                      <Badge variant="outline" className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-300">
                                        <Camera className="h-3 w-3 mr-1" />
                                        {getPosicaoNome(analise.posicao)}
                                      </Badge>
                                    </div>
                                    <div className="flex-1 space-y-2">
                                      <p className="text-sm text-foreground/70 leading-relaxed">
                                        {analise.analise}
                                      </p>
                                      {analise.danos_encontrados && analise.danos_encontrados.length > 0 && (
                                        <div className="flex gap-1 flex-wrap mt-2">
                                          {analise.danos_encontrados.map((dano: string, idx: number) => (
                                            <Badge key={idx} variant="secondary" className="text-xs">
                                              {dano}
                                            </Badge>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Metadados da Análise */}
                    {vistoria.analise_ia && (
                      <div className="bg-purple-100/50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
                        <div className="flex items-center gap-2 text-xs text-purple-700 dark:text-purple-400">
                          <Clock className="h-3.5 w-3.5" />
                          <span>Análise gerada automaticamente por IA em {format(new Date(vistoria.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card className="border-2 border-dashed border-muted">
                <CardContent className="p-12 text-center">
                  <div className="rounded-full bg-muted/50 p-6 w-fit mx-auto mb-4">
                    <Brain className="h-12 w-12 text-muted-foreground/50" />
                  </div>
                  <p className="text-lg font-semibold mb-2">Análise de IA não disponível</p>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    {vistoria.tipo_abertura === 'manual' 
                      ? 'Vistorias manuais não possuem análise automatizada. A análise deve ser feita manualmente pelo time técnico.'
                      : 'A análise será gerada automaticamente assim que as fotos forem enviadas e processadas pelo sistema.'}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab: Localização */}
          <TabsContent value="localizacao" className="space-y-6">
            {vistoria.latitude && vistoria.longitude ? (
              <Card>
                <CardHeader className="bg-muted/50">
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Geolocalização
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm text-muted-foreground">Latitude</span>
                      <p className="font-mono">{vistoria.latitude.toFixed(6)}</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Longitude</span>
                      <p className="font-mono">{vistoria.longitude.toFixed(6)}</p>
                    </div>
                  </div>

                  {vistoria.endereco && (
                    <div>
                      <span className="text-sm text-muted-foreground">Endereço</span>
                      <p>{vistoria.endereco}</p>
                    </div>
                  )}

                  <Separator />

                  <div className="space-y-2">
                    <iframe
                      src={`https://www.google.com/maps?q=${vistoria.latitude},${vistoria.longitude}&hl=pt-BR&z=15&output=embed`}
                      className="w-full h-96 rounded-lg border"
                      loading="lazy"
                    />
                    <Button variant="outline" asChild className="w-full">
                      <a
                        href={`https://www.google.com/maps?q=${vistoria.latitude},${vistoria.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MapPin className="h-4 w-4 mr-2" />
                        Abrir no Google Maps
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Geolocalização não disponível</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab: Termos */}
          <TabsContent value="termos" className="space-y-6">
            {termosAceitos.length > 0 ? (
              <div className="space-y-4">
                {termosAceitos.map((termo) => (
                  <Card key={termo.id} className="border-2 border-green-200 hover:border-green-300 transition-colors">
                    <CardHeader className="bg-green-50/50">
                      <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-lg">
                          <FileCheck className="h-5 w-5 text-green-600" />
                          {termo.termos.titulo}
                        </div>
                        <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                          <Check className="h-3 w-3 mr-1" />
                          Aceito
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                      {termo.termos.descricao && (
                        <p className="text-muted-foreground">{termo.termos.descricao}</p>
                      )}

                      <Separator />

                      <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                        <h4 className="font-semibold text-sm">Dados do Aceite</h4>
                        <div className="grid md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground block mb-1">Data e Hora:</span>
                            <p className="font-medium">
                              {format(new Date(termo.aceito_em), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground block mb-1">Endereço IP:</span>
                            <p className="font-mono text-xs bg-background px-2 py-1 rounded border">
                              {termo.ip_address || 'Não disponível'}
                            </p>
                          </div>
                          {termo.user_agent && (
                            <div className="md:col-span-3">
                              <span className="text-muted-foreground block mb-1">Dispositivo:</span>
                              <p className="font-mono text-xs bg-background px-2 py-1 rounded border break-all">
                                {termo.user_agent}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-3">
                        {termo.termos.arquivo_url && (
                          <Button variant="outline" asChild className="flex-1 gap-2">
                            <a href={termo.termos.arquivo_url} target="_blank" rel="noopener noreferrer">
                              <FileText className="h-4 w-4" />
                              Ver Documento
                            </a>
                          </Button>
                        )}
                        {vistoria.assinatura_url && (
                          <Button 
                            variant="outline" 
                            asChild 
                            className="flex-1 gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300"
                          >
                            <a href={vistoria.assinatura_url} target="_blank" rel="noopener noreferrer">
                              <FileCheck className="h-4 w-4" />
                              Ver Assinatura
                            </a>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <FileCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
                  <p className="text-lg font-medium mb-2">Nenhum termo assinado</p>
                  <p className="text-sm text-muted-foreground">Os termos aceitos aparecerão aqui quando disponíveis</p>
                  
                  {vistoria.assinatura_url && (
                    <div className="mt-6">
                      <Separator className="mb-6" />
                      <Button 
                        variant="outline"
                        asChild
                        className="gap-2"
                      >
                        <a href={vistoria.assinatura_url} target="_blank" rel="noopener noreferrer">
                          <FileCheck className="h-4 w-4" />
                          Visualizar Assinatura Digital
                        </a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab: Questionário */}
          <TabsContent value="questionario" className="space-y-6">
            <Card>
              <CardHeader className="bg-muted/50">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Respostas do Questionário
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {/* Dados do Evento */}
                  {(vistoria.data_evento || vistoria.hora_evento) && (
                    <div>
                      <h4 className="font-semibold mb-2">Data e Hora do Evento</h4>
                      <p className="text-muted-foreground">
                        {vistoria.data_evento && format(new Date(vistoria.data_evento), "dd/MM/yyyy", { locale: ptBR })}
                        {vistoria.hora_evento && ` às ${vistoria.hora_evento}`}
                      </p>
                    </div>
                  )}

                  {vistoria.condutor_veiculo && (
                    <div>
                      <h4 className="font-semibold mb-2">Condutor do Veículo</h4>
                      <p className="text-muted-foreground">{vistoria.condutor_veiculo}</p>
                    </div>
                  )}

                  {vistoria.narrar_fatos && (
                    <div>
                      <h4 className="font-semibold mb-2">Narração dos Fatos</h4>
                      <p className="text-muted-foreground whitespace-pre-wrap">{vistoria.narrar_fatos}</p>
                    </div>
                  )}

                  <Separator />

                  {/* Respostas Sim/Não */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold mb-2">Vítima ou Causador?</h4>
                      <Badge variant={vistoria.vitima_ou_causador === 'vitima' ? 'destructive' : 'secondary'}>
                        {vistoria.vitima_ou_causador === 'vitima' ? 'Vítima' : 
                         vistoria.vitima_ou_causador === 'causador' ? 'Causador' : 'Não informado'}
                      </Badge>
                    </div>

                    <div>
                      <h4 className="font-semibold mb-2">Houve terceiros envolvidos?</h4>
                      <Badge variant={vistoria.tem_terceiros ? 'default' : 'secondary'}>
                        {vistoria.tem_terceiros ? 'Sim' : 'Não'}
                      </Badge>
                      {vistoria.tem_terceiros && vistoria.placa_terceiro && (
                        <p className="text-sm text-muted-foreground mt-1">Placa: {vistoria.placa_terceiro}</p>
                      )}
                    </div>

                    <div>
                      <h4 className="font-semibold mb-2">Local possui câmeras?</h4>
                      <Badge variant={vistoria.local_tem_camera ? 'default' : 'secondary'}>
                        {vistoria.local_tem_camera ? 'Sim' : 'Não'}
                      </Badge>
                    </div>

                    <div>
                      <h4 className="font-semibold mb-2">Fez Boletim de Ocorrência?</h4>
                      <Badge variant={vistoria.fez_bo ? 'default' : 'secondary'}>
                        {vistoria.fez_bo ? 'Sim' : 'Não'}
                      </Badge>
                    </div>

                    <div>
                      <h4 className="font-semibold mb-2">Foi ao hospital?</h4>
                      <Badge variant={vistoria.foi_hospital ? 'default' : 'secondary'}>
                        {vistoria.foi_hospital ? 'Sim' : 'Não'}
                      </Badge>
                    </div>

                    <div>
                      <h4 className="font-semibold mb-2">O motorista faleceu?</h4>
                      <Badge variant={vistoria.motorista_faleceu ? 'destructive' : 'secondary'}>
                        {vistoria.motorista_faleceu ? 'Sim' : 'Não'}
                      </Badge>
                    </div>

                    <div>
                      <h4 className="font-semibold mb-2">A polícia foi ao local?</h4>
                      <Badge variant={vistoria.policia_foi_local ? 'default' : 'secondary'}>
                        {vistoria.policia_foi_local ? 'Sim' : 'Não'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog de reprovação */}
      <Dialog open={fotoDialogOpen} onOpenChange={setFotoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprovar Foto</DialogTitle>
            <DialogDescription>
              Informe o motivo da reprovação. O cliente poderá enviar uma nova foto através do link.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="observacao">Motivo da Reprovação *</Label>
              <Textarea
                id="observacao"
                value={observacaoReprovacao}
                onChange={(e) => setObservacaoReprovacao(e.target.value)}
                placeholder="Ex: Foto fora de foco, ângulo incorreto, etc."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFotoDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarReprovacao} className="gap-2">
              <Send className="h-4 w-4" />
              Reprovar e Notificar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de análise da vistoria */}
      <Dialog open={analiseDialogOpen} onOpenChange={setAnaliseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decisaoAnalise === 'aprovar' ? 'Aprovar Vistoria' : 'Pendenciar Vistoria'}
            </DialogTitle>
            <DialogDescription>
              {decisaoAnalise === 'aprovar' 
                ? 'Adicione observações sobre a aprovação da vistoria (opcional mas recomendado).'
                : 'Informe os motivos pelos quais a vistoria está sendo pendenciada.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="analise">
                {decisaoAnalise === 'aprovar' ? 'Observações' : 'Motivos da Pendência'} *
              </Label>
              <Textarea
                id="analise"
                value={observacaoAnalise}
                onChange={(e) => setObservacaoAnalise(e.target.value)}
                placeholder={
                  decisaoAnalise === 'aprovar' 
                    ? "Ex: Vistoria aprovada conforme análise técnica. Todas as fotos estão adequadas..."
                    : "Ex: Fotos do veículo apresentam qualidade insuficiente para análise..."
                }
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnaliseDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              variant={decisaoAnalise === 'aprovar' ? 'default' : 'destructive'} 
              onClick={confirmarAnalise} 
              className="gap-2"
            >
              {decisaoAnalise === 'aprovar' ? (
                <>
                  <Check className="h-4 w-4" />
                  Confirmar Aprovação
                </>
              ) : (
                <>
                  <X className="h-4 w-4" />
                  Confirmar Pendência
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de solicitar mais fotos */}
      <Dialog open={solicitarFotosOpen} onOpenChange={setSolicitarFotosOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Solicitar Mais Fotos ao Cliente
            </DialogTitle>
            <DialogDescription>
              O cliente receberá um email com o link renovado para enviar as fotos adicionais.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="motivo">Motivo da Solicitação *</Label>
              <Textarea
                id="motivo"
                value={motivoFotos}
                onChange={(e) => setMotivoFotos(e.target.value)}
                placeholder="Ex: Necessário fotos mais próximas dos danos na lateral direita..."
                rows={3}
              />
            </div>
            
            <div>
              <Label>Fotos Necessárias *</Label>
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={novaFotoInput}
                  onChange={(e) => setNovaFotoInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && adicionarFotoNecessaria()}
                  placeholder="Ex: Lateral direita - detalhes dos arranhões"
                  className="flex-1 px-3 py-2 border rounded-md"
                />
                <Button onClick={adicionarFotoNecessaria} type="button">
                  Adicionar
                </Button>
              </div>
              
              {fotosNecessarias.length > 0 && (
                <div className="mt-3 space-y-2">
                  {fotosNecessarias.map((foto, index) => (
                    <div key={index} className="flex items-center justify-between bg-muted p-2 rounded-md">
                      <span className="text-sm">{foto}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removerFotoNecessaria(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-800">
                <strong>ℹ️ Informações:</strong>
              </p>
              <ul className="text-sm text-blue-700 mt-2 space-y-1 list-disc list-inside">
                <li>O link será válido por 7 dias</li>
                <li>Cliente poderá tirar fotos ou enviar da galeria</li>
                <li>Status da vistoria será alterado para "Aguardando Fotos"</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSolicitarFotosOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSolicitarMaisFotos} className="gap-2">
              <Send className="h-4 w-4" />
              Enviar Solicitação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
