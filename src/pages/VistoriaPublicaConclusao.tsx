import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { 
  CheckCircle2, Clock, Mail, Phone, Shield, 
  Sparkles, FileCheck, Award 
} from 'lucide-react';

export default function VistoriaPublicaConclusao() {
  const { token } = useParams();
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
        .select('*, corretoras(nome, logo_url, telefone, email)')
        .eq('link_token', token)
        .single();

      if (error) throw error;
      setVistoria(data);
      setCorretora(data.corretoras);
    } catch (error) {
      console.error('Erro ao carregar vistoria:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-white flex items-center justify-center p-6">
        <Card className="border-none shadow-xl">
          <CardContent className="p-12 text-center">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-green-200 border-t-green-600"></div>
            </div>
            <p className="text-lg font-semibold text-muted-foreground">Finalizando...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-white flex items-center justify-center p-4 md:p-6">
      <div className="container max-w-3xl">
        
        {/* Success Card */}
        <Card className="border-none shadow-2xl overflow-hidden mb-8">
          
          {/* Hero Section */}
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-12 text-center text-white relative overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute inset-0" style={{
                backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
                backgroundSize: '24px 24px'
              }}></div>
            </div>

            {/* Logo */}
            {corretora?.logo_url && (
              <div className="relative bg-white rounded-2xl p-6 inline-block mb-8 shadow-xl">
                <img 
                  src={corretora.logo_url} 
                  alt={corretora.nome}
                  className="h-14 object-contain"
                />
              </div>
            )}
            
            {/* Success Icon */}
            <div className="relative flex justify-center mb-8">
              <div className="w-32 h-32 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center shadow-2xl">
                <CheckCircle2 className="h-20 w-20 text-white animate-pulse" strokeWidth={2.5} />
              </div>
            </div>

            <h1 className="text-5xl md:text-6xl font-bold mb-4 leading-tight">
              Vistoria Concluída!
            </h1>
            <p className="text-green-50 text-xl md:text-2xl font-light max-w-2xl mx-auto">
              Recebemos todas as suas informações com sucesso
            </p>
          </div>

          <CardContent className="p-8 md:p-12 space-y-8">
            
            {/* Protocol Number */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-8 rounded-2xl border-2 border-green-200 text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <FileCheck className="h-6 w-6 text-green-600" />
                <p className="text-sm font-bold text-green-800 uppercase tracking-wider">Número de Consulta</p>
              </div>
              <p className="text-5xl md:text-6xl font-bold text-green-700">
                #{vistoria?.numero}
              </p>
              <p className="text-sm text-green-600 mt-2">Guarde este número para consultas futuras</p>
            </div>

            {/* Next Steps Timeline */}
            <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-8 border-2 border-gray-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-[hsl(var(--vistoria-primary))] rounded-xl flex items-center justify-center">
                  <Clock className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-bold text-2xl text-gray-900">O que acontece agora?</h3>
              </div>
              
              <div className="space-y-6 ml-2">
                
                <div className="flex gap-4 items-start">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold shadow-md">
                      1
                    </div>
                    <div className="w-0.5 h-16 bg-gradient-to-b from-purple-300 to-blue-300 my-2"></div>
                  </div>
                  <div className="flex-1 pt-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="h-5 w-5 text-purple-600" />
                      <p className="font-bold text-lg text-gray-900">Análise Automática por IA</p>
                    </div>
                    <p className="text-gray-600">
                      Nossa inteligência artificial está processando suas fotos agora mesmo
                    </p>
                    <div className="mt-2 bg-purple-50 px-3 py-1 rounded-full inline-flex items-center gap-2">
                      <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                      <span className="text-xs font-semibold text-purple-700">Em processamento</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 items-start">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold shadow-md">
                      2
                    </div>
                    <div className="w-0.5 h-16 bg-gradient-to-b from-blue-300 to-green-300 my-2"></div>
                  </div>
                  <div className="flex-1 pt-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="h-5 w-5 text-blue-600" />
                      <p className="font-bold text-lg text-gray-900">Revisão Técnica</p>
                    </div>
                    <p className="text-gray-600">
                      Nossa equipe de especialistas validará a análise em até 24h úteis
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 items-start">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-bold shadow-md">
                      3
                    </div>
                  </div>
                  <div className="flex-1 pt-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Award className="h-5 w-5 text-green-600" />
                      <p className="font-bold text-lg text-gray-900">Retorno Garantido</p>
                    </div>
                    <p className="text-gray-600">
                      Entraremos em contato com o resultado e próximos passos
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Info */}
            {corretora && (
              <div className="bg-gradient-to-br from-blue-50 to-white rounded-2xl p-6 border-2 border-blue-200">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-gray-900">
                  <Mail className="h-5 w-5 text-blue-600" />
                  Informações de Contato
                </h3>
                <div className="space-y-3">
                  {corretora.email && (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Mail className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 font-medium">Email</p>
                        <p className="font-semibold text-gray-900">{corretora.email}</p>
                      </div>
                    </div>
                  )}
                  {corretora.telefone && (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <Phone className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 font-medium">Telefone</p>
                        <p className="font-semibold text-gray-900">{corretora.telefone}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Final Success Message */}
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-2xl p-8 text-center shadow-xl">
              <CheckCircle2 className="h-16 w-16 mx-auto mb-4" strokeWidth={2.5} />
              <p className="font-bold text-2xl mb-2">
                Tudo Certo!
              </p>
              <p className="text-green-50 text-lg">
                Suas informações foram registradas de forma segura e criptografada
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center space-y-3">
          <p className="text-gray-400 text-sm">Você pode fechar esta página agora</p>
          <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Shield className="h-3 w-3" />
              Dados Protegidos
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Conexão Segura
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple Lock icon component
function Lock({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}