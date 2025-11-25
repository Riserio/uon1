import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, FileText, ExternalLink, Calendar, Hash, PartyPopper } from "lucide-react";

export default function VistoriaPublicaConclusao() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [vistoria, setVistoria] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVistoria();
  }, [token]);

  const loadVistoria = async () => {
    try {
      const { data, error } = await supabase
        .from("vistorias")
        .select(`
          id,
          numero,
          status,
          completed_at,
          corretora_id,
          link_token,
          corretoras(nome, logo_url, slug)
        `)
        .eq("link_token", token)
        .single();

      if (error) throw error;
      if (!data) {
        toast.error("Vistoria não encontrada");
        return;
      }

      setVistoria(data);
    } catch (error) {
      console.error("Erro ao carregar vistoria:", error);
      toast.error("Erro ao carregar informações da vistoria");
    } finally {
      setLoading(false);
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
            <p className="text-lg font-semibold text-muted-foreground">Carregando...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!vistoria) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--vistoria-bg))] to-white flex items-center justify-center p-6">
        <Card className="border-none shadow-xl">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-gray-700">Vistoria não encontrada.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Monta link de acompanhamento externo usando o slug da corretora
  const corretoraSlug = vistoria.corretoras?.slug;
  const acompanhamentoUrl = corretoraSlug 
    ? `${window.location.origin}/acompanhamento/${corretoraSlug}/${vistoria.numero}`
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--vistoria-bg))] to-white py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header com logo */}
        {vistoria.corretoras?.logo_url && (
          <div className="flex justify-center mb-8">
            <img 
              src={vistoria.corretoras.logo_url} 
              alt="Logo" 
              className="h-16 object-contain"
            />
          </div>
        )}

        {/* Card de Sucesso Principal */}
        <Card className="border-none shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-8 text-white text-center">
            <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-12 w-12" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">Vistoria Concluída!</h1>
            <p className="text-green-50 text-lg">
              Sua vistoria foi enviada com sucesso e está sendo processada.
            </p>
          </div>

          <CardContent className="p-8 space-y-6">
            {/* Informações do protocolo */}
            <div className="bg-gradient-to-br from-blue-50 to-white border-2 border-blue-200 rounded-xl p-6">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-gray-900">
                <FileText className="h-5 w-5 text-blue-600" />
                Informações do Protocolo
              </h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-white rounded-lg p-4 border border-blue-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Hash className="h-4 w-4 text-blue-600" />
                    <p className="text-xs font-semibold text-blue-800 uppercase">Número da Vistoria</p>
                  </div>
                  <p className="text-2xl font-bold text-blue-900">#{vistoria.numero}</p>
                </div>
                <div className="bg-white rounded-lg p-4 border border-blue-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    <p className="text-xs font-semibold text-blue-800 uppercase">Data de Conclusão</p>
                  </div>
                  <p className="text-lg font-bold text-blue-900">
                    {vistoria.completed_at 
                      ? new Date(vistoria.completed_at).toLocaleDateString("pt-BR")
                      : new Date().toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>
            </div>

            {/* Mensagem informativa */}
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <PartyPopper className="h-6 w-6 text-yellow-600 flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-yellow-900 mb-2">O que acontece agora?</h4>
                  <p className="text-sm text-yellow-800">
                    Nossa equipe irá analisar as informações e fotos enviadas. Você receberá atualizações
                    sobre o andamento do seu sinistro através dos canais de contato informados.
                  </p>
                </div>
              </div>
            </div>

            {/* Link de acompanhamento */}
            {acompanhamentoUrl && (
              <Card className="border-2 border-[hsl(var(--vistoria-primary))] bg-gradient-to-br from-blue-50 to-white">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-[hsl(var(--vistoria-primary))]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <ExternalLink className="h-6 w-6 text-[hsl(var(--vistoria-primary))]" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-lg text-gray-900 mb-2">
                        Acompanhe seu Sinistro
                      </h4>
                      <p className="text-sm text-gray-600 mb-4">
                        Caso queira acompanhar o andamento do seu processo de sinistro, clique no botão abaixo
                        para acessar o portal de acompanhamento.
                      </p>
                      <Button 
                        onClick={() => window.open(acompanhamentoUrl, '_blank')}
                        className="w-full sm:w-auto gap-2"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Acessar Portal de Acompanhamento
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Informação adicional */}
            <div className="text-center pt-4">
              <p className="text-sm text-muted-foreground">
                Guarde o número do protocolo <span className="font-bold text-gray-900">#{vistoria.numero}</span> para futuras consultas.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Botão voltar ao início (opcional) */}
        <div className="text-center">
          <Button
            variant="outline"
            onClick={() => navigate(`/vistoria/${token}`)}
            className="gap-2"
          >
            Voltar ao início
          </Button>
        </div>
      </div>
    </div>
  );
}
