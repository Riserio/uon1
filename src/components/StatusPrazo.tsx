import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Clock } from 'lucide-react';

interface StatusPrazoProps {
  statusNome: string;
  fluxoId?: string;
}

export const StatusPrazo = ({ statusNome, fluxoId }: StatusPrazoProps) => {
  const [prazoHoras, setPrazoHoras] = useState<number | null>(null);

  useEffect(() => {
    const loadPrazo = async () => {
      if (!fluxoId) return;

      const { data } = await supabase
        .from('status_config')
        .select('prazo_horas')
        .eq('fluxo_id', fluxoId)
        .eq('nome', statusNome)
        .eq('ativo', true)
        .maybeSingle();

      if (data?.prazo_horas) {
        setPrazoHoras(data.prazo_horas);
      }
    };

    loadPrazo();
  }, [statusNome, fluxoId]);

  if (!prazoHoras) return null;

  const dias = Math.floor(prazoHoras / 24);
  const horas = prazoHoras % 24;

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="w-3 h-3" />
      <span>
        Prazo previsto: {dias > 0 ? `${dias}d ` : ''}{horas > 0 ? `${horas}h` : ''}
      </span>
    </div>
  );
};
