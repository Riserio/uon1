import { GestaoAssociacaoKanban } from '@/components/gestao-associacao/GestaoAssociacaoKanban';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalPageWrapper from '@/components/portal/PortalPageWrapper';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Building2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Corretora = {
  id: string;
  nome: string;
  logo_url?: string | null;
  modulos_bi: string[];
};

export default function PortalGestaoAssociacao() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [corretora, setCorretora] = useState<Corretora | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (authLoading) return;
      if (!user) { navigate('/auth', { replace: true }); return; }

      try {
        const associacaoParam = searchParams.get('associacao');

        const { data, error } = await supabase
          .from('corretora_usuarios')
          .select('corretora_id, modulos_bi, corretoras(id, nome, logo_url)')
          .eq('profile_id', user.id)
          .eq('ativo', true);

        if (error || !data || data.length === 0) {
          setLoading(false);
          return;
        }

        const validas = data.filter(d => d.corretoras).map(d => ({ ...(d.corretoras as any), modulos_bi: d.modulos_bi || [] } as Corretora));

        if (associacaoParam) {
          const found = validas.find(c => c.id === associacaoParam);
          if (found) { setCorretora(found); setLoading(false); return; }
        }

        if (validas.length >= 1) {
          setCorretora(validas[0]);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, authLoading, searchParams]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!corretora) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Nenhuma associação vinculada.</p>
            <Button variant="outline" onClick={() => navigate('/portal')}>Voltar</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/10">
      <PortalHeader
        corretora={corretora}
        showChangeButton={false}
        onChangeCorretora={() => {}}
        onLogout={async () => { await supabase.auth.signOut(); navigate('/auth'); }}
        currentModule="indicadores"
        showCarouselControls={false}
      />
      <PortalPageWrapper>
        <div className="container mx-auto px-4 sm:px-6 py-6">
          <h2 className="text-xl font-bold mb-4">Gestão da Associação</h2>
          <GestaoAssociacaoKanban readOnly corretoraId={corretora.id} />
        </div>
      </PortalPageWrapper>
    </div>
  );
}
