import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2 } from 'lucide-react';

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
      <div className="min-h-screen bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center p-6">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center p-6">
      <Card className="max-w-md shadow-2xl">
        <CardContent className="p-8 text-center">
          {corretora?.logo_url && (
            <img 
              src={corretora.logo_url} 
              alt={corretora.nome}
              className="h-12 mx-auto mb-6"
            />
          )}
          <CheckCircle2 className="h-20 w-20 text-green-600 mx-auto mb-6" />
          <h2 className="text-3xl font-bold mb-4">Vistoria Concluída!</h2>
          
          <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg mb-6">
            <p className="text-sm text-muted-foreground mb-2">Número do Sinistro</p>
            <p className="text-3xl font-bold text-green-700">#{vistoria?.numero}</p>
          </div>

          <p className="text-muted-foreground mb-6">
            Suas fotos foram enviadas com sucesso. Nossa equipe analisará as imagens e entrará em contato em breve.
          </p>
          
          <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg text-sm text-green-800 dark:text-green-200">
            <strong>Próximos passos:</strong>
            <ul className="list-disc list-inside mt-2 text-left">
              <li>Análise automática por IA</li>
              <li>Revisão pela equipe técnica</li>
              <li>Contato em até 24h úteis</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
