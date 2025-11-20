import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, AlertTriangle, Car, User, Calendar, FileText, MapPin } from 'lucide-react';
import { format } from 'date-fns';

interface Corretora {
  id: string;
  nome: string;
}

interface Contato {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
}

export default function AberturaSinistro() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [corretoras, setCorretoras] = useState<Corretora[]>([]);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [fluxos, setFluxos] = useState<any[]>([]);
  const [statusList, setStatusList] = useState<any[]>([]);
  
  // Campos do formulário
  const [tipoSinistro, setTipoSinistro] = useState<'casco' | 'terceiros' | 'roubo'>('casco');
  const [corretoraId, setCorretoraId] = useState('');
  const [contatoId, setContatoId] = useState('');
  const [dataOcorrencia, setDataOcorrencia] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [horaOcorrencia, setHoraOcorrencia] = useState(format(new Date(), 'HH:mm'));
  const [localOcorrencia, setLocalOcorrencia] = useState('');
  const [descricaoOcorrido, setDescricaoOcorrido] = useState('');
  
  // Dados do veículo
  const [veiculoPlaca, setVeiculoPlaca] = useState('');
  const [veiculoMarca, setVeiculoMarca] = useState('');
  const [veiculoModelo, setVeiculoModelo] = useState('');
  const [veiculoAno, setVeiculoAno] = useState('');
  const [veiculoCor, setVeiculoCor] = useState('');
  const [veiculoChassi, setVeiculoChassi] = useState('');
  
  // Dados do segurado
  const [seguradoNome, setSeguradoNome] = useState('');
  const [seguradoCpf, setSeguradoCpf] = useState('');
  const [seguradoTelefone, setSeguradoTelefone] = useState('');
  const [seguradoEmail, setSeguradoEmail] = useState('');
  
  // Opções adicionais
  const [solicitarVistoria, setSolicitarVistoria] = useState(false);

  useEffect(() => {
    loadCorretoras();
    loadFluxos();
  }, []);

  useEffect(() => {
    if (corretoraId) {
      loadContatos(corretoraId);
    }
  }, [corretoraId]);

  const loadCorretoras = async () => {
    try {
      const { data, error } = await supabase
        .from('corretoras')
        .select('id, nome')
        .order('nome');

      if (error) throw error;
      setCorretoras(data || []);
    } catch (error) {
      console.error('Erro ao carregar corretoras:', error);
      toast.error('Erro ao carregar corretoras');
    }
  };

  const loadContatos = async (corretoraId: string) => {
    try {
      const { data, error } = await supabase
        .from('contatos')
        .select('id, nome, email, telefone')
        .eq('corretora_id', corretoraId)
        .order('nome');

      if (error) throw error;
      setContatos(data || []);
    } catch (error) {
      console.error('Erro ao carregar contatos:', error);
      toast.error('Erro ao carregar contatos');
    }
  };

  const loadFluxos = async () => {
    try {
      const { data: fluxosData, error: fluxosError } = await supabase
        .from('fluxos')
        .select('*')
        .eq('ativo', true)
        .order('ordem');

      if (fluxosError) throw fluxosError;
      setFluxos(fluxosData || []);

      // Carregar o primeiro fluxo e seu primeiro status
      if (fluxosData && fluxosData.length > 0) {
        const primeiroFluxo = fluxosData[0];
        const { data: statusData, error: statusError } = await supabase
          .from('status_config')
          .select('*')
          .eq('fluxo_id', primeiroFluxo.id)
          .eq('ativo', true)
          .order('ordem');

        if (statusError) throw statusError;
        setStatusList(statusData || []);
      }
    } catch (error) {
      console.error('Erro ao carregar fluxos:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!corretoraId || !seguradoNome || !veiculoPlaca) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Obter o primeiro fluxo e primeiro status
      const primeiroFluxo = fluxos[0];
      const primeiroStatus = statusList[0];

      if (!primeiroFluxo || !primeiroStatus) {
        throw new Error('Fluxo ou status não configurado');
      }

      // Criar atendimento (card no kanban)
      const assuntoSinistro = `Sinistro ${tipoSinistro.toUpperCase()} - ${seguradoNome} - ${veiculoPlaca}`;
      
      const observacoes = `
**DADOS DO SINISTRO**
Tipo: ${tipoSinistro === 'casco' ? 'Casco' : tipoSinistro === 'terceiros' ? 'Terceiros' : 'Roubo/Furto'}
Data/Hora: ${format(new Date(`${dataOcorrencia}T${horaOcorrencia}`), "dd/MM/yyyy 'às' HH:mm")}
Local: ${localOcorrencia}

**DESCRIÇÃO**
${descricaoOcorrido}

**VEÍCULO**
Placa: ${veiculoPlaca}
Marca/Modelo: ${veiculoMarca} ${veiculoModelo}
Ano: ${veiculoAno}
Cor: ${veiculoCor}
Chassi: ${veiculoChassi}

**SEGURADO**
Nome: ${seguradoNome}
CPF: ${seguradoCpf}
Telefone: ${seguradoTelefone}
Email: ${seguradoEmail}
      `.trim();

      const { data: atendimento, error: atendimentoError } = await supabase
        .from('atendimentos')
        .insert({
          assunto: assuntoSinistro,
          status: primeiroStatus.nome,
          prioridade: 'Alta',
          corretora_id: corretoraId,
          contato_id: contatoId || null,
          user_id: user.id,
          fluxo_id: primeiroFluxo.id,
          observacoes: observacoes,
          tags: ['sinistro', tipoSinistro]
        })
        .select()
        .single();

      if (atendimentoError) throw atendimentoError;

      // Se solicitou vistoria, criar vistoria vinculada
      if (solicitarVistoria) {
        const { error: vistoriaError } = await supabase
          .from('vistorias')
          .insert({
            tipo_abertura: 'manual',
            tipo_vistoria: 'sinistro',
            corretora_id: corretoraId,
            atendimento_id: atendimento.id,
            status: 'aguardando_fotos',
            created_by: user.id,
            cliente_nome: seguradoNome,
            cliente_cpf: seguradoCpf,
            cliente_telefone: seguradoTelefone,
            cliente_email: seguradoEmail,
            veiculo_placa: veiculoPlaca,
            veiculo_marca: veiculoMarca,
            veiculo_modelo: veiculoModelo,
            veiculo_ano: veiculoAno,
            veiculo_cor: veiculoCor,
            veiculo_chassi: veiculoChassi,
            data_incidente: `${dataOcorrencia}T${horaOcorrencia}:00`,
            endereco: localOcorrencia,
            relato_incidente: descricaoOcorrido
          });

        if (vistoriaError) {
          console.error('Erro ao criar vistoria:', vistoriaError);
          toast.error('Sinistro criado, mas erro ao criar vistoria');
        }
      }

      toast.success('Sinistro aberto com sucesso!');
      navigate('/atendimentos');
    } catch (error) {
      console.error('Erro ao abrir sinistro:', error);
      toast.error('Erro ao abrir sinistro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-destructive/5 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate('/atendimentos')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </div>

        <Card className="shadow-2xl border-destructive/20">
          <CardHeader className="bg-gradient-to-r from-destructive/10 to-destructive/5 border-b">
            <CardTitle className="text-3xl flex items-center gap-3">
              <div className="p-3 bg-destructive/10 rounded-lg">
                <AlertTriangle className="h-7 w-7 text-destructive" />
              </div>
              Abertura de Sinistro
            </CardTitle>
            <p className="text-muted-foreground mt-2">
              Registre um novo sinistro e crie automaticamente um card de atendimento no sistema
            </p>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="p-6 space-y-8">
              {/* Tipo de Sinistro */}
              <div className="space-y-3">
                <Label className="text-lg font-semibold flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Tipo de Sinistro
                </Label>
                <RadioGroup value={tipoSinistro} onValueChange={(value: any) => setTipoSinistro(value)}>
                  <div className="grid grid-cols-3 gap-4">
                    <Label
                      htmlFor="casco"
                      className={`flex items-center justify-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        tipoSinistro === 'casco' 
                          ? 'border-destructive bg-destructive/10' 
                          : 'border-border hover:border-destructive/50'
                      }`}
                    >
                      <RadioGroupItem value="casco" id="casco" className="sr-only" />
                      <Car className="h-5 w-5" />
                      <span className="font-medium">Casco</span>
                    </Label>
                    <Label
                      htmlFor="terceiros"
                      className={`flex items-center justify-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        tipoSinistro === 'terceiros' 
                          ? 'border-destructive bg-destructive/10' 
                          : 'border-border hover:border-destructive/50'
                      }`}
                    >
                      <RadioGroupItem value="terceiros" id="terceiros" className="sr-only" />
                      <User className="h-5 w-5" />
                      <span className="font-medium">Terceiros</span>
                    </Label>
                    <Label
                      htmlFor="roubo"
                      className={`flex items-center justify-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        tipoSinistro === 'roubo' 
                          ? 'border-destructive bg-destructive/10' 
                          : 'border-border hover:border-destructive/50'
                      }`}
                    >
                      <RadioGroupItem value="roubo" id="roubo" className="sr-only" />
                      <AlertTriangle className="h-5 w-5" />
                      <span className="font-medium">Roubo/Furto</span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Corretora e Contato */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="corretora">Corretora *</Label>
                  <Select value={corretoraId} onValueChange={setCorretoraId}>
                    <SelectTrigger>
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

                <div className="space-y-2">
                  <Label htmlFor="contato">Contato</Label>
                  <Select value={contatoId} onValueChange={setContatoId} disabled={!corretoraId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o contato" />
                    </SelectTrigger>
                    <SelectContent>
                      {contatos.map((contato) => (
                        <SelectItem key={contato.id} value={contato.id}>
                          {contato.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Dados da Ocorrência */}
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <Label className="text-lg font-semibold flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Dados da Ocorrência
                </Label>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dataOcorrencia">Data da Ocorrência</Label>
                    <Input
                      id="dataOcorrencia"
                      type="date"
                      value={dataOcorrencia}
                      onChange={(e) => setDataOcorrencia(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="horaOcorrencia">Hora da Ocorrência</Label>
                    <Input
                      id="horaOcorrencia"
                      type="time"
                      value={horaOcorrencia}
                      onChange={(e) => setHoraOcorrencia(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="localOcorrencia" className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Local da Ocorrência
                  </Label>
                  <Input
                    id="localOcorrencia"
                    placeholder="Endereço completo onde ocorreu o sinistro"
                    value={localOcorrencia}
                    onChange={(e) => setLocalOcorrencia(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="descricaoOcorrido">Descrição do Ocorrido</Label>
                  <Textarea
                    id="descricaoOcorrido"
                    placeholder="Descreva detalhadamente como o sinistro ocorreu..."
                    value={descricaoOcorrido}
                    onChange={(e) => setDescricaoOcorrido(e.target.value)}
                    rows={4}
                  />
                </div>
              </div>

              {/* Dados do Veículo */}
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <Label className="text-lg font-semibold flex items-center gap-2">
                  <Car className="h-5 w-5 text-primary" />
                  Dados do Veículo
                </Label>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="veiculoPlaca">Placa *</Label>
                    <Input
                      id="veiculoPlaca"
                      placeholder="ABC-1234"
                      value={veiculoPlaca}
                      onChange={(e) => setVeiculoPlaca(e.target.value.toUpperCase())}
                      maxLength={8}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="veiculoMarca">Marca</Label>
                    <Input
                      id="veiculoMarca"
                      placeholder="Ex: Fiat"
                      value={veiculoMarca}
                      onChange={(e) => setVeiculoMarca(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="veiculoModelo">Modelo</Label>
                    <Input
                      id="veiculoModelo"
                      placeholder="Ex: Uno"
                      value={veiculoModelo}
                      onChange={(e) => setVeiculoModelo(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="veiculoAno">Ano</Label>
                    <Input
                      id="veiculoAno"
                      placeholder="2020"
                      value={veiculoAno}
                      onChange={(e) => setVeiculoAno(e.target.value)}
                      maxLength={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="veiculoCor">Cor</Label>
                    <Input
                      id="veiculoCor"
                      placeholder="Ex: Branco"
                      value={veiculoCor}
                      onChange={(e) => setVeiculoCor(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="veiculoChassi">Chassi</Label>
                    <Input
                      id="veiculoChassi"
                      placeholder="17 caracteres"
                      value={veiculoChassi}
                      onChange={(e) => setVeiculoChassi(e.target.value.toUpperCase())}
                      maxLength={17}
                    />
                  </div>
                </div>
              </div>

              {/* Dados do Segurado */}
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <Label className="text-lg font-semibold flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  Dados do Segurado
                </Label>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="seguradoNome">Nome Completo *</Label>
                    <Input
                      id="seguradoNome"
                      placeholder="Nome completo do segurado"
                      value={seguradoNome}
                      onChange={(e) => setSeguradoNome(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="seguradoCpf">CPF</Label>
                    <Input
                      id="seguradoCpf"
                      placeholder="000.000.000-00"
                      value={seguradoCpf}
                      onChange={(e) => setSeguradoCpf(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="seguradoTelefone">Telefone</Label>
                    <Input
                      id="seguradoTelefone"
                      placeholder="(00) 00000-0000"
                      value={seguradoTelefone}
                      onChange={(e) => setSeguradoTelefone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="seguradoEmail">Email</Label>
                    <Input
                      id="seguradoEmail"
                      type="email"
                      placeholder="email@exemplo.com"
                      value={seguradoEmail}
                      onChange={(e) => setSeguradoEmail(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Opção de Vistoria */}
              <div className="flex items-center space-x-2 p-4 bg-primary/5 rounded-lg border border-primary/20">
                <input
                  type="checkbox"
                  id="solicitarVistoria"
                  checked={solicitarVistoria}
                  onChange={(e) => setSolicitarVistoria(e.target.checked)}
                  className="rounded border-primary"
                />
                <Label htmlFor="solicitarVistoria" className="cursor-pointer">
                  Solicitar vistoria para este sinistro
                </Label>
              </div>

              {/* Botões */}
              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/atendimentos')}
                  disabled={loading}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-destructive to-destructive/80"
                >
                  {loading ? 'Abrindo...' : 'Abrir Sinistro'}
                </Button>
              </div>
            </CardContent>
          </form>
        </Card>
      </div>
    </div>
  );
}
