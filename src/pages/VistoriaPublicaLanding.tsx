import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Camera, CheckCircle, Shield, Clock, Smartphone, 
  Zap, Lock, Award, ArrowRight, AlertCircle 
} from 'lucide-react';

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

  const handleIniciarVistoria = () => {
    navigate(`/vistoria/${token}/captura`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--vistoria-bg))] to-white flex items-center justify-center p-6">
        <Card className="border-none shadow-xl">
          <CardContent className="p-12 text-center">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-[hsl(var(--vistoria-primary))]/20 border-t-[hsl(var(--vistoria-primary))]"></div>
            </div>
            <p className="text-lg font-semibold text-muted-foreground">Carregando informações...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!vistoria) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-white flex items-center justify-center p-6">
        <Card className="max-w-md border-red-200 shadow-xl">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="h-10 w-10 text-red-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Link Inválido</h2>
            <p className="text-gray-600 text-lg">
              Este link de vistoria é inválido ou já expirou. Entre em contato com sua seguradora.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--vistoria-bg))] via-white to-blue-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-16">
        
        {/* Header com Logo */}
        {corretora?.logo_url && (
          <div className="text-center mb-8">
            <div className="inline-block bg-white rounded-2xl p-6 shadow-md">
              <img 
                src={corretora.logo_url} 
                alt={corretora.nome}
                className="h-16 md:h-20 object-contain"
              />
            </div>
          </div>
        )}

        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-[hsl(var(--vistoria-primary))] to-blue-600 shadow-xl mb-8 animate-pulse">
            <Camera className="h-12 w-12 text-white" strokeWidth={2.5} />
          </div>
          
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-4 leading-tight">
            Vistoria Digital
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 max-w-2xl mx-auto font-light">
            Processo rápido, seguro e inteligente
          </p>
          
          <div className="flex items-center justify-center gap-2 mt-6">
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100 px-4 py-2 text-sm font-semibold">
              <Zap className="h-4 w-4 mr-1" />
              Menos de 5 minutos
            </Badge>
            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 px-4 py-2 text-sm font-semibold">
              <Lock className="h-4 w-4 mr-1" />
              100% Seguro
            </Badge>
          </div>
        </div>

        {/* Main Card */}
        <Card className="border-none shadow-2xl overflow-hidden mb-8">
          
          {/* Como Funciona */}
          <div className="bg-gradient-to-r from-[hsl(var(--vistoria-primary))] to-blue-600 p-8 md:p-12 text-white">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">Como funciona?</h2>
            <p className="text-blue-50 text-lg">Siga 3 passos simples para concluir sua vistoria</p>
          </div>

          <CardContent className="p-8 md:p-12">
            
            {/* Steps */}
            <div className="grid md:grid-cols-3 gap-8 mb-12">
              
              {/* Step 1 */}
              <div className="relative">
                <div className="absolute -top-4 -left-4 w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg">
                  1
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-white rounded-2xl p-6 pt-8 h-full border border-blue-100">
                  <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                    <Camera className="h-8 w-8 text-blue-600" />
                  </div>
                  <h3 className="font-bold text-xl mb-2 text-gray-900">Tire as Fotos</h3>
                  <p className="text-gray-600 leading-relaxed">
                    Capture fotos dos 4 lados do veículo e envie documentos necessários
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="relative">
                <div className="absolute -top-4 -left-4 w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg">
                  2
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-white rounded-2xl p-6 pt-8 h-full border border-purple-100">
                  <div className="w-16 h-16 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
                    <Zap className="h-8 w-8 text-purple-600" />
                  </div>
                  <h3 className="font-bold text-xl mb-2 text-gray-900">Análise por IA</h3>
                  <p className="text-gray-600 leading-relaxed">
                    Nossa inteligência artificial analisa automaticamente o estado do veículo
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="relative">
                <div className="absolute -top-4 -left-4 w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg">
                  3
                </div>
                <div className="bg-gradient-to-br from-green-50 to-white rounded-2xl p-6 pt-8 h-full border border-green-100">
                  <div className="w-16 h-16 bg-green-100 rounded-xl flex items-center justify-center mb-4">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  </div>
                  <h3 className="font-bold text-xl mb-2 text-gray-900">Pronto!</h3>
                  <p className="text-gray-600 leading-relaxed">
                    Receba o resultado da análise e acompanhe seu sinistro
                  </p>
                </div>
              </div>
            </div>

            {/* Benefits Grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
              
              <div className="flex items-start gap-4 p-4 rounded-xl bg-gradient-to-br from-gray-50 to-white border border-gray-100">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Clock className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Rápido</h4>
                  <p className="text-sm text-gray-600">Processo em minutos</p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 rounded-xl bg-gradient-to-br from-gray-50 to-white border border-gray-100">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Shield className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Seguro</h4>
                  <p className="text-sm text-gray-600">Dados criptografados</p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 rounded-xl bg-gradient-to-br from-gray-50 to-white border border-gray-100">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Smartphone className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Prático</h4>
                  <p className="text-sm text-gray-600">Do seu celular</p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 rounded-xl bg-gradient-to-br from-gray-50 to-white border border-gray-100">
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Award className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Confiável</h4>
                  <p className="text-sm text-gray-600">Tecnologia IA</p>
                </div>
              </div>
            </div>

            {/* Important Info */}
            <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-bold text-xl text-amber-900">Antes de começar</h3>
              </div>
              <ul className="space-y-3 ml-13">
                <li className="flex items-start gap-3 text-amber-800">
                  <CheckCircle className="h-5 w-5 mt-0.5 flex-shrink-0 text-amber-600" />
                  <span>Tenha sua <strong>CNH</strong> e <strong>CRLV</strong> em mãos</span>
                </li>
                <li className="flex items-start gap-3 text-amber-800">
                  <CheckCircle className="h-5 w-5 mt-0.5 flex-shrink-0 text-amber-600" />
                  <span>Certifique-se de estar em um <strong>local bem iluminado</strong></span>
                </li>
                <li className="flex items-start gap-3 text-amber-800">
                  <CheckCircle className="h-5 w-5 mt-0.5 flex-shrink-0 text-amber-600" />
                  <span>Fotografe o veículo <strong>completo em cada ângulo</strong></span>
                </li>
              </ul>
            </div>

            {/* CTA Button */}
            <Button
              onClick={handleIniciarVistoria}
              size="lg"
              className="w-full bg-gradient-to-r from-[hsl(var(--vistoria-primary))] to-blue-600 hover:from-blue-600 hover:to-[hsl(var(--vistoria-primary))] text-white font-bold py-8 text-xl shadow-xl hover:shadow-2xl transition-all duration-300 rounded-2xl"
            >
              <Camera className="h-6 w-6 mr-3" />
              Iniciar Vistoria Digital
              <ArrowRight className="h-6 w-6 ml-3" />
            </Button>
          </CardContent>
        </Card>

        {/* Trust Footer */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-6 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              <span>Dados Protegidos</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span>Processo Seguro</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              <span>Certificado</span>
            </div>
          </div>
          <p className="text-gray-400 text-sm">
            Suas informações estão protegidas e serão usadas apenas para a vistoria
          </p>
        </div>
      </div>
    </div>
  );
}

// Badge component local (simples)
function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}