import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Settings, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface MethodologyQuestion {
  id: string;
  question: string;
  category: 'strategic' | 'execution' | 'innovation';
  weight: number;
}

interface MethodologyConfig {
  questions: MethodologyQuestion[];
  managerOpinion: number;
  isConfigured: boolean;
}

interface MethodologyConfigDialogProps {
  userId: string;
  onConfigSaved?: (config: MethodologyConfig) => void;
  existingConfig?: MethodologyConfig;
}

const defaultQuestions: MethodologyQuestion[] = [
  { id: 'q1', question: 'Desenvolve estratégias inovadoras para alcançar objetivos de longo prazo?', category: 'strategic', weight: 5 },
  { id: 'q2', question: 'Identifica oportunidades de crescimento e melhorias no negócio?', category: 'strategic', weight: 5 },
  { id: 'q3', question: 'Toma decisões alinhadas com a visão estratégica da empresa?', category: 'strategic', weight: 5 },
  { id: 'q4', question: 'Entrega tarefas no prazo estabelecido?', category: 'execution', weight: 5 },
  { id: 'q5', question: 'Mantém consistência na qualidade das entregas?', category: 'execution', weight: 5 },
  { id: 'q6', question: 'Demonstra proatividade na resolução de problemas?', category: 'execution', weight: 5 },
  { id: 'q7', question: 'Colabora efetivamente com a equipe?', category: 'execution', weight: 5 },
  { id: 'q8', question: 'Gerencia bem suas prioridades e tempo?', category: 'execution', weight: 5 },
  { id: 'q9', question: 'Propõe ideias criativas e inovadoras?', category: 'innovation', weight: 5 },
  { id: 'q10', question: 'Busca continuamente aprender e se desenvolver?', category: 'innovation', weight: 5 },
];

export default function MethodologyConfigDialog({ userId, onConfigSaved, existingConfig }: MethodologyConfigDialogProps) {
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<MethodologyQuestion[]>(
    existingConfig?.questions || defaultQuestions
  );
  const [managerOpinion, setManagerOpinion] = useState(existingConfig?.managerOpinion || 5);
  const [isConfigured, setIsConfigured] = useState(existingConfig?.isConfigured || false);

  useEffect(() => {
    if (existingConfig) {
      setQuestions(existingConfig.questions);
      setManagerOpinion(existingConfig.managerOpinion);
      setIsConfigured(existingConfig.isConfigured);
    }
  }, [existingConfig]);

  const handleWeightChange = (questionId: string, value: number[]) => {
    setQuestions(questions.map(q => 
      q.id === questionId ? { ...q, weight: value[0] } : q
    ));
  };

  const handleSave = () => {
    const config: MethodologyConfig = {
      questions,
      managerOpinion,
      isConfigured: true,
    };
    
    // Save to localStorage for this user
    localStorage.setItem(`methodology_config_${userId}`, JSON.stringify(config));
    
    setIsConfigured(true);
    onConfigSaved?.(config);
    setOpen(false);
  };

  const calculateScore = () => {
    // Calculate category scores
    const strategicQuestions = questions.filter(q => q.category === 'strategic');
    const executionQuestions = questions.filter(q => q.category === 'execution');
    const innovationQuestions = questions.filter(q => q.category === 'innovation');

    const strategicScore = strategicQuestions.reduce((sum, q) => sum + q.weight, 0) / (strategicQuestions.length * 10) * 100;
    const executionScore = executionQuestions.reduce((sum, q) => sum + q.weight, 0) / (executionQuestions.length * 10) * 100;
    const innovationScore = innovationQuestions.reduce((sum, q) => sum + q.weight, 0) / (innovationQuestions.length * 10) * 100;

    // Apply methodology weights: 20% strategic, 70% execution, 10% innovation
    const baseScore = (strategicScore * 0.20) + (executionScore * 0.70) + (innovationScore * 0.10);
    
    // Apply manager opinion impact (±10% based on manager's opinion)
    const managerImpact = ((managerOpinion - 5) / 5) * 10;
    const finalScore = Math.max(0, Math.min(100, baseScore + managerImpact));

    // Determine performance tier
    let tier = '';
    let tierColor = '';
    if (finalScore >= 80) {
      tier = 'Top 20% - Alto Desempenho';
      tierColor = 'bg-green-500';
    } else if (finalScore >= 30) {
      tier = '70% - Desempenho Consistente';
      tierColor = 'bg-blue-500';
    } else {
      tier = 'Bottom 10% - Necessita Melhoria';
      tierColor = 'bg-red-500';
    }

    return { finalScore: finalScore.toFixed(1), tier, tierColor };
  };

  const score = calculateScore();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isConfigured ? (
          <Button variant="outline" size="sm">
            <Check className="w-4 h-4 mr-2" />
            Metodologia Configurada
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Configurar Avaliação
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuração de Avaliação de Desempenho</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-3">
          {/* Score Preview */}
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <CardContent className="pt-4 pb-3">
              <div className="text-center space-y-1.5">
                <div className="text-3xl font-bold text-primary">{score.finalScore}</div>
                <Badge className={`${score.tierColor} text-white`}>{score.tier}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Strategic Questions (20%) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-strategic/10">Estratégico (20%)</Badge>
            </div>
            {questions.filter(q => q.category === 'strategic').map((question) => (
              <div key={question.id} className="space-y-1.5">
                <Label className="text-sm">{question.question}</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[question.weight]}
                    onValueChange={(value) => handleWeightChange(question.id, value)}
                    min={0}
                    max={10}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-sm font-medium w-8 text-right">{question.weight}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Execution Questions (70%) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-execution/10">Execução (70%)</Badge>
            </div>
            {questions.filter(q => q.category === 'execution').map((question) => (
              <div key={question.id} className="space-y-1.5">
                <Label className="text-sm">{question.question}</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[question.weight]}
                    onValueChange={(value) => handleWeightChange(question.id, value)}
                    min={0}
                    max={10}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-sm font-medium w-8 text-right">{question.weight}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Innovation Questions (10%) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-innovation/10">Inovação (10%)</Badge>
            </div>
            {questions.filter(q => q.category === 'innovation').map((question) => (
              <div key={question.id} className="space-y-1.5">
                <Label className="text-sm">{question.question}</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[question.weight]}
                    onValueChange={(value) => handleWeightChange(question.id, value)}
                    min={0}
                    max={10}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-sm font-medium w-8 text-right">{question.weight}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Manager Opinion */}
          <div className="space-y-3 pt-3 border-t">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Avaliação do Gestor (Impacto: ±10%)</Badge>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Qual sua opinião geral sobre o desempenho deste colaborador?</Label>
              <div className="flex items-center gap-4">
                <Slider
                  value={[managerOpinion]}
                  onValueChange={(value) => setManagerOpinion(value[0])}
                  min={0}
                  max={10}
                  step={1}
                  className="flex-1"
                />
                <span className="text-sm font-medium w-8 text-right">{managerOpinion}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                0 = Muito Insatisfeito | 5 = Neutro | 10 = Muito Satisfeito
              </p>
            </div>
          </div>

          <div className="flex gap-2 pt-3">
            <Button onClick={handleSave} className="flex-1">
              <Check className="w-4 h-4 mr-2" />
              Salvar Avaliação
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
