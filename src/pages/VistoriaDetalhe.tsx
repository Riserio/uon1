import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ArrowLeft, Download, FileText, Camera, Check, X, Send } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { generateVistoriaPDF } from '@/components/VistoriaPDF';
import { useAuth } from '@/hooks/useAuth';
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
  const [loading, setLoading] = useState(true);
  const [corretora, setCorretora] = useState<any>(null);
  const [administradora, setAdministradora] = useState<any>(null);
  const [fotoSelecionada, setFotoSelecionada] = useState<any | null>(null);
  const [fotoDialogOpen, setFotoDialogOpen] = useState(false);
  const [observacaoReprovacao, setObservacaoReprovacao] = useState('');

  useEffect(() => {
    loadVistoria();
  }, [id]);

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
      // Atualizar imediatamente no estado local
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
      // Recarregar em caso de erro
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
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 dias

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

      toast.success('Todas as fotos foram aprovadas!');
      loadVistoria();
    } catch (error) {
      console.error('Erro ao aprovar fotos:', error);
      toast.error('Erro ao aprovar fotos');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
        <div className="text-center py-12">Carregando...</div>
      </div>
    );
  }

  if (!vistoria) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
        <div className="text-center py-12">Vistoria não encontrada</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/vistorias')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          {vistoria.status === 'concluida' && (
            <Button className="gap-2" onClick={handleExportPDF}>
              <Download className="h-4 w-4" />
              Exportar PDF
            </Button>
          )}
        </div>

        {/* Header Card */}
        <Card className="shadow-lg border-primary/20">
          <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-3xl mb-2">Vistoria #{vistoria.numero}</CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant={vistoria.tipo_abertura === 'digital' ? 'default' : 'secondary'}>
                    {vistoria.tipo_abertura === 'digital' ? (
                      <><Camera className="h-3 w-3 mr-1" /> Digital</>
                    ) : (
                      <><FileText className="h-3 w-3 mr-1" /> Manual</>
                    )}
                  </Badge>
                  <Badge variant="outline">
                    {vistoria.tipo_vistoria === 'sinistro' ? 'Sinistro' : 'Reativação'}
                  </Badge>
                  <Badge className={getStatusColor(vistoria.status)}>
                    {getStatusLabel(vistoria.status)}
                  </Badge>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="text-sm text-muted-foreground">
              Criada em {format(new Date(vistoria.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
              {vistoria.completed_at && ` • Concluída em ${format(new Date(vistoria.completed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`}
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Dados do Veículo */}
          <Card>
            <CardHeader>
              <CardTitle>Dados do Veículo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <span className="text-sm text-muted-foreground">Placa:</span>
                <p className="font-semibold">{vistoria.veiculo_placa || 'Não informado'}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Marca/Modelo:</span>
                <p className="font-semibold">{vistoria.veiculo_marca} {vistoria.veiculo_modelo} {vistoria.veiculo_ano}</p>
              </div>
              {vistoria.veiculo_cor && (
                <div>
                  <span className="text-sm text-muted-foreground">Cor:</span>
                  <p className="font-semibold">{vistoria.veiculo_cor}</p>
                </div>
              )}
              {vistoria.veiculo_chassi && (
                <div>
                  <span className="text-sm text-muted-foreground">Chassi:</span>
                  <p className="font-mono text-sm">{vistoria.veiculo_chassi}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dados do Cliente */}
          <Card>
            <CardHeader>
              <CardTitle>Dados do Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <span className="text-sm text-muted-foreground">Nome:</span>
                <p className="font-semibold">{vistoria.cliente_nome || 'Não informado'}</p>
              </div>
              {vistoria.cliente_cpf && (
                <div>
                  <span className="text-sm text-muted-foreground">CPF:</span>
                  <p className="font-mono text-sm">{vistoria.cliente_cpf}</p>
                </div>
              )}
              {vistoria.cliente_email && (
                <div>
                  <span className="text-sm text-muted-foreground">Email:</span>
                  <p>{vistoria.cliente_email}</p>
                </div>
              )}
              {vistoria.cliente_telefone && (
                <div>
                  <span className="text-sm text-muted-foreground">Telefone:</span>
                  <p>{vistoria.cliente_telefone}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Relato do Incidente */}
        {vistoria.relato_incidente && (
          <Card>
            <CardHeader>
              <CardTitle>Relato do Incidente</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{vistoria.relato_incidente}</p>
              {vistoria.data_incidente && (
                <p className="text-sm text-muted-foreground mt-2">
                  Data do incidente: {format(new Date(vistoria.data_incidente), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Fotos com aprovação */}
        {fotos.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Fotos do Veículo</CardTitle>
                {fotos.some(f => f.status_aprovacao === 'pendente') && (
                  <Button onClick={handleAprovarTodasFotos} size="sm" className="gap-2">
                    <Check className="h-4 w-4" />
                    Aprovar Todas
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {fotos.map((foto) => (
                  <div key={foto.id} className="space-y-2">
                    <div className="relative group">
                      <img
                        src={foto.arquivo_url}
                        alt={getPosicaoNome(foto.posicao)}
                        className="w-full h-64 object-cover rounded-lg shadow-md"
                      />
                      {/* Badge de status */}
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
                      
                      {/* Botões de ação */}
                      {foto.status_aprovacao === 'pendente' && (
                        <div className="absolute bottom-2 left-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
                      )}
                    </div>
                    
                    <div className="text-center">
                      <p className="font-semibold">{getPosicaoNome(foto.posicao)}</p>
                      {foto.observacao_reprovacao && (
                        <p className="text-xs text-destructive mt-1 bg-destructive/10 p-2 rounded">
                          Motivo: {foto.observacao_reprovacao}
                        </p>
                      )}
                      {foto.analise_ia?.analise && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {foto.analise_ia.analise.substring(0, 100)}...
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Análise IA */}
        {vistoria.status === 'concluida' && vistoria.observacoes_ia && (
          <Card className="border-green-500/50">
            <CardHeader className="bg-green-500/10">
              <CardTitle className="text-green-700 dark:text-green-400">
                Análise por Inteligência Artificial
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {vistoria.danos_detectados && vistoria.danos_detectados.length > 0 && (
                <div className="mb-4">
                  <h4 className="font-semibold mb-2">Danos Detectados:</h4>
                  <div className="flex gap-2 flex-wrap">
                    {vistoria.danos_detectados.map((dano: string, index: number) => (
                      <Badge key={index} variant="destructive">{dano}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <h4 className="font-semibold mb-2">Resumo Executivo:</h4>
                <p className="whitespace-pre-wrap text-muted-foreground">{vistoria.observacoes_ia}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Geolocalização */}
        {vistoria.latitude && vistoria.longitude && (
          <Card>
            <CardHeader>
              <CardTitle>Localização</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">{vistoria.endereco}</p>
              <a
                href={`https://www.google.com/maps?q=${vistoria.latitude},${vistoria.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-sm"
              >
                Ver no Google Maps →
              </a>
            </CardContent>
          </Card>
        )}
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
