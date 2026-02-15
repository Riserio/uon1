import { GestaoAssociacaoKanban } from '@/components/gestao-associacao/GestaoAssociacaoKanban';
import { useOutletContext } from 'react-router-dom';

type PortalOutletContext = {
  corretora: { id: string; nome: string; logo_url?: string | null; modulos_bi: string[] };
};

export default function PortalAcompanhamentoEventos() {
  const { corretora } = useOutletContext<PortalOutletContext>();

  return (
    <div className="container mx-auto px-4 sm:px-6 py-6">
      <h2 className="text-xl font-bold mb-4">Acompanhamento de Eventos</h2>
      <GestaoAssociacaoKanban readOnly corretoraId={corretora.id} />
    </div>
  );
}
