import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  CheckCircle2, FileText, MapPin, Calendar, Hash, 
  Shield, ExternalLink, ArrowLeft, Pen, AlertCircle
} from 'lucide-react';
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
        (error) => console.error('Erro ao obter localização:', error)
      );
    }
  };

  const loadData = async () => {
    try {
      const { data: vistoriaData, error: vistoriaError } = await supabase
        .from('vistorias')
        .select('*, corretoras(nome, logo_url)')
        .eq('link_token', token)
        .gt('link_expires_at', new Date().toISOString())
        .single();

      if (vistoriaError) throw vistoriaError;
      if (!vistoriaData) {
        toast.error('Link inválido');
        return;
      }

      setVistoria(vistoriaData);

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
    const termosObrigatorios = termos.filter(t => t.obrigatorio);
    const todosAceitos = termosObrigatorios.every(t => termosAceitos[t.id]);

    if (!todosAceitos) {
      toast.error('Por favor, aceite todos os termos obrigatórios para continuar', { duration: 4000 });
      return;
    }

    if (!assinatura) {
      toast.error('Por favor, adicione sua assinatura digital para finalizar', { duration: 4000 });
      return;
    }

    setSubmitting(true);
    try {
      const assinaturaUrl = await uploadDataUrl(assinatura, 'assinatura');

      const termosAceitosData = termos
        .filter(t => termosAceitos[t.id])
        .map(termo => ({
          vistoria_id: vistoria.id,
          termo_id: termo.id,
          ip_address: null,
          user_agent: navigator.userAgent,
        }));

      const { error: termosError } = await supabase
        .from('termos_aceitos')
        .insert(termosAceitosData);

      if (termosError) {
        console.error('Erro ao salvar termos aceitos:', termosError);
        throw new Error('Falha ao registrar aceitação dos termos: ' + termosError.message);
      }

      const { error: updateError } = await supabase
        .from('vistorias')
        .update({
          assinatura_url: assinaturaUrl,
          status: 'concluida',
          completed_at: new Date().toISOString(),
          latitude: geolocation?.latitude,
          longitude: geolocation?.longitude,
        })
        .eq('id', vistoria.id);

      if (updateError) {
        console.error('Erro ao finalizar vistoria:', updateError);
        throw new Error('Falha ao finalizar vistoria: ' + updateError.message);
      }

      // Verificar se foi salvo corretamente
      const { data: verificacao, error: errorVerif } = await supabase
        .from('vistorias')
        .select('id, status, completed_at')
        .eq('id', vistoria.id)
        .single();

      if (errorVerif || !verificacao || verificacao.status !== 'concluida') {
        throw new Error('Erro ao verificar finalização da vistoria');
      }

      console.log('Vistoria finalizada com sucesso:', verificacao);

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

      localStorage.removeItem('vistoria_temp');
      toast.success('Vistoria concluída com sucesso!');
      navigate(`/vistoria/${token}/conclusao`);
    } catch (error: any) {
      console.error('Erro ao finalizar vistoria:', error);
      const mensagemErro = error?.message || 'Erro desconhecido ao finalizar vistoria';
      toast.error(
        `Erro ao finalizar: ${mensagemErro}. Por favor, tente novamente ou entre em contato com o suporte.`,
        { duration: 6000 }
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--vistoria-bg))] to-white flex items-center justify-center p-6">
        <Card className="border-none shadow-xl">
          <CardContent className="p-12 text-center">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-[hsl(var(--vistoria-primary))]/20 border-t-[hsl(var(--vistoria-primary))]"></div>
            </div>
            <p className="text-lg font-semibold text-muted-foreground">Carregando termos...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const todosTermosAceitos = termos.filter(t => t.obrigatorio).every(t => termosAceitos[t.id]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--vistoria-bg))] to-white py-6 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <Card className="border-none shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              {vistoria.corretoras?.logo_url && (
                <img src={vistoria.corretoras.logo_url} alt="Logo" className="h-12 object-contain" />
              )}
              <div className="flex-1">
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">Termos e Assinatura</h1>
                <p className="text-sm text-muted-foreground">Última etapa da vistoria</p>
              </div>
              <Shield className="h-10 w-10 text-[hsl(var(--vistoria-primary))]" />
            </div>
          </CardContent>
        </Card>

        {/* Protocol Card */}
        <Card className="bg-gradient-to-br from-blue-50 to-white border-2 border-blue-200 shadow-lg">
          <CardContent className="p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Informações do Registro
            </h3>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-4 border border-blue-100">
                <div className="flex items-center gap-2 mb-2">
                  <Hash className="h-4 w-4 text-blue-600" />
                  <p className="text-xs font-semibold text-blue-800 uppercase">Protocolo</p>
                </div>
                <p className="text-2xl font-bold text-blue-900">#{vistoria.numero}</p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-blue-100">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <p className="text-xs font-semibold text-blue-800 uppercase">Data</p>
                </div>
                <p className="text-lg font-bold text-blue-900">
                  {new Date().toLocaleDateString('pt-BR')}
                </p>
              </div>
              {geolocation && (
                <div className="bg-white rounded-lg p-4 border border-blue-100">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-4 w-4 text-blue-600" />
                    <p className="text-xs font-semibold text-blue-800 uppercase">Localização</p>
                  </div>
                  <p className="text-xs font-mono text-blue-900">
                    {geolocation.latitude.toFixed(4)}, {geolocation.longitude.toFixed(4)}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Termos */}
        <div className="space-y-4">
          {termos.map((termo) => (
            <Card key={termo.id} className="border-2 hover:border-[hsl(var(--vistoria-primary))] transition-all">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="h-6 w-6 text-blue-600" />
                  </div>
                  
                  <div className="flex-1 space-y-4">
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="font-bold text-lg text-gray-900">{termo.titulo}</h3>
                        {termo.obrigatorio && (
                          <span className="bg-red-100 text-red-700 text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                            OBRIGATÓRIO
                          </span>
                        )}
                      </div>
                      {termo.descricao && (
                        <p className="text-muted-foreground">{termo.descricao}</p>
                      )}
                    </div>

                    {termo.arquivo_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(termo.arquivo_url, '_blank')}
                        className="gap-2"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Ler Documento Completo
                      </Button>
                    )}

                    <Separator />

                    <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg border-2 border-gray-200 hover:bg-blue-50 hover:border-blue-300 transition-all">
                      <Checkbox
                        id={`termo-${termo.id}`}
                        checked={termosAceitos[termo.id] || false}
                        onCheckedChange={(checked) => 
                          setTermosAceitos(prev => ({ ...prev, [termo.id]: checked as boolean }))
                        }
                        className="w-6 h-6"
                      />
                      <Label htmlFor={`termo-${termo.id}`} className="text-base font-semibold cursor-pointer flex-1">
                        Li e aceito este termo {termo.obrigatorio && <span className="text-red-600 ml-1">*</span>}
                      </Label>
                      {termosAceitos[termo.id] && (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Assinatura */}
        {todosTermosAceitos && (
          <Card className="border-2 border-[hsl(var(--vistoria-primary))] shadow-xl">
            <div className="bg-gradient-to-r from-[hsl(var(--vistoria-primary))] to-blue-600 p-6 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
                  <Pen className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-2xl">Assinatura Digital</h3>
                  <p className="text-blue-100">Assine abaixo para confirmar o aceite dos termos</p>
                </div>
              </div>
            </div>
            
            <CardContent className="p-8">
              <SignaturePad onSave={setAssinatura} initialSignature={assinatura} />
              
              {assinatura && (
                <div className="mt-6 bg-green-50 border-2 border-green-300 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                  <div className="flex-1">
                    <p className="font-bold text-green-900">Assinatura Confirmada</p>
                    <p className="text-sm text-green-700">Sua assinatura digital foi capturada com sucesso</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <Button
            variant="outline"
            onClick={() => navigate(`/vistoria/${token}/formulario`)}
            disabled={submitting}
            size="lg"
            className="w-full sm:flex-1 h-14 text-base sm:text-lg border-2"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Voltar
          </Button>
          
          <Button
            onClick={handleSubmit}
            disabled={submitting || !todosTermosAceitos || !assinatura}
            size="lg"
            className="w-full sm:flex-1 h-14 text-base sm:text-lg bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-bold shadow-xl"
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

        {/* Validation Messages */}
        {!todosTermosAceitos && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-800 font-medium">
              É necessário aceitar todos os termos obrigatórios para continuar
            </p>
          </div>
        )}
        
        {todosTermosAceitos && !assinatura && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-800 font-medium">
              É necessário adicionar sua assinatura digital para finalizar
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-4">
          <p className="text-sm text-gray-500">
            Ao finalizar, você receberá uma confirmação e poderá acompanhar o andamento
          </p>
        </div>
      </div>
    </div>
  );
}