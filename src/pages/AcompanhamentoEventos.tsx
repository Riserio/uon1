import { GestaoAssociacaoKanban } from '@/components/gestao-associacao/GestaoAssociacaoKanban';
import { useBILayoutOptional } from '@/contexts/BILayoutContext';

export default function AcompanhamentoEventos() {
  const biLayout = useBILayoutOptional();
  const activeAssociacao = biLayout?.selectedAssociacao || '';

  return (
    <div className="container mx-auto px-4 sm:px-6 py-6">
      {activeAssociacao ? (
        <GestaoAssociacaoKanban readOnly corretoraId={activeAssociacao} />
      ) : (
        <p className="text-center text-muted-foreground py-12">
          Selecione uma associação para ver o acompanhamento de eventos.
        </p>
      )}
    </div>
  );
}
