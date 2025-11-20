import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Camera, CheckCircle, FileSearch, Shield, Clock, Smartphone, FileText, ExternalLink } from 'lucide-react';

export default function VistoriaPublicaLanding() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [vistoria, setVistoria] = useState<any>(null);
  const [corretora, setCorretora] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [termos, setTermos] = useState<any[]>([]);
  const [termosAceitos, setTermosAceitos] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    loadVistoria();
  }, [token]);

  useEffect(() => {
    if (vistoria?.corretora_id && vistoria?.tipo_sinistro) {
      loadTermos();
    }
  }, [vistoria]);

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

  const loadTermos = async () => {
    try {
      const { data, error } = await supabase
        .from('termos')
        .select('*')
        .eq('ativo', true)
        .or(`corretora_id.eq.${vistoria.corretora_id},corretora_id.is.null`)
        .order('ordem', { ascending: true });

      if (error) throw error;

      // Filtrar termos aplicáveis ao tipo de sinistro
      const termosAplicaveis = data.filter(termo => 
        !termo.tipo_sinistro || 
        termo.tipo_sinistro.includes('Todos') || 
        termo.tipo_sinistro.includes(vistoria.tipo_sinistro)
      );

      setTermos(termosAplicaveis);

      // Inicializar estado de aceite dos termos
      const initialAceites: { [key: string]: boolean } = {};
      termosAplicaveis.forEach(termo => {
        initialAceites[termo.id] = false;
      });
      setTermosAceitos(initialAceites);
    } catch (error) {
      console.error('Erro ao carregar termos:', error);
    }
  };

  const handleIniciarVistoria = async () => {
    // Validar se todos os termos obrigatórios foram aceitos
    const termosObrigatorios = termos.filter(t => t.obrigatorio);
    const todosAceitos = termosObrigatorios.every(t => termosAceitos[t.id]);

    if (termos.length > 0 && !todosAceitos) {
      toast.error('Por favor, aceite todos os termos obrigatórios para continuar');
      return;
    }

    // Salvar aceites dos termos
    try {
      const aceitesParaSalvar = Object.entries(termosAceitos)
        .filter(([_, aceito]) => aceito)
        .map(([termoId, _]) => ({
          termo_id: termoId,
          vistoria_id: vistoria.id,
          ip_address: null,
          user_agent: navigator.userAgent
        }));

      if (aceitesParaSalvar.length > 0) {
        const { error } = await supabase
          .from('termos_aceitos')
          .insert(aceitesParaSalvar);

        if (error) throw error;
      }

      navigate(`/vistoria/${token}/captura`);
    } catch (error) {
      console.error('Erro ao salvar aceite dos termos:', error);
      toast.error('Erro ao processar aceite dos termos');
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

            {/* Termos e Condições */}
            {termos.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <h3 className="font-bold text-lg text-gray-900">Termos e Condições</h3>
                </div>
                
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                  {termos.map((termo) => (
                    <div key={termo.id} className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h4 className="font-semibold text-base text-gray-900">{termo.titulo}</h4>
                          {termo.descricao && (
                            <p className="text-sm text-gray-600 mt-1">{termo.descricao}</p>
                          )}
                        </div>
                        {termo.obrigatorio && (
                          <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full whitespace-nowrap font-medium">
                            Obrigatório
                          </span>
                        )}
                      </div>

                      <a 
                        href={termo.arquivo_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Visualizar documento completo
                      </a>

                      <div className="flex items-center space-x-2 pt-2">
                        <Checkbox 
                          id={`termo-${termo.id}`}
                          checked={termosAceitos[termo.id] || false}
                          onCheckedChange={(checked) => 
                            setTermosAceitos({ ...termosAceitos, [termo.id]: checked as boolean })
                          }
                        />
                        <Label 
                          htmlFor={`termo-${termo.id}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer text-gray-900"
                        >
                          Li e aceito este termo
                          {termo.obrigatorio && <span className="text-red-500 ml-1">*</span>}
                        </Label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Botão de iniciar */}
            <Button
              onClick={handleIniciarVistoria}
              size="lg"
              className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold py-6 text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={termos.length > 0 && !termos.filter(t => t.obrigatorio).every(t => termosAceitos[t.id])}
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
