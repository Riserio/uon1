import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { MaskedInput } from '@/components/ui/masked-input';
import { AlertTriangle, TrendingUp, ClipboardList } from 'lucide-react';
import { validateCPF, validatePhone } from '@/lib/validators';

export default function AberturaSinistro() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    cliente_nome: '',
    cliente_cpf: '',
    cliente_telefone: '',
    cliente_email: '',
    veiculo_placa: '',
    veiculo_marca: '',
    veiculo_modelo: '',
    veiculo_ano: '',
    veiculo_cor: '',
    veiculo_chassi: '',
    data_incidente: '',
    relato_incidente: '',
    tipo_sinistro: '',
    solicitarVistoria: false
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validar CPF
      if (!validateCPF(formData.cliente_cpf)) {
        toast.error('CPF inválido');
        setLoading(false);
        return;
      }

      // Validar telefone
      if (!validatePhone(formData.cliente_telefone)) {
        toast.error('Telefone inválido');
        setLoading(false);
        return;
      }

      // Validar tipo de sinistro
      if (!formData.tipo_sinistro) {
        toast.error('Por favor, selecione o tipo de sinistro');
        setLoading(false);
        return;
      }

      // Buscar primeiro fluxo e primeiro status
      const { data: fluxos } = await supabase
        .from('fluxos')
        .select('id')
        .eq('ativo', true)
        .order('ordem')
        .limit(1);

      if (!fluxos || fluxos.length === 0) {
        toast.error('Nenhum fluxo ativo encontrado');
        return;
      }

      const primeiroFluxoId = fluxos[0].id;

      const { data: statusList } = await supabase
        .from('status_config')
        .select('nome')
        .eq('fluxo_id', primeiroFluxoId)
        .eq('ativo', true)
        .order('ordem')
        .limit(1);

      if (!statusList || statusList.length === 0) {
        toast.error('Nenhum status ativo encontrado para o fluxo');
        return;
      }

      const primeiroStatus = statusList[0].nome;

      // Criar atendimento no kanban
      const vistoriaTag = formData.solicitarVistoria ? 'aguardando_vistoria_digital' : 'sem_vistoria';
      const { data: atendimento, error: atendimentoError } = await supabase
        .from('atendimentos')
        .insert({
          user_id: user?.id,
          assunto: `Sinistro - ${formData.tipo_sinistro} - ${formData.cliente_nome}`,
          observacoes: formData.relato_incidente,
          status: primeiroStatus,
          fluxo_id: primeiroFluxoId,
          prioridade: 'Alta',
          tags: ['sinistro', formData.tipo_sinistro.toLowerCase(), vistoriaTag],
          tipo_atendimento: 'sinistro'
        })
        .select()
        .single();

      if (atendimentoError) throw atendimentoError;

      // Criar vistoria vinculada com todos os dados
      if (atendimento) {
        const { error: vistoriaError } = await supabase
          .from('vistorias')
          .insert({
            created_by: user?.id,
            atendimento_id: atendimento.id,
            tipo_vistoria: 'sinistro',
            tipo_abertura: 'interno',
            tipo_sinistro: formData.tipo_sinistro,
            cliente_nome: formData.cliente_nome,
            cliente_cpf: formData.cliente_cpf,
            cliente_telefone: formData.cliente_telefone,
            cliente_email: formData.cliente_email,
            veiculo_placa: formData.veiculo_placa,
            veiculo_marca: formData.veiculo_marca,
            veiculo_modelo: formData.veiculo_modelo,
            veiculo_ano: formData.veiculo_ano,
            veiculo_cor: formData.veiculo_cor,
            veiculo_chassi: formData.veiculo_chassi,
            data_incidente: formData.data_incidente,
            relato_incidente: formData.relato_incidente,
            status: formData.solicitarVistoria ? 'aguardando_fotos' : 'pendente'
          });

        if (vistoriaError) throw vistoriaError;
      }

      toast.success('Sinistro registrado com sucesso!');
      navigate('/');
    } catch (error) {
      console.error('Erro ao registrar sinistro:', error);
      toast.error('Erro ao registrar sinistro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <AlertTriangle className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Sinistros</h1>
            <p className="text-sm text-muted-foreground">Registre um novo sinistro</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => navigate('/sinistros/acompanhamento')}
            variant="outline"
            className="gap-2"
          >
            <ClipboardList className="h-4 w-4" />
            Acompanhamento
          </Button>
          <Button
            onClick={() => navigate('/dashboard-sinistros')}
            variant="outline"
            className="gap-2"
          >
            <TrendingUp className="h-4 w-4" />
            Dashboard
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados do Sinistro</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Tipo de Sinistro */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">Tipo de Sinistro</h3>
              <div>
                <Label htmlFor="tipo_sinistro">Tipo de Sinistro *</Label>
                <Select
                  value={formData.tipo_sinistro}
                  onValueChange={(value) => setFormData({ ...formData, tipo_sinistro: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo de sinistro" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Colisão">Colisão</SelectItem>
                    <SelectItem value="Roubo/Furto">Roubo/Furto</SelectItem>
                    <SelectItem value="Incêndio">Incêndio</SelectItem>
                    <SelectItem value="Danos a Terceiros">Danos a Terceiros</SelectItem>
                    <SelectItem value="Fenômenos Naturais">Fenômenos Naturais</SelectItem>
                    <SelectItem value="Vidros">Vidros</SelectItem>
                    <SelectItem value="Outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Dados do Cliente */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">Dados do Cliente</h3>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cliente_nome">Nome Completo *</Label>
                  <Input
                    id="cliente_nome"
                    value={formData.cliente_nome}
                    onChange={(e) => setFormData({ ...formData, cliente_nome: e.target.value })}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="cliente_cpf">CPF *</Label>
                  <MaskedInput
                    id="cliente_cpf"
                    format="###.###.###-##"
                    value={formData.cliente_cpf}
                    onValueChange={(values) => 
                      setFormData({ ...formData, cliente_cpf: values.value })
                    }
                    placeholder="000.000.000-00"
                  />
                </div>
                
                <div>
                  <Label htmlFor="cliente_telefone">Telefone *</Label>
                  <MaskedInput
                    id="cliente_telefone"
                    format="(##) #####-####"
                    value={formData.cliente_telefone}
                    onValueChange={(values) => 
                      setFormData({ ...formData, cliente_telefone: values.value })
                    }
                    placeholder="(00) 00000-0000"
                  />
                </div>
                
                <div>
                  <Label htmlFor="cliente_email">Email *</Label>
                  <Input
                    id="cliente_email"
                    type="email"
                    value={formData.cliente_email}
                    onChange={(e) => setFormData({ ...formData, cliente_email: e.target.value })}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Dados do Veículo */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">Dados do Veículo</h3>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="veiculo_placa">Placa *</Label>
                  <MaskedInput
                    id="veiculo_placa"
                    format="AAA-####"
                    value={formData.veiculo_placa}
                    onValueChange={(values) => 
                      setFormData({ ...formData, veiculo_placa: values.value.toUpperCase() })
                    }
                    placeholder="ABC-1234"
                  />
                </div>
                
                <div>
                  <Label htmlFor="veiculo_marca">Marca *</Label>
                  <Input
                    id="veiculo_marca"
                    value={formData.veiculo_marca}
                    onChange={(e) => setFormData({ ...formData, veiculo_marca: e.target.value })}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="veiculo_modelo">Modelo *</Label>
                  <Input
                    id="veiculo_modelo"
                    value={formData.veiculo_modelo}
                    onChange={(e) => setFormData({ ...formData, veiculo_modelo: e.target.value })}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="veiculo_ano">Ano *</Label>
                  <Input
                    id="veiculo_ano"
                    value={formData.veiculo_ano}
                    onChange={(e) => setFormData({ ...formData, veiculo_ano: e.target.value })}
                    placeholder="2020/2021"
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="veiculo_cor">Cor *</Label>
                  <Input
                    id="veiculo_cor"
                    value={formData.veiculo_cor}
                    onChange={(e) => setFormData({ ...formData, veiculo_cor: e.target.value })}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="veiculo_chassi">Chassi</Label>
                  <Input
                    id="veiculo_chassi"
                    value={formData.veiculo_chassi}
                    onChange={(e) => setFormData({ ...formData, veiculo_chassi: e.target.value.toUpperCase() })}
                    placeholder="Digite o chassi do veículo"
                    maxLength={17}
                  />
                </div>
              </div>
            </div>

            {/* Dados do Sinistro */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">Dados do Sinistro</h3>
              
              <div>
                <Label htmlFor="data_incidente">Data do Incidente *</Label>
                <Input
                  id="data_incidente"
                  type="date"
                  value={formData.data_incidente}
                  onChange={(e) => setFormData({ ...formData, data_incidente: e.target.value })}
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="relato_incidente">Relato do Incidente *</Label>
                <Textarea
                  id="relato_incidente"
                  value={formData.relato_incidente}
                  onChange={(e) => setFormData({ ...formData, relato_incidente: e.target.value })}
                  rows={6}
                  placeholder="Descreva detalhadamente o que aconteceu..."
                  required
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="solicitarVistoria"
                  checked={formData.solicitarVistoria}
                  onChange={(e) => setFormData({ ...formData, solicitarVistoria: e.target.checked })}
                  className="h-4 w-4"
                />
                <Label htmlFor="solicitarVistoria" className="cursor-pointer">
                  Solicitar vistoria digital imediatamente
                </Label>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => navigate(-1)} className="flex-1">
                Cancelar
              </Button>
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? 'Registrando...' : 'Registrar Sinistro'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
