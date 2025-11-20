import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Upload, X, Save } from 'lucide-react';

export default function VistoriaManual() {
  const navigate = useNavigate();
  const [tipoVistoria, setTipoVistoria] = useState<'sinistro' | 'reativacao'>('sinistro');
  const [fotos, setFotos] = useState<File[]>([]);
  const [fotoPreviews, setFotoPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    // Veículo
    veiculo_placa: '',
    veiculo_marca: '',
    veiculo_modelo: '',
    veiculo_ano: '',
    veiculo_cor: '',
    veiculo_chassi: '',
    // Cliente
    cliente_nome: '',
    cliente_email: '',
    cliente_telefone: '',
    cliente_cpf: '',
    // Sinistro
    relato_incidente: '',
    data_incidente: '',
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (fotos.length + files.length > 4) {
      toast.error('Máximo de 4 fotos permitidas');
      return;
    }

    setFotos([...fotos, ...files]);
    
    // Criar previews
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFotoPreviews(prev => [...prev, e.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeFoto = (index: number) => {
    setFotos(fotos.filter((_, i) => i !== index));
    setFotoPreviews(fotoPreviews.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (fotos.length < 4) {
      toast.error('São necessárias 4 fotos para a vistoria');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Obter geolocalização
      let latitude, longitude, endereco;
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject);
        });
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
        
        // Reverse geocoding simplificado (pode ser melhorado com API)
        endereco = `Lat: ${latitude.toFixed(6)}, Long: ${longitude.toFixed(6)}`;
      } catch (error) {
        console.error('Erro ao obter localização:', error);
      }

      // Criar vistoria
      const { data: vistoria, error: vistoriaError } = await supabase
        .from('vistorias')
        .insert({
          tipo_abertura: 'manual',
          tipo_vistoria: tipoVistoria,
          status: 'em_analise',
          created_by: user.id,
          latitude,
          longitude,
          endereco,
          ...formData
        })
        .select()
        .single();

      if (vistoriaError) throw vistoriaError;

      // Upload das fotos
      const posicoes = ['frontal', 'traseira', 'lateral_esquerda', 'lateral_direita'];
      for (let i = 0; i < fotos.length; i++) {
        const foto = fotos[i];
        const fileName = `${vistoria.id}/${posicoes[i]}_${Date.now()}.${foto.name.split('.').pop()}`;
        
        const { error: uploadError } = await supabase.storage
          .from('vistorias')
          .upload(fileName, foto);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('vistorias')
          .getPublicUrl(fileName);

        // Salvar registro da foto
        const { error: fotoError } = await supabase
          .from('vistoria_fotos')
          .insert({
            vistoria_id: vistoria.id,
            posicao: posicoes[i],
            arquivo_url: publicUrl,
            arquivo_nome: foto.name,
            arquivo_tamanho: foto.size,
            ordem: i + 1
          });

        if (fotoError) throw fotoError;
      }

      // Buscar o primeiro fluxo ativo e criar atendimento
      const { data: fluxos, error: fluxosError } = await supabase
        .from('fluxos')
        .select('id')
        .eq('ativo', true)
        .order('ordem')
        .limit(1);

      if (fluxosError) throw fluxosError;

      if (fluxos && fluxos.length > 0) {
        const fluxoId = fluxos[0].id;
        const { data: statusList, error: statusError } = await supabase
          .from('status_config')
          .select('nome')
          .eq('fluxo_id', fluxoId)
          .eq('ativo', true)
          .order('ordem')
          .limit(1);

        if (statusError) throw statusError;

        if (statusList && statusList.length > 0) {
          await supabase.from('atendimentos').insert({
            user_id: user.id,
            assunto: `Vistoria ${tipoVistoria === 'sinistro' ? 'Sinistro' : 'Reativação'} - ${formData.veiculo_placa}`,
            prioridade: 'Alta',
            status: statusList[0].nome,
            fluxo_id: fluxoId,
            observacoes: `Vistoria manual criada.\nCliente: ${formData.cliente_nome}\nVeículo: ${formData.veiculo_marca} ${formData.veiculo_modelo} (${formData.veiculo_placa})\nRelato: ${formData.relato_incidente}`
          });
        }
      }

      toast.success('Vistoria manual criada com sucesso!');
      navigate(`/vistorias/${vistoria.id}`);
    } catch (error) {
      console.error('Erro ao criar vistoria:', error);
      toast.error('Erro ao criar vistoria manual');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 p-6">
      <div className="max-w-4xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate('/vistorias')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        <form onSubmit={handleSubmit}>
          <Card className="shadow-xl border-primary/20">
            <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
              <CardTitle className="text-2xl">Nova Vistoria Manual</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Tipo de Vistoria */}
              <div>
                <Label className="text-base mb-4 block">Tipo de Vistoria</Label>
                <RadioGroup
                  value={tipoVistoria}
                  onValueChange={(value) => setTipoVistoria(value as 'sinistro' | 'reativacao')}
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2 p-4 rounded-lg border hover:border-primary transition-colors">
                      <RadioGroupItem value="sinistro" id="m-sinistro" />
                      <Label htmlFor="m-sinistro" className="flex-1 cursor-pointer">
                        Sinistro
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 p-4 rounded-lg border hover:border-primary transition-colors">
                      <RadioGroupItem value="reativacao" id="m-reativacao" />
                      <Label htmlFor="m-reativacao" className="flex-1 cursor-pointer">
                        Reativação
                      </Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              {/* Dados do Veículo */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Dados do Veículo</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Placa *</Label>
                    <Input
                      required
                      value={formData.veiculo_placa}
                      onChange={(e) => setFormData({...formData, veiculo_placa: e.target.value})}
                      placeholder="ABC-1234"
                    />
                  </div>
                  <div>
                    <Label>Marca *</Label>
                    <Input
                      required
                      value={formData.veiculo_marca}
                      onChange={(e) => setFormData({...formData, veiculo_marca: e.target.value})}
                      placeholder="Ex: Volkswagen"
                    />
                  </div>
                  <div>
                    <Label>Modelo *</Label>
                    <Input
                      required
                      value={formData.veiculo_modelo}
                      onChange={(e) => setFormData({...formData, veiculo_modelo: e.target.value})}
                      placeholder="Ex: Gol"
                    />
                  </div>
                  <div>
                    <Label>Ano *</Label>
                    <Input
                      required
                      value={formData.veiculo_ano}
                      onChange={(e) => setFormData({...formData, veiculo_ano: e.target.value})}
                      placeholder="2020"
                    />
                  </div>
                  <div>
                    <Label>Cor</Label>
                    <Input
                      value={formData.veiculo_cor}
                      onChange={(e) => setFormData({...formData, veiculo_cor: e.target.value})}
                      placeholder="Ex: Prata"
                    />
                  </div>
                  <div>
                    <Label>Chassi</Label>
                    <Input
                      value={formData.veiculo_chassi}
                      onChange={(e) => setFormData({...formData, veiculo_chassi: e.target.value})}
                      placeholder="9BWZZZ377VT004251"
                    />
                  </div>
                </div>
              </div>

              {/* Dados do Cliente */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Dados do Cliente</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Nome *</Label>
                    <Input
                      required
                      value={formData.cliente_nome}
                      onChange={(e) => setFormData({...formData, cliente_nome: e.target.value})}
                      placeholder="Nome completo"
                    />
                  </div>
                  <div>
                    <Label>CPF</Label>
                    <Input
                      value={formData.cliente_cpf}
                      onChange={(e) => setFormData({...formData, cliente_cpf: e.target.value})}
                      placeholder="000.000.000-00"
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={formData.cliente_email}
                      onChange={(e) => setFormData({...formData, cliente_email: e.target.value})}
                      placeholder="email@exemplo.com"
                    />
                  </div>
                  <div>
                    <Label>Telefone</Label>
                    <Input
                      value={formData.cliente_telefone}
                      onChange={(e) => setFormData({...formData, cliente_telefone: e.target.value})}
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                </div>
              </div>

              {/* Dados do Incidente */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Dados do Incidente</h3>
                <div className="space-y-4">
                  <div>
                    <Label>Data do Incidente</Label>
                    <Input
                      type="datetime-local"
                      value={formData.data_incidente}
                      onChange={(e) => setFormData({...formData, data_incidente: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Relato do Incidente *</Label>
                    <Textarea
                      required
                      value={formData.relato_incidente}
                      onChange={(e) => setFormData({...formData, relato_incidente: e.target.value})}
                      placeholder="Descreva o que aconteceu..."
                      rows={4}
                    />
                  </div>
                </div>
              </div>

              {/* Upload de Fotos */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Fotos do Veículo (4 obrigatórias)</h3>
                <div className="space-y-4">
                  {fotos.length < 4 && (
                    <div>
                      <Label htmlFor="fotos" className="cursor-pointer">
                        <div className="border-2 border-dashed border-primary/30 rounded-lg p-8 text-center hover:border-primary transition-colors">
                          <Upload className="h-12 w-12 mx-auto mb-2 text-primary" />
                          <p className="text-sm text-muted-foreground">
                            Clique para adicionar fotos ({fotos.length}/4)
                          </p>
                        </div>
                      </Label>
                      <Input
                        id="fotos"
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </div>
                  )}

                  {fotoPreviews.length > 0 && (
                    <div className="grid grid-cols-2 gap-4">
                      {fotoPreviews.map((preview, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={preview}
                            alt={`Foto ${index + 1}`}
                            className="w-full h-48 object-cover rounded-lg"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => removeFoto(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          <div className="absolute bottom-2 left-2 bg-black/60 text-white px-2 py-1 rounded text-xs">
                            {['Frontal', 'Traseira', 'Lateral Esq.', 'Lateral Dir.'][index]}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Botões */}
              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/vistorias')}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={loading || fotos.length < 4}
                  className="flex-1 bg-gradient-to-r from-primary to-primary/80"
                >
                  {loading ? (
                    'Salvando...'
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Criar Vistoria
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}
