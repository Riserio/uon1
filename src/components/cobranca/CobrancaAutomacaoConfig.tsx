import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings, Save, Loader2, Eye, EyeOff, RefreshCw, CheckCircle, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CobrancaAutomacaoConfigProps {
  corretoraId: string;
  corretoraNome?: string;
}

interface AutomacaoConfig {
  id?: string;
  corretora_id: string;
  hinova_url: string;
  hinova_user: string;
  hinova_pass: string;
  hinova_codigo_cliente: string;
  layout_relatorio: string;
  ativo: boolean;
  ultima_execucao?: string;
  ultimo_status?: string;
  ultimo_erro?: string;
}

const DEFAULT_CONFIG: Omit<AutomacaoConfig, 'corretora_id'> = {
  hinova_url: 'https://eris.hinova.com.br/sga/sgav4_valecar/v5/login.php',
  hinova_user: '',
  hinova_pass: '',
  hinova_codigo_cliente: '2363',
  layout_relatorio: 'BI - Vangard Cobrança',
  ativo: false,
};

export default function CobrancaAutomacaoConfig({ corretoraId, corretoraNome }: CobrancaAutomacaoConfigProps) {
  const [config, setConfig] = useState<AutomacaoConfig>({
    ...DEFAULT_CONFIG,
    corretora_id: corretoraId,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (corretoraId) {
      loadConfig();
    }
  }, [corretoraId]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cobranca_automacao_config")
        .select("*")
        .eq("corretora_id", corretoraId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setConfig(data);
      } else {
        setConfig({
          ...DEFAULT_CONFIG,
          corretora_id: corretoraId,
        });
      }
    } catch (error) {
      console.error("Erro ao carregar configuração:", error);
      toast.error("Erro ao carregar configuração de automação");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config.hinova_user || !config.hinova_pass) {
      toast.error("Usuário e senha são obrigatórios");
      return;
    }

    setSaving(true);
    try {
      const dataToSave = {
        corretora_id: corretoraId,
        hinova_url: config.hinova_url,
        hinova_user: config.hinova_user,
        hinova_pass: config.hinova_pass,
        hinova_codigo_cliente: config.hinova_codigo_cliente,
        layout_relatorio: config.layout_relatorio,
        ativo: config.ativo,
      };

      if (config.id) {
        // Atualizar
        const { error } = await supabase
          .from("cobranca_automacao_config")
          .update(dataToSave)
          .eq("id", config.id);

        if (error) throw error;
      } else {
        // Inserir
        const { data, error } = await supabase
          .from("cobranca_automacao_config")
          .insert(dataToSave)
          .select()
          .single();

        if (error) throw error;
        setConfig(prev => ({ ...prev, id: data.id }));
      }

      toast.success("Configuração salva com sucesso!");
    } catch (error: any) {
      console.error("Erro ao salvar configuração:", error);
      toast.error("Erro ao salvar: " + (error.message || "Erro desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              Configuração de Automação Hinova
            </CardTitle>
            <CardDescription className="mt-1">
              Configure a automação para: <span className="font-semibold text-foreground">{corretoraNome}</span>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="ativo-switch" className="text-sm">Automação Ativa</Label>
            <Switch
              id="ativo-switch"
              checked={config.ativo}
              onCheckedChange={(checked) => setConfig(prev => ({ ...prev, ativo: checked }))}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status da última execução */}
        {config.ultima_execucao && (
          <div className={`p-4 rounded-lg border ${
            config.ultimo_status === 'sucesso' 
              ? 'bg-green-500/10 border-green-500/30' 
              : config.ultimo_status === 'erro'
              ? 'bg-red-500/10 border-red-500/30'
              : 'bg-muted border-border'
          }`}>
            <div className="flex items-center gap-3">
              {config.ultimo_status === 'sucesso' ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : config.ultimo_status === 'erro' ? (
                <XCircle className="h-5 w-5 text-red-600" />
              ) : (
                <Clock className="h-5 w-5 text-muted-foreground" />
              )}
              <div className="flex-1">
                <p className="font-medium">
                  Última execução: {format(new Date(config.ultima_execucao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
                {config.ultimo_erro && (
                  <p className="text-sm text-red-600 mt-1">{config.ultimo_erro}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Configurações de acesso */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="hinova-url">URL do Portal Hinova</Label>
            <Input
              id="hinova-url"
              value={config.hinova_url}
              onChange={(e) => setConfig(prev => ({ ...prev, hinova_url: e.target.value }))}
              placeholder="https://eris.hinova.com.br/..."
            />
            <p className="text-xs text-muted-foreground">
              URL completa da página de login do portal Hinova
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hinova-codigo">Código do Cliente</Label>
            <Input
              id="hinova-codigo"
              value={config.hinova_codigo_cliente}
              onChange={(e) => setConfig(prev => ({ ...prev, hinova_codigo_cliente: e.target.value }))}
              placeholder="2363"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hinova-user">Usuário</Label>
            <Input
              id="hinova-user"
              value={config.hinova_user}
              onChange={(e) => setConfig(prev => ({ ...prev, hinova_user: e.target.value }))}
              placeholder="usuario@email.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hinova-pass">Senha</Label>
            <div className="relative">
              <Input
                id="hinova-pass"
                type={showPassword ? "text" : "password"}
                value={config.hinova_pass}
                onChange={(e) => setConfig(prev => ({ ...prev, hinova_pass: e.target.value }))}
                placeholder="••••••••"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="layout-relatorio">Layout do Relatório</Label>
            <Input
              id="layout-relatorio"
              value={config.layout_relatorio}
              onChange={(e) => setConfig(prev => ({ ...prev, layout_relatorio: e.target.value }))}
              placeholder="BI - Vangard Cobrança"
            />
            <p className="text-xs text-muted-foreground">
              Nome exato do layout a ser selecionado no relatório
            </p>
          </div>
        </div>

        {/* Info sobre automação */}
        <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <h4 className="font-medium text-blue-700 mb-2 flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Informações da Automação
          </h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• A automação executa diariamente às 09:00 (horário de Brasília)</li>
            <li>• Extrai boletos com vencimento no mês atual</li>
            <li>• Filtra apenas boletos com situação "ABERTO"</li>
            <li>• Os dados são atualizados automaticamente no dashboard</li>
          </ul>
        </div>

        {/* Botões */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={loadConfig} disabled={saving}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Recarregar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Salvar Configuração
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
