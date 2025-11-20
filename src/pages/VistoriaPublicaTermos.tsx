import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CheckCircle2, FileText, MapPin, Calendar, Hash } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import SignaturePad from '@/components/SignaturePad';
import { Separator } from '@/components/ui/separator';

export default function VistoriaPublicaTermos() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [vistoria, setVistoria] = useState<any>(null);
  const [termos, setTermos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [termosAceitos, setTermosAceitos] = useState<{ [key: string]: boolean }>({});
  const [assinatura, setAssinatura] = useState<string>('');
  const [geolocation, setGeolocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    loadData();
    getGeolocation();
  }, [token]);

  const getGeolocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGeolocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (error) => {
          console.error('Erro ao obter localização:', error);
        }
      );
    }
  };

  const loadData = async () => {
    try {
      // Carregar vistoria
      const { data: vistoriaData, error: vistoriaError } = await supabase
        .from('vistorias')
        .select('*')
        .eq('link_token', token)
        .gt('link_expires_at', new Date().toISOString())
        .single();

      if (vistoriaError) throw vistoriaError;
      if (!vistoriaData) {
        toast.error('Link inválido');
        return;
      }

      setVistoria(vistoriaData);

      // Carregar termos ativos
      const { data: termosData, error: termosError } = await supabase
        .from('termos')
        .select('*')
        .eq('ativo', true)
        .order('ordem');

      if (termosError) throw termosError;
      setTermos(termosData || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const uploadDataUrl = async (dataUrl: string, path: string): Promise<string> => {
    const blob = await fetch(dataUrl).then(r => r.blob());
    const file = new File([blob], `${path}.png`, { type: 'image/png' });
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

  const handleSubmit = async () => {
    // Validar se todos os termos obrigatórios foram aceitos
    const termosObrigatorios = termos.filter(t => t.obrigatorio);
    const todosAceitos = termosObrigatorios.every(t => termosAceitos[t.id]);

    if (!todosAceitos) {
      toast.error('Aceite todos os termos obrigatórios');
      return;
    }

    if (!assinatura) {
      toast.error('Assinatura é obrigatória');
      return;
    }

    setSubmitting(true);
    try {
      // Upload da assinatura
      const assinaturaUrl = await uploadDataUrl(assinatura, 'assinatura');

      // Salvar aceite de cada termo
      const termosAceitosData = termos
        .filter(t => termosAceitos[t.id])
        .map(termo => ({
          vistoria_id: vistoria.id,
          termo_id: termo.id,
          ip_address: null, // Pode ser capturado via API externa se necessário
          user_agent: navigator.userAgent,
        }));

      const { error: termosError } = await supabase
        .from('termos_aceitos')
        .insert(termosAceitosData);

      if (termosError) throw termosError;

      // Atualizar vistoria com assinatura e status final
      const { error: updateError } = await supabase
        .from('vistorias')
        .update({
          assinatura_url: assinaturaUrl,
          status: 'em_analise',
          completed_at: new Date().toISOString(),
          latitude: geolocation?.latitude,
          longitude: geolocation?.longitude,
        })
        .eq('id', vistoria.id);

      if (updateError) throw updateError;

      // Chamar análise IA
      const { data: fotosList } = await supabase
        .from('vistoria_fotos')
        .select('*')
        .eq('vistoria_id', vistoria.id);

      if (fotosList && fotosList.length >= 4) {
        await supabase.functions.invoke('analisar-vistoria-ia', {
          body: {
            vistoria_id: vistoria.id,
            fotos: fotosList.map(f => ({
              id: f.id,
              posicao: f.posicao,
              url: f.arquivo_url
            }))
          }
        });
      }

      // Limpar dados temporários
      localStorage.removeItem('vistoria_temp');

      toast.success('Vistoria concluída com sucesso!');
      navigate(`/vistoria/${token}/conclusao`);
    } catch (error) {
      console.error('Erro ao finalizar:', error);
      toast.error('Erro ao finalizar vistoria');
    } finally {
      setSubmitting(false);
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

  const todosTermosAceitos = termos.filter(t => t.obrigatorio).every(t => termosAceitos[t.id]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-primary/10 p-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">Termos e Assinatura</h1>
          <p className="text-muted-foreground">Última etapa - Leia e aceite os termos</p>
        </div>

        {/* Protocolo Info */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-blue-600" />
                <div>
                  <p className="font-semibold text-blue-900">Protocolo</p>
                  <p className="text-blue-700">#{vistoria.numero}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-600" />
                <div>
                  <p className="font-semibold text-blue-900">Data</p>
                  <p className="text-blue-700">{new Date().toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
              {geolocation && (
                <div className="flex items-center gap-2 col-span-2">
                  <MapPin className="h-4 w-4 text-blue-600" />
                  <div>
                    <p className="font-semibold text-blue-900">Localização</p>
                    <p className="text-blue-700 text-xs">
                      {geolocation.latitude.toFixed(6)}, {geolocation.longitude.toFixed(6)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Termos */}
        {termos.map((termo) => (
          <Card key={termo.id}>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <FileText className="h-6 w-6 text-primary shrink-0 mt-1" />
                <div className="flex-1 space-y-3">
                  <div>
                    <h3 className="font-semibold text-lg">{termo.titulo}</h3>
                    {termo.descricao && (
                      <p className="text-sm text-muted-foreground mt-1">{termo.descricao}</p>
                    )}
                  </div>

                  {termo.arquivo_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(termo.arquivo_url, '_blank')}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Ler Termo Completo
                    </Button>
                  )}

                  <Separator />

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id={`termo-${termo.id}`}
                      checked={termosAceitos[termo.id] || false}
                      onCheckedChange={(checked) => 
                        setTermosAceitos(prev => ({ ...prev, [termo.id]: checked as boolean }))
                      }
                    />
                    <Label htmlFor={`termo-${termo.id}`} className="text-sm cursor-pointer">
                      Li e aceito este termo {termo.obrigatorio && <span className="text-red-600">*</span>}
                    </Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Assinatura */}
        {todosTermosAceitos && (
          <Card className="border-2 border-primary">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
                <div>
                  <h3 className="font-semibold text-lg">Assinatura Digital</h3>
                  <p className="text-sm text-muted-foreground">
                    Assine com o dedo ou mouse para confirmar
                  </p>
                </div>
              </div>
              
              <SignaturePad onSave={setAssinatura} initialSignature={assinatura} />
              
              {assinatura && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium text-green-900">Assinatura confirmada</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Botão Finalizar */}
        <div className="flex gap-3 pt-4">
          <Button
            variant="outline"
            onClick={() => navigate(`/vistoria/${token}/formulario`)}
            disabled={submitting}
            size="lg"
            className="flex-1"
          >
            Voltar
          </Button>
          
          <Button
            onClick={handleSubmit}
            disabled={submitting || !todosTermosAceitos || !assinatura}
            size="lg"
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/20 border-t-white mr-2" />
                Finalizando...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5 mr-2" />
                Finalizar Vistoria
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
