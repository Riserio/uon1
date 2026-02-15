import { GestaoAssociacaoKanban } from '@/components/gestao-associacao/GestaoAssociacaoKanban';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import BIPageHeader from '@/components/bi/BIPageHeader';
import { useBILayoutOptional } from '@/contexts/BILayoutContext';

export default function AcompanhamentoEventos() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const corretoraId = searchParams.get('associacao') || '';
  
  const biLayout = useBILayoutOptional();
  const associacoes = biLayout?.associacoes || [];
  const selectedAssociacao = biLayout?.selectedAssociacao || corretoraId;
  const loadingAssociacoes = biLayout?.loadingAssociacoes || false;

  useEffect(() => {
    if (corretoraId && biLayout && corretoraId !== biLayout.selectedAssociacao) {
      biLayout.setSelectedAssociacao(corretoraId);
    }
  }, [corretoraId]);

  const handleAssociacaoChange = (id: string) => {
    if (biLayout) biLayout.setSelectedAssociacao(id);
    navigate(`/acompanhamento-eventos?associacao=${id}`, { replace: true });
  };

  const activeAssociacao = corretoraId || selectedAssociacao;
  const selectedNome = associacoes.find(a => a.id === activeAssociacao)?.nome || '';

  return (
    <div className="min-h-screen bg-background">
      <BIPageHeader
        title="Acompanhamento de Eventos"
        subtitle={selectedNome}
        associacoes={associacoes}
        selectedAssociacao={activeAssociacao}
        onAssociacaoChange={handleAssociacaoChange}
        loadingAssociacoes={loadingAssociacoes}
        currentModule="acompanhamento-eventos"
      />
      <div className="container mx-auto px-4 sm:px-6 py-6">
        {activeAssociacao ? (
          <GestaoAssociacaoKanban readOnly corretoraId={activeAssociacao} />
        ) : (
          <p className="text-center text-muted-foreground py-12">
            Selecione uma associação para ver o acompanhamento de eventos.
          </p>
        )}
      </div>
    </div>
  );
}
