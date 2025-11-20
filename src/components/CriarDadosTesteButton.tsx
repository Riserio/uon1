import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, TestTube } from 'lucide-react';

export const CriarDadosTesteButton = () => {
  const [isLoading, setIsLoading] = useState(false);

  const handleCriarDados = async () => {
    setIsLoading(true);
    try {
      console.log('Iniciando criação de dados de teste...');
      
      const { data, error } = await supabase.functions.invoke('criar-dados-teste');

      if (error) {
        console.error('Erro na função:', error);
        throw error;
      }

      console.log('Resposta da função:', data);

      if (data.success) {
        toast.success(data.message);
        
        if (data.registros && data.registros.length > 0) {
          console.log('Registros criados:', data.registros);
          
          // Mostrar os protocolos criados
          const protocolos = data.registros.map((r: any) => `#${r.protocolo}`).join(', ');
          toast.info(`Protocolos criados: ${protocolos}`, {
            duration: 10000,
          });

          // Recarregar a página após 2 segundos
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        }
      } else {
        throw new Error(data.error || 'Erro desconhecido');
      }
    } catch (error: any) {
      console.error('Erro ao criar dados de teste:', error);
      toast.error(error.message || 'Erro ao criar dados de teste. Verifique o console para mais detalhes.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleCriarDados}
      disabled={isLoading}
      variant="outline"
      size="sm"
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Criando...
        </>
      ) : (
        <>
          <TestTube className="w-4 h-4 mr-2" />
          Criar Dados de Teste
        </>
      )}
    </Button>
  );
};
