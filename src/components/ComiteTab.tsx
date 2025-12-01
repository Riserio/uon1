import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { PARECERES_COMITE, PARECERES_ASSOCIACAO } from '@/constants/perguntasComite';
import { Gavel, ExternalLink, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/lib/formatters';

interface ComiteTabProps {
  atendimentoId: string;
  tipoSinistro?: string;
  vistoriaData?: {
    id?: string;
    cliente_nome?: string;
    veiculo_placa?: string;
    veiculo_marca?: string;
    veiculo_modelo?: string;
    veiculo_ano?: string;
    tipo_sinistro?: string;
    data_incidente?: string;
    veiculo_valor_fipe?: number;
  };
  onUpdate?: () => void;
  showNavigationButton?: boolean;
  autoSave?: boolean;
  fluxoNome?: string;
  statusAtual?: string;
}

export function ComiteTab({ 
  atendimentoId, 
  fluxoNome,
}: ComiteTabProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [acompanhamentoData, setAcompanhamentoData] = useState<any>(null);

  // Verificar se pode deliberar: fluxo deve ser "Comitê" e não pode estar já deliberado
  const podeDeliberar = () => {
    if (!fluxoNome) return true;
    const fluxoLower = fluxoNome.toLowerCase();
    const isFluxoComite = fluxoLower.includes('comit') || fluxoLower.includes('comite');
    const jaDeliberado = acompanhamentoData?.parecer_associacao && 
      (acompanhamentoData.parecer_associacao === 'aprovado' ||
       acompanhamentoData.parecer_associacao === 'negado');
    return isFluxoComite && !jaDeliberado;
  };

  useEffect(() => {
    loadAcompanhamento();
  }, [atendimentoId]);

  const loadAcompanhamento = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sinistro_acompanhamento')
        .select('*')
        .eq('atendimento_id', atendimentoId)
        .maybeSingle();

      if (error) throw error;
      setAcompanhamentoData(data);
    } catch (error) {
      console.error('Erro ao carregar acompanhamento:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Gavel className="h-5 w-5" />
            Deliberação do Comitê
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status da Associação (decisão final) */}
          {acompanhamentoData?.parecer_associacao && (
            <div className="p-4 rounded-lg border bg-muted/50">
              <Label className="text-xs text-muted-foreground">Status da Associação</Label>
              <div className="mt-2">
                {(() => {
                  const parecerAssoc = PARECERES_ASSOCIACAO.find(p => p.value === acompanhamentoData.parecer_associacao);
                  return parecerAssoc ? (
                    <Badge className={`${parecerAssoc.cor} ${parecerAssoc.textCor}`}>
                      {parecerAssoc.label}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">{acompanhamentoData.parecer_associacao}</Badge>
                  );
                })()}
              </div>
              {acompanhamentoData.financeiro_valor_aprovado && (
                <p className="text-sm font-medium mt-3">
                  Valor Aprovado: {formatCurrency(acompanhamentoData.financeiro_valor_aprovado)}
                </p>
              )}
              {acompanhamentoData.parecer_associacao_justificativa && (
                <p className="text-xs text-muted-foreground mt-2">
                  {acompanhamentoData.parecer_associacao_justificativa}
                </p>
              )}
            </div>
          )}

          {/* Parecer do Analista (resumo) */}
          {acompanhamentoData?.parecer_analista && (
            <div className="p-4 rounded-lg border">
              <Label className="text-xs text-muted-foreground">Parecer do Analista</Label>
              <div className="mt-2">
                {(() => {
                  const parecerAnal = PARECERES_COMITE.find(p => p.value === acompanhamentoData.parecer_analista);
                  return parecerAnal ? (
                    <Badge className={`${parecerAnal.cor} ${parecerAnal.textCor}`}>
                      {parecerAnal.label}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">{acompanhamentoData.parecer_analista}</Badge>
                  );
                })()}
              </div>
              {acompanhamentoData.parecer_analista_justificativa && (
                <p className="text-xs text-muted-foreground mt-2">
                  {acompanhamentoData.parecer_analista_justificativa}
                </p>
              )}
            </div>
          )}

          {/* Botão para abrir página de deliberação */}
          {podeDeliberar() && (
            <Button
              onClick={() => navigate(`/sinistros/${atendimentoId}/deliberacao`)}
              className="w-full gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir Deliberação
            </Button>
          )}

          {!podeDeliberar() && acompanhamentoData?.parecer_associacao && (
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/20 text-center border border-green-200 dark:border-green-900">
              <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-green-600" />
              <p className="text-sm font-medium text-green-700 dark:text-green-400">Deliberação Concluída</p>
            </div>
          )}

          {!acompanhamentoData?.parecer_associacao && !podeDeliberar() && acompanhamentoData && (
            <Button
              variant="outline"
              onClick={() => navigate(`/sinistros/${atendimentoId}/deliberacao`)}
              className="w-full gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Ver Deliberação
            </Button>
          )}

          {!acompanhamentoData && !podeDeliberar() && (
            <Button
              onClick={() => navigate(`/sinistros/${atendimentoId}/deliberacao`)}
              className="w-full gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Iniciar Deliberação
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ComiteTab;
