import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Camera, CheckCircle, FileSearch, Shield, Clock, Smartphone } from 'lucide-react';

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
        .select(`
          *,
          corretoras(nome, logo_url),
          atendimentos!vistorias_atendimento_id_fkey(
            corretora_id,
            responsavel_id,
            corretoras(nome),
            profiles!atendimentos_responsavel_id_fkey(nome)
          )
        `)
        .eq('link_token', token)
        .gt('link_expires_at', new Date().toISOString())
        .single();

      if (error) throw error;
      if (!data) {
        toast.error('Link de vistoria inválido ou expirado');
        return;
      }

      setVistoria(data);
      setCorretora(data.corretoras || data.atendimentos?.corretoras);
    } catch (error) {
      console.error('Erro ao carregar vistoria:', error);
      toast.error('Erro ao carregar vistoria');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Carregando vistoria...</p>
        </div>
      </div>
    );
  }

  if (!vistoria) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-red-50 via-white to-red-50 flex items-center justify-center p-6">
        <Card className="max-w-md border-red-200 shadow-xl">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-red-900 mb-3">Link Inválido</h2>
            <p className="text-gray-600">
              Este link de vistoria é inválido ou expirou. Entre em contato com a seguradora.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50">
      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-4 sm:py-8 md:py-12">
        {/* Header com logo */}
        <div className="text-center mb-12">
          {corretora?.logo_url && (
            <div className="mb-6">
              <img 
                src={corretora.logo_url} 
                alt={corretora.nome}
                className="h-16 md:h-20 mx-auto object-contain"
              />
            </div>
          )}
          <div className="inline-flex items-center justify-center w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg mb-6">
            <Camera className="h-10 w-10 md:h-12 md:w-12 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            Vistoria Digital
          </h1>
          <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
            Processo rápido e seguro com análise por inteligência artificial
          </p>
        </div>

        {/* Card principal */}
        <Card className="shadow-2xl border-0 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 md:p-8 text-white">
            <div className="flex items-center gap-3 mb-3">
              <FileSearch className="h-6 w-6" />
              <h2 className="text-2xl md:text-3xl font-bold">Como funciona</h2>
            </div>
            <p className="text-blue-50">Siga os passos abaixo para concluir sua vistoria</p>
          </div>
          
          <CardContent className="p-6 md:p-10">
            {/* Passos */}
            <div className="grid md:grid-cols-3 gap-6 mb-10">
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <span className="text-2xl font-bold text-white">1</span>
                </div>
                <h3 className="font-bold text-lg mb-2 text-gray-900">Capture 4 Fotos</h3>
                <p className="text-sm text-gray-600">
                  Fotografe os 4 lados do veículo: frontal, traseira, lateral direita e esquerda
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <span className="text-2xl font-bold text-white">2</span>
                </div>
                <h3 className="font-bold text-lg mb-2 text-gray-900">Análise por IA</h3>
                <p className="text-sm text-gray-600">
                  Nossa IA analisa automaticamente o estado do veículo e identifica danos
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <span className="text-2xl font-bold text-white">3</span>
                </div>
                <h3 className="font-bold text-lg mb-2 text-gray-900">Relatório Completo</h3>
                <p className="text-sm text-gray-600">
                  Receba um relatório detalhado com todos os danos identificados
                </p>
              </div>
            </div>

            {/* Benefícios */}
            <div className="bg-gradient-to-br from-blue-50 to-white rounded-2xl p-6 md:p-8 mb-8">
              <h2 className="text-xl md:text-2xl font-bold mb-6 text-gray-900">Por que fazer a vistoria digital?</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">Rápido e Fácil</h3>
                    <p className="text-sm text-gray-600">Processo completo em menos de 5 minutos</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Clock className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">Disponível 24/7</h3>
                    <p className="text-sm text-gray-600">Faça sua vistoria a qualquer momento</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Shield className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">Seguro e Confiável</h3>
                    <p className="text-sm text-gray-600">Tecnologia de ponta com criptografia</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Smartphone className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">Qualquer Dispositivo</h3>
                    <p className="text-sm text-gray-600">Funciona no celular, tablet ou computador</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Informações importantes */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8">
              <h3 className="font-bold text-amber-900 mb-3 flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Informações importantes
              </h3>
              <ul className="space-y-2 text-sm text-amber-800">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Certifique-se de que o veículo esteja em um local bem iluminado</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>As fotos devem mostrar o veículo completo em cada ângulo</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Evite sombras ou reflexos que possam dificultar a análise</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Tenha sua CNH em mãos para fazer upload ao final</span>
                </li>
              </ul>
            </div>

            {/* Botão de iniciar */}
            <Button
              onClick={() => navigate(`/vistoria/${token}/captura`)}
              size="lg"
              className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold py-6 text-lg shadow-lg"
            >
              <Camera className="h-5 w-5 mr-2" />
              Iniciar Vistoria Digital
            </Button>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">
          <p>Suas informações estão protegidas e serão usadas apenas para a vistoria</p>
        </div>
      </div>
    </div>
  );
}
