import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowRight, ArrowLeft, Upload, CheckCircle2, FileText } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import SignaturePad from '@/components/SignaturePad';
import SketchPad from '@/components/SketchPad';

export default function VistoriaPublicaFormulario() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [vistoria, setVistoria] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  
  // Dados temporários das fotos
  const [tempData, setTempData] = useState<any>(null);

  // Form data
  const [formData, setFormData] = useState({
    cliente_nome: '',
    cliente_cpf: '',
    cliente_email: '',
    cliente_telefone: '',
    data_evento: '',
    hora_evento: '',
    condutor_veiculo: '',
    veiculo_placa: '',
    veiculo_modelo: '',
    narrar_fatos: '',
    vitima_ou_causador: '',
    tem_terceiros: false,
    placa_terceiro: '',
    local_tem_camera: false,
    fez_bo: false,
    foi_hospital: false,
    motorista_faleceu: false,
    policia_foi_local: false,
  });

  // Files
  const [boFile, setBoFile] = useState<File | null>(null);
  const [laudoMedico, setLaudoMedico] = useState<File | null>(null);
  const [atestadoObito, setAtestadoObito] = useState<File | null>(null);
  const [laudoAlcoolemia, setLaudoAlcoolemia] = useState<File | null>(null);
  const [assinatura, setAssinatura] = useState<string>('');
  const [croqui, setCroqui] = useState<string>('');

  useEffect(() => {
    loadVistoria();
    loadTempData();
  }, [token]);

  const loadTempData = () => {
    const temp = localStorage.getItem('vistoria_temp');
    if (temp) {
      const data = JSON.parse(temp);
      setTempData(data);
      
      // Pré-preencher dados do OCR
      if (data.cnhData) {
        setFormData(prev => ({
          ...prev,
          cliente_nome: data.cnhData.nome || '',
          cliente_cpf: data.cnhData.cpf || '',
        }));
      }
      
      if (data.vehicleData) {
        setFormData(prev => ({
          ...prev,
          veiculo_placa: data.vehicleData.placa || '',
          veiculo_modelo: data.vehicleData.modelo || '',
        }));
      }
    }
  };

  const loadVistoria = async () => {
    try {
      const { data, error } = await supabase
        .from('vistorias')
        .select('*')
        .eq('link_token', token)
        .gt('link_expires_at', new Date().toISOString())
        .single();

      if (error) throw error;
      if (!data) {
        toast.error('Link inválido');
        return;
      }

      setVistoria(data);
    } catch (error) {
      console.error('Erro ao carregar vistoria:', error);
      toast.error('Erro ao carregar vistoria');
    } finally {
      setLoading(false);
    }
  };

  const uploadFile = async (file: File, path: string): Promise<string> => {
    const fileName = `${vistoria.id}/${path}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('vistorias')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('vistorias')
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const uploadDataUrl = async (dataUrl: string, path: string): Promise<string> => {
    const blob = await fetch(dataUrl).then(r => r.blob());
    const file = new File([blob], `${path}.png`, { type: 'image/png' });
    return uploadFile(file, path);
  };

  const handleSubmit = async () => {
    // Validações
    if (!formData.cliente_nome || !formData.cliente_cpf) {
      toast.error('Preencha nome e CPF');
      setCurrentStep(0);
      return;
    }

    setUploading(true);
    try {
      // Upload documentos condicionais
      let boUrl = null;
      if (formData.fez_bo && boFile) {
        boUrl = await uploadFile(boFile, 'bo');
      }

      let laudoMedicoUrl = null;
      if (formData.foi_hospital && laudoMedico) {
        laudoMedicoUrl = await uploadFile(laudoMedico, 'laudo_medico');
      }

      let atestadoObitoUrl = null;
      if (formData.motorista_faleceu && atestadoObito) {
        atestadoObitoUrl = await uploadFile(atestadoObito, 'atestado_obito');
      }

      let laudoAlcoolemiaUrl = null;
      const horaEvento = formData.hora_evento ? parseInt(formData.hora_evento.split(':')[0]) : 0;
      if ((horaEvento >= 20 || horaEvento < 6) && laudoAlcoolemia) {
        laudoAlcoolemiaUrl = await uploadFile(laudoAlcoolemia, 'alcoolemia');
      }

      // Upload fotos do veículo
      if (tempData?.fotos) {
        for (const [posicao, files] of Object.entries(tempData.fotos) as [string, File[]][]) {
          if (posicao === 'cnh' || posicao === 'crlv') continue;
          
          for (const file of files) {
            const url = await uploadFile(file, 'veiculo');
            
            await supabase
              .from('vistoria_fotos')
              .insert({
                vistoria_id: vistoria.id,
                posicao,
                arquivo_url: url,
                arquivo_nome: file.name,
                arquivo_tamanho: file.size,
                ordem: ['frontal', 'traseira', 'lateral_esquerda', 'lateral_direita'].indexOf(posicao) + 1
              });
          }
        }
      }

      // Upload CNH
      let cnhUrl = '';
      if (tempData?.fotos?.cnh?.[0]) {
        cnhUrl = await uploadFile(tempData.fotos.cnh[0], 'cnh');
      }

      // Upload CRLV
      const crlvUrls: string[] = [];
      if (tempData?.fotos?.crlv) {
        for (const file of tempData.fotos.crlv) {
          const url = await uploadFile(file, 'crlv');
          crlvUrls.push(url);
        }
      }

      // Upload croqui
      const croquiUrl = croqui ? await uploadDataUrl(croqui, 'croqui') : null;

      // Atualizar vistoria (sem assinatura ainda)
      const { error: updateError } = await supabase
        .from('vistorias')
        .update({
          ...formData,
          latitude: tempData?.geolocation?.latitude,
          longitude: tempData?.geolocation?.longitude,
          cnh_url: cnhUrl,
          cnh_dados: tempData?.cnhData,
          crlv_fotos_urls: crlvUrls,
          bo_url: boUrl,
          laudo_medico_url: laudoMedicoUrl,
          atestado_obito_url: atestadoObitoUrl,
          laudo_alcoolemia_url: laudoAlcoolemiaUrl,
          croqui_acidente_url: croquiUrl,
        })
        .eq('id', vistoria.id);

      if (updateError) throw updateError;

      toast.success('Dados salvos! Agora aceite os termos.');
      navigate(`/vistoria/${token}/termos`);
    } catch (error) {
      console.error('Erro ao enviar vistoria:', error);
      toast.error('Erro ao enviar vistoria');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary/20 border-t-primary mx-auto mb-4"></div>
            <p className="text-lg font-medium">Carregando...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalSteps = 5;
  const stepProgress = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-primary/10 p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">Dados da Vistoria</h1>
          <p className="text-muted-foreground">Preencha as informações com atenção</p>
        </div>

        {/* Progress */}
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-sm font-medium">
              <span>Progresso</span>
              <span>Passo {currentStep + 1} de {totalSteps}</span>
            </div>
            <Progress value={stepProgress} className="h-3" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-6">
            {/* Step 0: Dados Pessoais */}
            {currentStep === 0 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Dados Pessoais</h2>
                <div>
                  <Label>Nome Completo *</Label>
                  <Input
                    value={formData.cliente_nome}
                    onChange={(e) => setFormData({ ...formData, cliente_nome: e.target.value })}
                    placeholder="Seu nome completo"
                  />
                </div>
                <div>
                  <Label>CPF *</Label>
                  <Input
                    value={formData.cliente_cpf}
                    onChange={(e) => setFormData({ ...formData, cliente_cpf: e.target.value })}
                    placeholder="000.000.000-00"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.cliente_email}
                    onChange={(e) => setFormData({ ...formData, cliente_email: e.target.value })}
                    placeholder="seu@email.com"
                  />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input
                    value={formData.cliente_telefone}
                    onChange={(e) => setFormData({ ...formData, cliente_telefone: e.target.value })}
                    placeholder="(11) 99999-9999"
                  />
                </div>
              </div>
            )}

            {/* Step 1: Dados do Evento */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Dados do Evento</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Data do Evento *</Label>
                    <Input
                      type="date"
                      value={formData.data_evento}
                      onChange={(e) => setFormData({ ...formData, data_evento: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Hora do Evento *</Label>
                    <Input
                      type="time"
                      value={formData.hora_evento}
                      onChange={(e) => setFormData({ ...formData, hora_evento: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Condutor do Veículo</Label>
                  <Input
                    value={formData.condutor_veiculo}
                    onChange={(e) => setFormData({ ...formData, condutor_veiculo: e.target.value })}
                    placeholder="Nome do condutor"
                  />
                </div>
                <div>
                  <Label>Placa do Veículo</Label>
                  <Input
                    value={formData.veiculo_placa}
                    onChange={(e) => setFormData({ ...formData, veiculo_placa: e.target.value })}
                    placeholder="ABC-1234"
                  />
                </div>
                <div>
                  <Label>Modelo do Veículo</Label>
                  <Input
                    value={formData.veiculo_modelo}
                    onChange={(e) => setFormData({ ...formData, veiculo_modelo: e.target.value })}
                    placeholder="Marca e modelo"
                  />
                </div>
                <div>
                  <Label>Narrar os Fatos</Label>
                  <Textarea
                    value={formData.narrar_fatos}
                    onChange={(e) => setFormData({ ...formData, narrar_fatos: e.target.value })}
                    placeholder="Descreva o que aconteceu"
                    rows={5}
                  />
                </div>
                <div>
                  <Label>Vítima ou Causador?</Label>
                  <RadioGroup
                    value={formData.vitima_ou_causador}
                    onValueChange={(value) => setFormData({ ...formData, vitima_ou_causador: value })}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="vitima" id="vitima" />
                      <Label htmlFor="vitima">Vítima</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="causador" id="causador" />
                      <Label htmlFor="causador">Causador</Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            )}

            {/* Step 2: Informações Adicionais */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Informações Adicionais</h2>
                
                <div>
                  <Label>Houve terceiros envolvidos?</Label>
                  <RadioGroup
                    value={formData.tem_terceiros ? "sim" : "nao"}
                    onValueChange={(value) => setFormData({ ...formData, tem_terceiros: value === "sim" })}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="sim" id="terceiros-sim" />
                      <Label htmlFor="terceiros-sim">Sim</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="nao" id="terceiros-nao" />
                      <Label htmlFor="terceiros-nao">Não</Label>
                    </div>
                  </RadioGroup>
                </div>

                {formData.tem_terceiros && (
                  <div>
                    <Label>Placa do Terceiro</Label>
                    <Input
                      value={formData.placa_terceiro}
                      onChange={(e) => setFormData({ ...formData, placa_terceiro: e.target.value })}
                      placeholder="ABC-1234"
                    />
                  </div>
                )}

                <div>
                  <Label>O local possui câmeras?</Label>
                  <RadioGroup
                    value={formData.local_tem_camera ? "sim" : "nao"}
                    onValueChange={(value) => setFormData({ ...formData, local_tem_camera: value === "sim" })}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="sim" id="camera-sim" />
                      <Label htmlFor="camera-sim">Sim</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="nao" id="camera-nao" />
                      <Label htmlFor="camera-nao">Não</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div>
                  <Label>A polícia foi ao local?</Label>
                  <RadioGroup
                    value={formData.policia_foi_local ? "sim" : "nao"}
                    onValueChange={(value) => setFormData({ ...formData, policia_foi_local: value === "sim" })}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="sim" id="policia-sim" />
                      <Label htmlFor="policia-sim">Sim</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="nao" id="policia-nao" />
                      <Label htmlFor="policia-nao">Não</Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            )}

            {/* Step 3: Documentos */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold">Documentos</h2>
                
                <div className="space-y-4">
                  <div>
                    <Label>Fez Boletim de Ocorrência?</Label>
                    <RadioGroup
                      value={formData.fez_bo ? "sim" : "nao"}
                      onValueChange={(value) => setFormData({ ...formData, fez_bo: value === "sim" })}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="sim" id="bo-sim" />
                        <Label htmlFor="bo-sim">Sim</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="nao" id="bo-nao" />
                        <Label htmlFor="bo-nao">Não</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {formData.fez_bo && (
                    <div>
                      <Label>Anexar BO</Label>
                      <Input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => setBoFile(e.target.files?.[0] || null)}
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>Foi ao hospital?</Label>
                    <RadioGroup
                      value={formData.foi_hospital ? "sim" : "nao"}
                      onValueChange={(value) => setFormData({ ...formData, foi_hospital: value === "sim" })}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="sim" id="hospital-sim" />
                        <Label htmlFor="hospital-sim">Sim</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="nao" id="hospital-nao" />
                        <Label htmlFor="hospital-nao">Não</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {formData.foi_hospital && (
                    <div>
                      <Label>Anexar Laudo Médico</Label>
                      <Input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => setLaudoMedico(e.target.files?.[0] || null)}
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>O motorista faleceu?</Label>
                    <RadioGroup
                      value={formData.motorista_faleceu ? "sim" : "nao"}
                      onValueChange={(value) => setFormData({ ...formData, motorista_faleceu: value === "sim" })}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="sim" id="obito-sim" />
                        <Label htmlFor="obito-sim">Sim</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="nao" id="obito-nao" />
                        <Label htmlFor="obito-nao">Não</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {formData.motorista_faleceu && (
                    <div>
                      <Label>Anexar Atestado de Óbito</Label>
                      <Input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => setAtestadoObito(e.target.files?.[0] || null)}
                      />
                    </div>
                  )}
                </div>

                {formData.hora_evento && (
                  parseInt(formData.hora_evento.split(':')[0]) >= 20 || parseInt(formData.hora_evento.split(':')[0]) < 6
                ) && (
                  <div>
                    <Label>Laudo de Alcoolemia (acidente entre 20h e 6h)</Label>
                    <Input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => setLaudoAlcoolemia(e.target.files?.[0] || null)}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Croqui */}
            {currentStep === 4 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Croqui do Acidente</h2>
                <p className="text-sm text-muted-foreground">
                  Desenhe um croqui simples mostrando como ocorreu o acidente (opcional)
                </p>
                <SketchPad onSave={setCroqui} initialSketch={croqui} />
              </div>
            )}


            {/* Navegação */}
            <div className="flex gap-3 pt-6 border-t">
              <Button
                variant="outline"
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0 || uploading}
                size="lg"
                className="flex-1"
              >
                <ArrowLeft className="h-5 w-5 mr-2" />
                Anterior
              </Button>
              
              {currentStep < totalSteps - 1 ? (
                <Button
                  onClick={() => setCurrentStep(currentStep + 1)}
                  disabled={uploading}
                  size="lg"
                  className="flex-1"
                >
                  Próximo
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={uploading}
                  size="lg"
                  className="flex-1"
                >
                  {uploading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/20 border-t-white mr-2" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      Próximo - Termos
                      <ArrowRight className="h-5 w-5 ml-2" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
