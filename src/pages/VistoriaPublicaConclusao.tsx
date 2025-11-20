import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, Clock, Mail, Phone, FileCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
        .select('*, corretoras(nome, logo_url)')
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
      <div className="min-h-screen bg-gradient-to-br from-green-500 via-green-600 to-emerald-600 flex items-center justify-center p-6">
        <Card className="max-w-md shadow-2xl">
          <CardContent className="p-8 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-green-600 mx-auto mb-4"></div>
            <p className="text-lg font-semibold">Carregando...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-500 via-green-600 to-emerald-600 flex items-center justify-center p-4 md:p-6">
      <div className="container max-w-2xl">
        <Card className="shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-8 text-center text-white">
            {corretora?.logo_url && (
              <div className="bg-white rounded-lg p-4 inline-block mb-6">
                <img 
                  src={corretora.logo_url} 
                  alt={corretora.nome}
                  className="h-12 object-contain"
                />
              </div>
            )}
            
            <div className="flex justify-center mb-6">
              <div className="bg-white/20 backdrop-blur-sm p-6 rounded-full">
                <CheckCircle2 className="h-24 w-24 text-white" strokeWidth={2.5} />
              </div>
            </div>

            <h1 className="text-4xl font-bold mb-2">Vistoria Concluída!</h1>
            <p className="text-green-50 text-lg">
              Recebemos suas fotos com sucesso
            </p>
          </div>

          <CardContent className="p-8 space-y-6">
            {/* Número do Sinistro */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 p-6 rounded-xl border-2 border-green-200 dark:border-green-800">
              <div className="flex items-center justify-center gap-3 mb-3">
                <FileCheck className="h-6 w-6 text-green-600" />
                <p className="text-sm font-medium text-muted-foreground">Número do Sinistro</p>
              </div>
              <p className="text-4xl font-bold text-green-700 dark:text-green-400 text-center">
                #{vistoria?.numero}
              </p>
            </div>

            {/* Status Message */}
            <div className="text-center space-y-2">
              <p className="text-lg text-muted-foreground">
                Suas fotos foram recebidas e estão sendo processadas. Nossa equipe analisará as imagens e entrará em contato em breve.
              </p>
            </div>

            {/* Timeline */}
            <div className="bg-muted/50 rounded-xl p-6 space-y-4">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Próximos Passos
              </h3>
              
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="bg-green-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold flex-shrink-0">
                    1
                  </div>
                  <div>
                    <p className="font-semibold">Análise Automática por IA</p>
                    <p className="text-sm text-muted-foreground">
                      Processamento imediato das imagens com inteligência artificial
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold flex-shrink-0">
                    2
                  </div>
                  <div>
                    <p className="font-semibold">Revisão pela Equipe Técnica</p>
                    <p className="text-sm text-muted-foreground">
                      Validação e análise detalhada por especialistas
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="bg-purple-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold flex-shrink-0">
                    3
                  </div>
                  <div>
                    <p className="font-semibold">Contato em até 24h Úteis</p>
                    <p className="text-sm text-muted-foreground">
                      Retornaremos com o resultado da análise
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Information */}
            {(vistoria?.cliente_email || vistoria?.cliente_telefone) && (
              <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
                <h3 className="font-bold mb-3 flex items-center gap-2">
                  <Mail className="h-5 w-5 text-blue-600" />
                  Informações de Contato
                </h3>
                <div className="space-y-2 text-sm">
                  {vistoria.cliente_email && (
                    <p className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {vistoria.cliente_email}
                    </p>
                  )}
                  {vistoria.cliente_telefone && (
                    <p className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      {vistoria.cliente_telefone}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Success Message */}
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl p-6 text-center">
              <p className="font-semibold text-lg mb-2">
                ✓ Vistoria Registrada com Sucesso
              </p>
              <p className="text-green-50 text-sm">
                Todas as informações foram salvas de forma segura
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer Note */}
        <div className="text-center mt-6 text-white/90 text-sm">
          <p>Você pode fechar esta janela</p>
        </div>
      </div>
    </div>
  );
}
