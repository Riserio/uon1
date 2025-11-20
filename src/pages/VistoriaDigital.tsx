import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Car, Link as LinkIcon, Mail, MessageCircle, CheckCircle2, Copy, Calendar, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Corretora {
  id: string;
  nome: string;
  logo_url?: string;
}

export default function VistoriaDigital() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [tipoVistoria, setTipoVistoria] = useState<'sinistro' | 'reativacao'>('sinistro');
  const [corretoraId, setCorretoraId] = useState('');
  const [clienteCpf, setClienteCpf] = useState('');
  const [vistoriaId, setVistoriaId] = useState('');
  const [linkToken, setLinkToken] = useState('');
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [corretoras, setCorretoras] = useState<Corretora[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Novos campos para agendamento
  const [dataVistoria, setDataVistoria] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [duracao, setDuracao] = useState('60'); // em minutos

  useEffect(() => {
    loadCorretoras();
  }, []);

  const loadCorretoras = async () => {
    try {
      const { data, error } = await supabase
        .from('corretoras')
        .select('id, nome, logo_url')
        .order('nome');

      if (error) throw error;
      setCorretoras(data || []);
    } catch (error) {
      console.error('Erro ao carregar corretoras:', error);
      toast.error('Erro ao carregar corretoras');
    }
  };

  const createVistoria = async () => {
    if (!corretoraId) {
      toast.error('Selecione uma corretora');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Gerar token único para o link
      const token = Math.random().toString(36).substring(2, 15) + 
                   Math.random().toString(36).substring(2, 15);

      // Criar vistoria com data/hora de agendamento
      const { data: vistoria, error: vistoriaError } = await supabase
        .from('vistorias')
        .insert({
          tipo_abertura: 'digital',
          tipo_vistoria: tipoVistoria,
          corretora_id: corretoraId,
          cliente_cpf: clienteCpf || null,
          status: 'aguardando_fotos',
          link_token: token,
          link_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 dias
          created_by: user.id,
          data_incidente: dataVistoria ? new Date(dataVistoria).toISOString() : null,
          observacoes: horaInicio && duracao 
            ? `Vistoria agendada para ${horaInicio} - Duração estimada: ${duracao} minutos` 
            : null
        })
        .select()
        .single();

      if (vistoriaError) throw vistoriaError;

      // Criar atendimento vinculado
      const { error: atendimentoError } = await supabase
        .from('atendimentos')
        .insert({
          assunto: `Vistoria ${tipoVistoria === 'sinistro' ? 'de Sinistro' : 'de Reativação'} #${vistoria.numero}`,
          status: 'novo',
          prioridade: 'Alta',
          corretora_id: corretoraId,
          user_id: user.id,
          observacoes: `Vistoria digital criada. Link gerado para o cliente.${
            dataVistoria ? `\nAgendada para: ${new Date(dataVistoria).toLocaleDateString('pt-BR')}` : ''
          }${horaInicio ? ` às ${horaInicio}` : ''}${duracao ? ` (${duracao} min)` : ''}`
        });

      if (atendimentoError) console.error('Erro ao criar atendimento:', atendimentoError);

      setVistoriaId(vistoria.id);
      setLinkToken(token);
      setCurrentStep(2);
      toast.success('Vistoria criada com sucesso!');
    } catch (error) {
      console.error('Erro ao criar vistoria:', error);
      toast.error('Erro ao criar vistoria');
    } finally {
      setLoading(false);
    }
  };

  const getVistoriaLink = () => {
    return `${window.location.origin}/vistoria/${linkToken}`;
  };

  const copyLink = () => {
    navigator.clipboard.writeText(getVistoriaLink());
    toast.success('Link copiado para área de transferência!');
  };

  const sendWhatsApp = () => {
    const message = `🚗 *Vistoria Digital de Veículo*\n\nOlá! Para realizar sua vistoria digital, acesse o link abaixo:\n\n${getVistoriaLink()}\n\n📱 Tire fotos do veículo seguindo as instruções na tela.\n⏰ Link válido por 7 dias.\n\n_Sistema de Vistorias - Automático_`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const sendEmail = () => {
    setShowShareDialog(true);
  };

  // Gerar opções de horário (08:00 - 18:00)
  const horariosDisponiveis = [];
  for (let h = 8; h <= 18; h++) {
    horariosDisponiveis.push(`${h.toString().padStart(2, '0')}:00`);
    if (h < 18) horariosDisponiveis.push(`${h.toString().padStart(2, '0')}:30`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate('/vistorias')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              currentStep >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}>
              1
            </div>
            <div className={`w-12 h-0.5 ${currentStep >= 2 ? 'bg-primary' : 'bg-muted'}`} />
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              currentStep >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}>
              2
            </div>
          </div>
        </div>

        {currentStep === 1 && (
          <Card className="shadow-2xl border-primary/20">
            <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
              <CardTitle className="text-2xl flex items-center gap-3">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Car className="h-6 w-6 text-primary" />
                </div>
                Nova Vistoria Digital
              </CardTitle>
              <p className="text-muted-foreground">
                Configure a vistoria e gere um link para o cliente realizar a captura das fotos
              </p>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Tipo de Vistoria */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Tipo de Vistoria</Label>
                <RadioGroup value={tipoVistoria} onValueChange={(value: any) => setTipoVistoria(value)}>
                  <div className="grid grid-cols-2 gap-4">
                    <Label
                      htmlFor="sinistro"
                      className={`flex items-center space-x-3 border-2 rounded-lg p-4 cursor-pointer transition-all ${
                        tipoVistoria === 'sinistro'
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <RadioGroupItem value="sinistro" id="sinistro" />
                      <div>
                        <div className="font-semibold">Sinistro</div>
                        <div className="text-sm text-muted-foreground">Análise de danos</div>
                      </div>
                    </Label>
                    <Label
                      htmlFor="reativacao"
                      className={`flex items-center space-x-3 border-2 rounded-lg p-4 cursor-pointer transition-all ${
                        tipoVistoria === 'reativacao'
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <RadioGroupItem value="reativacao" id="reativacao" />
                      <div>
                        <div className="font-semibold">Reativação</div>
                        <div className="text-sm text-muted-foreground">Vistoria prévia</div>
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Corretora */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">Corretora Responsável *</Label>
                <Select value={corretoraId} onValueChange={setCorretoraId}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Selecione a corretora" />
                  </SelectTrigger>
                  <SelectContent>
                    {corretoras.map((corretora) => (
                      <SelectItem key={corretora.id} value={corretora.id}>
                        {corretora.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* CPF do Cliente (Opcional) */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">CPF do Cliente (Opcional)</Label>
                <Input
                  placeholder="000.000.000-00"
                  value={clienteCpf}
                  onChange={(e) => setClienteCpf(e.target.value)}
                  className="h-12"
                />
                <p className="text-xs text-muted-foreground">
                  O CPF pode ser preenchido posteriormente pelo cliente via CNH
                </p>
              </div>

              {/* Agendamento */}
              <div className="border-t pt-6 space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="h-5 w-5 text-primary" />
                  <Label className="text-base font-semibold">Agendamento (Opcional)</Label>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Data da Vistoria</Label>
                    <Input
                      type="date"
                      value={dataVistoria}
                      onChange={(e) => setDataVistoria(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="h-12"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Horário de Início</Label>
                    <Select value={horaInicio} onValueChange={setHoraInicio}>
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {horariosDisponiveis.map((hora) => (
                          <SelectItem key={hora} value={hora}>{hora}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Duração Estimada</Label>
                    <Select value={duracao} onValueChange={setDuracao}>
                      <SelectTrigger className="h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 minutos</SelectItem>
                        <SelectItem value="60">1 hora</SelectItem>
                        <SelectItem value="90">1h 30min</SelectItem>
                        <SelectItem value="120">2 horas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Button
                onClick={createVistoria}
                disabled={loading || !corretoraId}
                className="w-full h-14 text-lg bg-gradient-to-r from-primary to-primary/80"
              >
                {loading ? 'Gerando Link...' : 'Gerar Link de Vistoria'}
              </Button>
            </CardContent>
          </Card>
        )}

        {currentStep === 2 && (
          <Card className="shadow-2xl border-green-500/20">
            <CardHeader className="bg-gradient-to-r from-green-500/10 to-green-500/5">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
                <div>
                  <CardTitle className="text-2xl">Link Gerado com Sucesso!</CardTitle>
                  <p className="text-muted-foreground mt-1">
                    Compartilhe o link com o cliente para iniciar a vistoria
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Link Card */}
              <div className="bg-muted/50 rounded-lg p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <Car className="h-5 w-5 text-primary mt-1" />
                  <div className="flex-1 space-y-2">
                    <Label className="text-sm font-semibold">Link da Vistoria</Label>
                    <div className="flex gap-2">
                      <Input
                        value={getVistoriaLink()}
                        readOnly
                        className="font-mono text-sm"
                      />
                      <Button onClick={copyLink} variant="outline" size="icon">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ⏰ Link válido por 7 dias • 📱 Funciona em qualquer dispositivo
                    </p>
                  </div>
                </div>
              </div>

              {/* Compartilhar */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Compartilhar via:</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Button
                    onClick={sendWhatsApp}
                    className="h-14 gap-3 bg-green-600 hover:bg-green-700"
                  >
                    <MessageCircle className="h-5 w-5" />
                    WhatsApp
                  </Button>
                  <Button
                    onClick={sendEmail}
                    variant="outline"
                    className="h-14 gap-3"
                  >
                    <Mail className="h-5 w-5" />
                    E-mail
                  </Button>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={() => navigate('/vistorias/historico')}
                  variant="outline"
                  className="flex-1 h-12"
                >
                  Ver Histórico
                </Button>
                <Button
                  onClick={() => {
                    setCurrentStep(1);
                    setCorretoraId('');
                    setClienteCpf('');
                    setDataVistoria('');
                    setHoraInicio('');
                  }}
                  className="flex-1 h-12 bg-gradient-to-r from-primary to-primary/80"
                >
                  Nova Vistoria
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog de E-mail */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar por E-mail</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>E-mail do destinatário</Label>
              <Input type="email" placeholder="cliente@email.com" />
            </div>
            <div className="space-y-2">
              <Label>Mensagem (opcional)</Label>
              <Input placeholder="Adicione uma mensagem personalizada" />
            </div>
            <Button className="w-full">Enviar E-mail</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
