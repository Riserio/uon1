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
      const { data, error } = await supabase.functions.invoke('criar-dados-teste');

      if (error) throw error;

      toast.success(data.message);
      
      if (data.registros && data.registros.length > 0) {
        console.log('Registros criados:', data.registros);
        toast.info(`Protocolos criados: ${data.registros.map((r: any) => r.protocolo).join(', ')}`);
      }
    } catch (error) {
      console.error('Erro ao criar dados de teste:', error);
      toast.error('Erro ao criar dados de teste');
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
