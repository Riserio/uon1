import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Camera, CheckCircle, FileSearch, Shield } from 'lucide-react';

export default function VistoriaPublicaLanding() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [vistoria, setVistoria] = useState<any>(null);
  const [corretora, setCorretora] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVistoria();
  }, [token]);

  const loadVistoria = async () => {
    try {
      const { data, error } = await supabase
        .from('vistorias')
        .select('*, corretoras(nome, logo_url)')
        .eq('link_token', token)
        .gt('link_expires_at', new Date().toISOString())
        .single();

      if (error) throw error;
      if (!data) {
        toast.error('Link de vistoria inválido ou expirado');
        return;
      }

      setVistoria(data);
      setCorretora(data.corretoras);
    } catch (error) {
      console.error('Erro ao carregar vistoria:', error);
      toast.error('Erro ao carregar vistoria');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando vistoria...</p>
        </div>
      </div>
    );
  }

  if (!vistoria) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <h2 className="text-2xl font-bold text-destructive mb-4">Link Inválido</h2>
            <p className="text-muted-foreground">
              Este link de vistoria é inválido ou expirou. Entre em contato com a seguradora.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header com logo da corretora */}
        <div className="text-center mb-8">
          {corretora?.logo_url && (
            <img 
              src={corretora.logo_url} 
              alt={corretora.nome}
              className="h-16 mx-auto mb-4"
            />
          )}
          <div className="bg-blue-100 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
            <Camera className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Vistoria Digital de Veículos
          </h1>
          <p className="text-lg text-muted-foreground">
            Análise completa com inteligência artificial. Rápido, preciso e profissional.
          </p>
        </div>

        {/* Card principal */}
        <Card className="shadow-xl">
          <CardContent className="p-8">
            {/* Como funciona */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-6">
                <FileSearch className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-bold">Como funciona</h2>
              </div>
              
              <div className="grid md:grid-cols-3 gap-6 mb-8">
                <div className="text-center">
                  <div className="bg-primary/10 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
                    <span className="text-xl font-bold text-primary">1</span>
                  </div>
                  <h3 className="font-semibold mb-2">Capture 4 Fotos</h3>
                  <p className="text-sm text-muted-foreground">
                    Fotografe os 4 lados do veículo: frontal, traseira, lateral direita e esquerda
                  </p>
                </div>
                
                <div className="text-center">
                  <div className="bg-primary/10 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
                    <span className="text-xl font-bold text-primary">2</span>
                  </div>
                  <h3 className="font-semibold mb-2">Análise por IA</h3>
                  <p className="text-sm text-muted-foreground">
                    Nossa IA analisa automaticamente o estado do veículo e identifica danos
                  </p>
                </div>
                
                <div className="text-center">
                  <div className="bg-primary/10 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
                    <span className="text-xl font-bold text-primary">3</span>
                  </div>
                  <h3 className="font-semibold mb-2">Relatório Completo</h3>
                  <p className="text-sm text-muted-foreground">
                    Receba um relatório detalhado com todos os danos identificados
                  </p>
                </div>
              </div>
            </div>

            {/* Benefícios */}
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4">Benefícios</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">Análise em minutos</h4>
                    <p className="text-sm text-muted-foreground">
                      Resultados rápidos e precisos usando IA avançada
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">Padrão seguradora</h4>
                    <p className="text-sm text-muted-foreground">
                      Relatório completo seguindo normas do mercado
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">Detecção de danos</h4>
                    <p className="text-sm text-muted-foreground">
                      Identifica até pequenos arranhões e amassados
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">100% digital</h4>
                    <p className="text-sm text-muted-foreground">
                      Sem necessidade de visita presencial
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Importante */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-2">
                <Shield className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-yellow-900 mb-1">Importante</h4>
                  <p className="text-sm text-yellow-800">
                    Certifique-se de que as fotos estejam nítidas e mostrem claramente todos os lados do veículo. 
                    Fotos em boa iluminação garantem uma análise mais precisa.
                  </p>
                </div>
              </div>
            </div>

            {/* Botão de iniciar */}
            <Button 
              onClick={() => navigate(`/vistoria/${token}/captura`)}
              className="w-full h-14 text-lg"
              size="lg"
            >
              <Camera className="mr-2 h-5 w-5" />
              Iniciar Vistoria
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
