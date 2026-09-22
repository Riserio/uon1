import { useState } from 'react';
import { GestaoAssociacaoKanban } from '@/components/gestao-associacao/GestaoAssociacaoKanban';
import { GestaoAssociacaoStatusConfig } from '@/components/gestao-associacao/GestaoAssociacaoStatusConfig';
import { useBILayoutOptional } from '@/contexts/BILayoutContext';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';

export default function AcompanhamentoEventos() {
  const biLayout = useBILayoutOptional();
  const activeAssociacao = biLayout?.selectedAssociacao || '';
  const { userRole } = useAuth();
  const [configOpen, setConfigOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const podeConfigurar = ['admin', 'superintendente', 'administrativo'].includes(userRole || '');

  return (
    <div className="container mx-auto px-4 sm:px-6 py-6">
      {activeAssociacao ? (
        <>
          {podeConfigurar && (
            <div className="flex justify-end mb-3">
              <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
                <Settings className="h-4 w-4 mr-2" />
                Configurar Fluxos e Status
              </Button>
            </div>
          )}
          <GestaoAssociacaoKanban
            key={refreshKey}
            readOnly
            corretoraId={activeAssociacao}
            onConfigureFluxos={podeConfigurar ? () => setConfigOpen(true) : undefined}
          />
          {podeConfigurar && (
            <GestaoAssociacaoStatusConfig
              open={configOpen}
              onOpenChange={setConfigOpen}
              onStatusChange={() => setRefreshKey((k) => k + 1)}
              selectedCorretoraId={activeAssociacao}
            />
          )}
        </>
      ) : (
        <p className="text-center text-muted-foreground py-12">
          Selecione uma associação para ver o acompanhamento de eventos.
        </p>
      )}
    </div>
  );
}
