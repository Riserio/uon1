interface VistoriaOverlayProps {
  posicao: 'frontal' | 'traseira' | 'lateral_esquerda' | 'lateral_direita';
}

export function VistoriaOverlay({ posicao }: VistoriaOverlayProps) {
  const getCarPath = () => {
    switch (posicao) {
      case 'frontal':
        return 'M10 30 L10 70 L20 75 L40 75 L40 70 L50 70 L50 75 L70 75 L80 70 L80 30 Z M15 35 L35 35 L35 45 L15 45 Z M55 35 L75 35 L75 45 L55 45 Z';
      case 'traseira':
        return 'M10 30 L10 70 L20 75 L40 75 L40 70 L50 70 L50 75 L70 75 L80 70 L80 30 Z M15 35 L35 35 L35 45 L15 45 Z M55 35 L75 35 L75 45 L55 45 Z';
      case 'lateral_esquerda':
        return 'M10 35 L30 30 L70 30 L90 35 L90 45 L85 50 L20 50 L10 45 Z M25 32 L35 32 L35 38 L25 38 Z M60 32 L70 32 L70 38 L60 38 Z';
      case 'lateral_direita':
        return 'M10 35 L30 30 L70 30 L90 35 L90 45 L85 50 L20 50 L10 45 Z M25 32 L35 32 L35 38 L25 38 Z M60 32 L70 32 L70 38 L60 38 Z';
    }
  };

  const getTitulo = () => {
    switch (posicao) {
      case 'frontal':
        return 'Frente do Veículo';
      case 'traseira':
        return 'Traseira do Veículo';
      case 'lateral_esquerda':
        return 'Lateral Esquerda';
      case 'lateral_direita':
        return 'Lateral Direita';
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      <div className="text-center space-y-4">
        <svg 
          viewBox="0 0 100 80" 
          className="w-48 h-48 mx-auto opacity-30"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d={getCarPath()} />
        </svg>
        <div className="bg-background/80 backdrop-blur-sm px-4 py-2 rounded-lg">
          <p className="text-lg font-semibold">{getTitulo()}</p>
          <p className="text-sm text-muted-foreground">
            Alinhe o veículo com o gabarito
          </p>
        </div>
      </div>
    </div>
  );
}
