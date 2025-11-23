import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import PortalKPI from '@/components/portal/PortalKPI';
import PortalExtrato from '@/components/portal/PortalExtrato';
import PortalIndicadores from '@/components/portal/PortalIndicadores';
import PortalLancamentos from '@/components/portal/PortalLancamentos';
import PortalSinistros from '@/components/portal/PortalSinistros';
import PortalComite from '@/components/portal/PortalComite';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { LogOut, Building2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * PORTAL PID - Painel de Indicadores e Demonstrativos para Parceiros
 * 
 * Este é o portal EXCLUSIVO para usuários com role 'parceiro'.
 * 
 * SEGURANÇA (DECISÃO DEFINITIVA):
 * - Parceiros veem APENAS dados da sua corretora vinculada
 * - NÃO têm acesso a nenhuma outra parte do sistema
 * - NÃO veem sidebar ou menus administrativos
 * - Podem apenas VISUALIZAR dados financeiros e sinistros
 * - Podem EDITAR apenas deliberações do Comitê de Sinistros
 * 
 * LOGIN:
 * - Usuários parceiros fazem login em /auth (mesma tela que outros usuários)
 * - São automaticamente redirecionados para /portal após autenticação
 * - O sistema detecta o role 'parceiro' e aplica restrições de acesso
 * 
 * DADOS EXIBIDOS:
 * - KPI: Métricas financeiras mensais (faturamento, comissões, repasses)
 * - Extrato: Produção financeira detalhada
 * - Indicadores: Gráficos de análise (mensal, por produto, seguradora)
 * - Lançamentos: Lançamentos financeiros (visualização)
 * - Sinistros: Sinistros da corretora com estatísticas
 * - Comitê: Deliberações sobre indenizações (única área editável)
 */
export default function Portal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [corretora, setCorretora] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCorretoraData() {
      if (!user) {
        navigate('/auth');
        return;
      }

      try {
        // Buscar corretora vinculada ao usuário PARCEIRO via corretora_usuarios
        // RLS garante que o parceiro só pode ver sua própria corretora
        const { data: corretoraUsuario, error: cuError } = await supabase
          .from('corretora_usuarios')
          .select('corretora_id, corretoras(id, nome, logo_url)')
          .eq('profile_id', user.id)
          .eq('ativo', true)
          .single();

        if (cuError) throw cuError;

        if (corretoraUsuario?.corretoras) {
          setCorretora(corretoraUsuario.corretoras);
        } else {
          toast.error('Você não está vinculado a nenhuma corretora');
          navigate('/');
        }
      } catch (error: any) {
        console.error('Erro ao carregar dados da corretora:', error);
        toast.error('Erro ao carregar dados da corretora');
        navigate('/');
      } finally {
        setLoading(false);
      }
    }

    loadCorretoraData();
  }, [user, navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando portal...</p>
        </div>
      </div>
    );
  }

  if (!corretora) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">{corretora.nome}</h1>
              <p className="text-sm text-muted-foreground">Portal de Gestão</p>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={handleLogout} className="gap-2">
                <LogOut className="h-4 w-4" />
                Sair
              </Button>
              {corretora.logo_url && (
                <img
                  src={corretora.logo_url}
                  alt={corretora.nome}
                  className="h-14 w-auto object-contain"
                />
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto p-6 space-y-6">
        {/* Welcome Card */}
        <Card className="border-2 border-primary/10 shadow-lg bg-gradient-to-br from-card to-card/80">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Bem-vindo ao Portal</h2>
                <p className="text-muted-foreground">
                  Acompanhe seus indicadores e dados financeiros em tempo real
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs Section */}
        <Tabs defaultValue="kpi" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 h-auto p-1 bg-muted/50">
            <TabsTrigger value="kpi" className="text-sm sm:text-base py-3">KPI</TabsTrigger>
            <TabsTrigger value="extrato" className="text-sm sm:text-base py-3">Extrato</TabsTrigger>
            <TabsTrigger value="indicadores" className="text-sm sm:text-base py-3">Indicadores</TabsTrigger>
            <TabsTrigger value="lancamentos" className="text-sm sm:text-base py-3">Lançamentos</TabsTrigger>
            <TabsTrigger value="sinistros" className="text-sm sm:text-base py-3">Sinistros</TabsTrigger>
            <TabsTrigger value="comite" className="text-sm sm:text-base py-3">Comitê</TabsTrigger>
          </TabsList>

          <TabsContent value="kpi" className="space-y-4">
            <PortalKPI corretoraId={corretora.id} />
          </TabsContent>

          <TabsContent value="extrato" className="space-y-4">
            <PortalExtrato corretoraId={corretora.id} />
          </TabsContent>

          <TabsContent value="indicadores" className="space-y-4">
            <PortalIndicadores corretoraId={corretora.id} />
          </TabsContent>

          <TabsContent value="lancamentos" className="space-y-4">
            <PortalLancamentos corretoraId={corretora.id} />
          </TabsContent>

          <TabsContent value="sinistros" className="space-y-4">
            <PortalSinistros corretoraId={corretora.id} />
          </TabsContent>

          <TabsContent value="comite" className="space-y-4">
            <PortalComite corretoraId={corretora.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
