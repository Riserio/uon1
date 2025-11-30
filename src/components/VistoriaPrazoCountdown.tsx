import { useState, useEffect } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface VistoriaPrazoCountdownProps {
  prazoValidade: string | null;
}

export function VistoriaPrazoCountdown({ prazoValidade }: VistoriaPrazoCountdownProps) {
  const [tempoRestante, setTempoRestante] = useState<{
    dias: number;
    horas: number;
    minutos: number;
    segundos: number;
    expirado: boolean;
  } | null>(null);

  useEffect(() => {
    if (!prazoValidade) return;

    const calcularTempoRestante = () => {
      const agora = new Date().getTime();
      const prazo = new Date(prazoValidade).getTime();
      const diferenca = prazo - agora;

      if (diferenca <= 0) {
        setTempoRestante({ dias: 0, horas: 0, minutos: 0, segundos: 0, expirado: true });
        return;
      }

      const dias = Math.floor(diferenca / (1000 * 60 * 60 * 24));
      const horas = Math.floor((diferenca % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutos = Math.floor((diferenca % (1000 * 60 * 60)) / (1000 * 60));
      const segundos = Math.floor((diferenca % (1000 * 60)) / 1000);

      setTempoRestante({ dias, horas, minutos, segundos, expirado: false });
    };

    calcularTempoRestante();
    const interval = setInterval(calcularTempoRestante, 1000);

    return () => clearInterval(interval);
  }, [prazoValidade]);

  if (!prazoValidade || !tempoRestante) return null;

  const isUrgente = !tempoRestante.expirado && tempoRestante.dias === 0 && tempoRestante.horas < 12;

  if (tempoRestante.expirado) {
    return (
      <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-3 text-red-700">
          <AlertTriangle className="h-6 w-6" />
          <div>
            <p className="font-bold text-lg">Prazo Expirado</p>
            <p className="text-sm text-red-600">O prazo para realizar a vistoria expirou. Entre em contato com a associação.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${isUrgente ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200'} border-2 rounded-xl p-4 mb-6`}>
      <div className="flex items-center gap-3 mb-3">
        <Clock className={`h-5 w-5 ${isUrgente ? 'text-orange-600' : 'text-blue-600'}`} />
        <p className={`font-semibold ${isUrgente ? 'text-orange-700' : 'text-blue-700'}`}>
          Prazo para realizar a vistoria
        </p>
      </div>
      <div className="flex items-center justify-center gap-4">
        {tempoRestante.dias > 0 && (
          <div className="text-center">
            <div className={`text-3xl font-bold ${isUrgente ? 'text-orange-600' : 'text-blue-600'}`}>
              {tempoRestante.dias}
            </div>
            <div className="text-xs text-muted-foreground">dias</div>
          </div>
        )}
        <div className="text-center">
          <div className={`text-3xl font-bold ${isUrgente ? 'text-orange-600' : 'text-blue-600'}`}>
            {String(tempoRestante.horas).padStart(2, '0')}
          </div>
          <div className="text-xs text-muted-foreground">horas</div>
        </div>
        <div className={`text-2xl font-bold ${isUrgente ? 'text-orange-400' : 'text-blue-400'}`}>:</div>
        <div className="text-center">
          <div className={`text-3xl font-bold ${isUrgente ? 'text-orange-600' : 'text-blue-600'}`}>
            {String(tempoRestante.minutos).padStart(2, '0')}
          </div>
          <div className="text-xs text-muted-foreground">min</div>
        </div>
        <div className={`text-2xl font-bold ${isUrgente ? 'text-orange-400' : 'text-blue-400'}`}>:</div>
        <div className="text-center">
          <div className={`text-3xl font-bold ${isUrgente ? 'text-orange-600' : 'text-blue-600'}`}>
            {String(tempoRestante.segundos).padStart(2, '0')}
          </div>
          <div className="text-xs text-muted-foreground">seg</div>
        </div>
      </div>
      {isUrgente && (
        <p className="text-center text-sm text-orange-600 mt-3 font-medium">
          Atenção: O prazo está se esgotando!
        </p>
      )}
    </div>
  );
}
