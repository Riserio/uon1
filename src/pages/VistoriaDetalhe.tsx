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
  const [corretora, setCorretora] = useState<any>(null);
  const [administradora, setAdministradora] = useState<any>(null);
  const [fotoSelecionada, setFotoSelecionada] = useState<any | null>(null);
  const [fotoDialogOpen, setFotoDialogOpen] = useState(false);
  const [observacaoReprovacao, setObservacaoReprovacao] = useState('');

  useEffect(() => {
    loadVistoria();
  }, [id]);

  useEffect(() => {
    // Aprovar automaticamente se for vistoria digital com análise IA
    if (vistoria && vistoria.tipo_abertura === 'digital' && vistoria.analise_ia && vistoria.status === 'em_analise') {
      aprovarAutomaticamente();
    }
  }, [vistoria]);

  const aprovarAutomaticamente = async () => {
    try {
      // Aprovar todas as fotos
      await supabase
        .from('vistoria_fotos')
        .update({
          status_aprovacao: 'aprovada',
          aprovada_por: 'sistema',
          aprovada_em: new Date().toISOString()
        })
        .eq('vistoria_id', vistoria.id);

      // Atualizar status da vistoria
      await supabase
        .from('vistorias')
        .update({ status: 'aprovada' })
        .eq('id', vistoria.id);

      // Atualizar tags do atendimento
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

      toast.success('Vistoria digital aprovada automaticamente pela IA!');
      loadVistoria();
    } catch (error) {
      console.error('Erro ao aprovar automaticamente:', error);
    }
  };

  const loadVistoria = async () => {
    try {
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

      if (fotosError) throw fotosError;
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
              <CardHeader className="bg-muted/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Camera className="h-5 w-5" />
                    Fotos do Veículo ({fotos.length})
                  </CardTitle>
                  {vistoria.tipo_abertura === 'manual' && fotos.some(f => f.status_aprovacao === 'pendente') && (
                    <Button onClick={handleAprovarTodasFotos} size="sm" className="gap-2">
                      <Check className="h-4 w-4" />
                      Aprovar Todas
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {fotos.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhuma foto enviada ainda</p>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {fotos.map((foto) => (
                      <Card key={foto.id} className="overflow-hidden">
                        <div className="relative group">
                          <img
                            src={foto.arquivo_url}
                            alt={getPosicaoNome(foto.posicao)}
                            className="w-full h-64 object-cover"
                          />
                          <Badge 
                            className={cn(
                              "absolute top-2 right-2",
                              foto.status_aprovacao === 'aprovada' ? 'bg-green-500' :
                              foto.status_aprovacao === 'reprovada' ? 'bg-red-500' :
                              'bg-yellow-500'
                            )}
                          >
                            {foto.status_aprovacao === 'aprovada' ? 'Aprovada' :
                             foto.status_aprovacao === 'reprovada' ? 'Reprovada' :
                             'Pendente'}
                          </Badge>
                          
                          {vistoria.tipo_abertura === 'manual' && foto.status_aprovacao === 'pendente' && (
                            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="flex gap-2">
                                <Button 
                                  size="sm" 
                                  variant="default"
                                  className="flex-1 bg-green-600 hover:bg-green-700"
                                  onClick={() => handleAprovarFoto(foto.id)}
                                >
                                  <Check className="h-4 w-4 mr-1" />
                                  Aprovar
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="destructive"
                                  className="flex-1"
                                  onClick={() => handleReprovarFoto(foto)}
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  Reprovar
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <CardContent className="p-4">
                          <h3 className="font-semibold mb-2">{getPosicaoNome(foto.posicao)}</h3>
                          
                          {foto.observacao_reprovacao && (
                            <div className="bg-red-50 border border-red-200 rounded p-2 mb-2">
                              <p className="text-xs text-red-600 font-medium">Motivo da reprovação:</p>
                              <p className="text-xs text-red-700">{foto.observacao_reprovacao}</p>
                            </div>
                          )}
                          
                          {foto.analise_ia && (
                            <div className="bg-purple-50 border border-purple-200 rounded p-2">
                              <p className="text-xs text-purple-600 font-medium mb-1">Análise IA:</p>
                              <p className="text-xs text-purple-700">{foto.analise_ia.analise || foto.analise_ia}</p>
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
            {vistoria.analise_ia || vistoria.observacoes_ia ? (
              <Card className="border-2 border-purple-200 bg-purple-50/50">
                <CardHeader className="bg-purple-100/50">
                  <CardTitle className="flex items-center gap-2 text-purple-700">
                    <Brain className="h-6 w-6" />
                    Análise por Inteligência Artificial
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {vistoria.danos_detectados && vistoria.danos_detectados.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-3 text-purple-900">Danos Detectados:</h4>
                      <div className="flex gap-2 flex-wrap">
                        {vistoria.danos_detectados.map((dano: string, index: number) => (
                          <Badge key={index} variant="destructive" className="text-sm">
                            {dano}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <Separator />
                  
                  {vistoria.observacoes_ia && (
                    <div>
                      <h4 className="font-semibold mb-3 text-purple-900">Resumo Executivo:</h4>
                      <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed">
                        {vistoria.observacoes_ia}
                      </p>
                    </div>
                  )}

                  {vistoria.analise_ia && typeof vistoria.analise_ia === 'object' && (
                    <div>
                      <h4 className="font-semibold mb-3 text-purple-900">Análise Detalhada:</h4>
                      <pre className="whitespace-pre-wrap text-sm text-muted-foreground bg-white p-4 rounded border">
                        {JSON.stringify(vistoria.analise_ia, null, 2)}
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhuma análise de IA disponível para esta vistoria</p>
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
                  <Card key={termo.id}>
                    <CardHeader className="bg-muted/50">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <FileCheck className="h-5 w-5 text-green-600" />
                        {termo.termos.titulo}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                      {termo.termos.descricao && (
                        <p className="text-muted-foreground">{termo.termos.descricao}</p>
                      )}

                      <Separator />

                      <div className="grid md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Aceito em:</span>
                          <p className="font-medium">
                            {format(new Date(termo.aceito_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">IP:</span>
                          <p className="font-mono">{termo.ip_address || 'Não disponível'}</p>
                        </div>
                      </div>

                      {termo.termos.arquivo_url && (
                        <Button variant="outline" asChild className="w-full">
                          <a href={termo.termos.arquivo_url} target="_blank" rel="noopener noreferrer">
                            <FileText className="h-4 w-4 mr-2" />
                            Ver Documento Completo
                          </a>
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <FileCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhum termo assinado</p>
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
    </div>
  );
}
