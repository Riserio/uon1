import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Edit2, CheckCircle, XCircle, Server, Eye, EyeOff, RefreshCw, Wifi, WifiOff, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface ApiIntegration {
  id: string;
  corretora_id: string;
  tipo: string;
  nome: string;
  ambiente: string;
  base_url: string;
  auth_token: string;
  ativo: boolean;
  created_at: string;
  corretoras?: { nome: string };
}

interface Corretora {
  id: string;
  nome: string;
}

const API_TYPES = {
  cilia: {
    label: "CILIA",
    description: "Sistema de orçamentos e gestão de sinistros",
    defaultUrl: "https://sistema.cilia.com.br",
    qaUrl: "https://qa.cilia.com.br",
  },
  sga_hinova: {
    label: "SGA Hinova",
    description: "Sistema de Gestão de Associados",
    defaultUrl: "https://api.hinova.com.br/api/sga/v2",
    qaUrl: "https://api-qa.hinova.com.br/api/sga/v2",
  },
};

export function ApiIntegrationsConfig() {
  const { user } = useAuth();
  const [integrations, setIntegrations] = useState<ApiIntegration[]>([]);
  const [corretoras, setCorretoras] = useState<Corretora[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<ApiIntegration | null>(null);
  const [showToken, setShowToken] = useState<Record<string, boolean>>({});
  const [selectedApiType, setSelectedApiType] = useState<"cilia" | "sga_hinova">("cilia");
  const [testingConnection, setTestingConnection] = useState<Record<string, boolean>>({});
  const [connectionStatus, setConnectionStatus] = useState<Record<string, { success: boolean; message: string } | null>>({});
  const [formData, setFormData] = useState({
    corretora_id: "",
    tipo: "cilia",
    nome: "",
    ambiente: "producao",
    base_url: API_TYPES.cilia.defaultUrl,
    auth_token: "",
    ativo: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [integrationsRes, corretorasRes] = await Promise.all([
        supabase
          .from("api_integrations")
          .select("*, corretoras(nome)")
          .order("created_at", { ascending: false }),
        supabase.from("corretoras").select("id, nome").order("nome"),
      ]);

      if (integrationsRes.error) throw integrationsRes.error;
      if (corretorasRes.error) throw corretorasRes.error;

      setIntegrations(integrationsRes.data || []);
      setCorretoras(corretorasRes.data || []);
    } catch (error) {
      console.error("Erro ao carregar integrações:", error);
      toast.error("Erro ao carregar integrações");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (integration?: ApiIntegration, tipo?: string) => {
    const apiType = integration?.tipo || tipo || "cilia";
    const apiConfig = API_TYPES[apiType as keyof typeof API_TYPES] || API_TYPES.cilia;
    
    if (integration) {
      setEditingIntegration(integration);
      setFormData({
        corretora_id: integration.corretora_id,
        tipo: integration.tipo,
        nome: integration.nome,
        ambiente: integration.ambiente,
        base_url: integration.base_url,
        auth_token: integration.auth_token,
        ativo: integration.ativo,
      });
    } else {
      setEditingIntegration(null);
      setFormData({
        corretora_id: "",
        tipo: apiType,
        nome: "",
        ambiente: "producao",
        base_url: apiConfig.defaultUrl,
        auth_token: "",
        ativo: true,
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.corretora_id || !formData.auth_token) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    const apiConfig = API_TYPES[formData.tipo as keyof typeof API_TYPES];
    const defaultName = `${apiConfig?.label || formData.tipo.toUpperCase()} - ${corretoras.find(c => c.id === formData.corretora_id)?.nome}`;

    try {
      if (editingIntegration) {
        const { error } = await supabase
          .from("api_integrations")
          .update({
            corretora_id: formData.corretora_id,
            tipo: formData.tipo,
            nome: formData.nome || defaultName,
            ambiente: formData.ambiente,
            base_url: formData.base_url,
            auth_token: formData.auth_token,
            ativo: formData.ativo,
          })
          .eq("id", editingIntegration.id);

        if (error) throw error;
        toast.success("Integração atualizada com sucesso");
      } else {
        const { error } = await supabase.from("api_integrations").insert({
          corretora_id: formData.corretora_id,
          tipo: formData.tipo,
          nome: formData.nome || defaultName,
          ambiente: formData.ambiente,
          base_url: formData.base_url,
          auth_token: formData.auth_token,
          ativo: formData.ativo,
          created_by: user?.id,
        });

        if (error) throw error;
        toast.success("Integração criada com sucesso");
      }

      setDialogOpen(false);
      loadData();
    } catch (error: any) {
      console.error("Erro ao salvar integração:", error);
      if (error.code === "23505") {
        toast.error("Já existe uma integração deste tipo para esta corretora");
      } else {
        toast.error("Erro ao salvar integração");
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta integração?")) return;

    try {
      const { error } = await supabase.from("api_integrations").delete().eq("id", id);
      if (error) throw error;
      toast.success("Integração excluída");
      loadData();
    } catch (error) {
      console.error("Erro ao excluir:", error);
      toast.error("Erro ao excluir integração");
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("api_integrations")
        .update({ ativo: !currentStatus })
        .eq("id", id);

      if (error) throw error;
      toast.success(`Integração ${!currentStatus ? "ativada" : "desativada"}`);
      loadData();
    } catch (error) {
      console.error("Erro ao alterar status:", error);
      toast.error("Erro ao alterar status");
    }
  };

  const handleTestConnection = async (integration: ApiIntegration) => {
    setTestingConnection(prev => ({ ...prev, [integration.id]: true }));
    setConnectionStatus(prev => ({ ...prev, [integration.id]: null }));

    try {
      if (integration.tipo === "cilia") {
        // Testar conexão CILIA via Edge Function (evita CORS)
        const { data, error } = await supabase.functions.invoke("testar-cilia", {
          body: {
            base_url: integration.base_url,
            auth_token: integration.auth_token,
          },
        });

        if (error) {
          console.error("Erro ao testar CILIA:", error);
          setConnectionStatus(prev => ({ 
            ...prev, 
            [integration.id]: { 
              success: false, 
              message: `Erro: ${error.message}` 
            } 
          }));
          toast.error("Erro ao testar conexão CILIA");
          return;
        }

        console.log("Teste CILIA resultado:", data);

        if (data?.success) {
          setConnectionStatus(prev => ({ 
            ...prev, 
            [integration.id]: { 
              success: true, 
              message: data.message || "Conexão estabelecida com sucesso!" 
            } 
          }));
          toast.success("Conexão CILIA OK!");
        } else {
          setConnectionStatus(prev => ({ 
            ...prev, 
            [integration.id]: { 
              success: false, 
              message: data?.message || "Erro ao testar conexão" 
            } 
          }));
          toast.error(data?.message || "Erro na conexão CILIA");
        }
      } else if (integration.tipo === "sga_hinova") {
        // Testar conexão SGA Hinova via Edge Function
        const { data, error } = await supabase.functions.invoke("testar-sga-hinova", {
          body: {
            base_url: integration.base_url,
            auth_token: integration.auth_token,
          },
        });

        if (error) {
          console.error("Erro ao testar SGA Hinova:", error);
          setConnectionStatus(prev => ({ 
            ...prev, 
            [integration.id]: { 
              success: false, 
              message: `Erro: ${error.message}` 
            } 
          }));
          toast.error("Erro ao testar conexão SGA Hinova");
          return;
        }

        console.log("Teste SGA Hinova resultado:", data);

        if (data?.success) {
          setConnectionStatus(prev => ({ 
            ...prev, 
            [integration.id]: { 
              success: true, 
              message: data.message || "Conexão estabelecida com sucesso!" 
            } 
          }));
          toast.success("Conexão SGA Hinova OK!");
        } else {
          setConnectionStatus(prev => ({ 
            ...prev, 
            [integration.id]: { 
              success: false, 
              message: data?.message || "Erro ao testar conexão" 
            } 
          }));
          toast.error(data?.message || "Erro na conexão SGA Hinova");
        }
      }
    } catch (error: any) {
      console.error("Erro ao testar conexão:", error);
      setConnectionStatus(prev => ({ 
        ...prev, 
        [integration.id]: { 
          success: false, 
          message: `Erro: ${error.message || "Verifique a URL e conectividade"}` 
        } 
      }));
      toast.error("Erro ao testar conexão");
    } finally {
      setTestingConnection(prev => ({ ...prev, [integration.id]: false }));
    }
  };

  const handleAmbienteChange = (ambiente: string) => {
    const apiConfig = API_TYPES[formData.tipo as keyof typeof API_TYPES];
    const baseUrl = ambiente === "homologacao" ? apiConfig?.qaUrl : apiConfig?.defaultUrl;
    setFormData({ ...formData, ambiente, base_url: baseUrl || formData.base_url });
  };

  const handleTipoChange = (tipo: string) => {
    const apiConfig = API_TYPES[tipo as keyof typeof API_TYPES];
    const baseUrl = formData.ambiente === "homologacao" ? apiConfig?.qaUrl : apiConfig?.defaultUrl;
    setFormData({ ...formData, tipo, base_url: baseUrl || "" });
  };

  const filteredIntegrations = (tipo: string) => integrations.filter(i => i.tipo === tipo);

  const renderIntegrationList = (tipo: string) => {
    const filtered = filteredIntegrations(tipo);
    const apiConfig = API_TYPES[tipo as keyof typeof API_TYPES];

    return (
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {tipo === "cilia" ? <Server className="h-5 w-5" /> : <RefreshCw className="h-5 w-5" />}
                Integrações {apiConfig?.label}
              </CardTitle>
              <CardDescription>{apiConfig?.description}</CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog(undefined, tipo)} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Integração
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma integração {apiConfig?.label} configurada.
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map((integration) => (
                <div
                  key={integration.id}
                  className="flex flex-col gap-3 p-4 border rounded-lg bg-card"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        {integration.ativo ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{integration.nome}</p>
                          <Badge variant={integration.ambiente === "producao" ? "default" : "secondary"}>
                            {integration.ambiente === "producao" ? "Produção" : "Homologação"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {integration.corretoras?.nome}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="text-xs bg-muted px-2 py-0.5 rounded">
                            {showToken[integration.id] 
                              ? integration.auth_token 
                              : `${integration.auth_token.slice(0, 10)}...`}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setShowToken(prev => ({ 
                              ...prev, 
                              [integration.id]: !prev[integration.id] 
                            }))}
                          >
                            {showToken[integration.id] ? (
                              <EyeOff className="h-3 w-3" />
                            ) : (
                              <Eye className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestConnection(integration)}
                        disabled={testingConnection[integration.id]}
                        className="gap-1"
                      >
                        {testingConnection[integration.id] ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Wifi className="h-3 w-3" />
                        )}
                        Testar
                      </Button>
                      <Switch
                        checked={integration.ativo}
                        onCheckedChange={() => handleToggleStatus(integration.id, integration.ativo)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDialog(integration)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(integration.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  {connectionStatus[integration.id] && (
                    <div className={`text-xs px-3 py-2 rounded ${
                      connectionStatus[integration.id]?.success 
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    }`}>
                      {connectionStatus[integration.id]?.success ? (
                        <span className="flex items-center gap-1">
                          <Wifi className="h-3 w-3" />
                          {connectionStatus[integration.id]?.message}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <WifiOff className="h-3 w-3" />
                          {connectionStatus[integration.id]?.message}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="cilia" onValueChange={(v) => setSelectedApiType(v as any)}>
        <TabsList className="mb-4">
          <TabsTrigger value="cilia">CILIA</TabsTrigger>
          <TabsTrigger value="sga_hinova">SGA Hinova</TabsTrigger>
        </TabsList>

        <TabsContent value="cilia">
          {renderIntegrationList("cilia")}
        </TabsContent>

        <TabsContent value="sga_hinova">
          {renderIntegrationList("sga_hinova")}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingIntegration 
                ? `Editar Integração ${API_TYPES[formData.tipo as keyof typeof API_TYPES]?.label}` 
                : `Nova Integração ${API_TYPES[formData.tipo as keyof typeof API_TYPES]?.label}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Tipo de API</Label>
              <Select
                value={formData.tipo}
                onValueChange={handleTipoChange}
                disabled={!!editingIntegration}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cilia">CILIA</SelectItem>
                  <SelectItem value="sga_hinova">SGA Hinova</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Corretora *</Label>
              <Select
                value={formData.corretora_id}
                onValueChange={(value) => setFormData({ ...formData, corretora_id: value })}
              >
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
              <Label>Ambiente</Label>
              <Select
                value={formData.ambiente}
                onValueChange={handleAmbienteChange}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="producao">Produção</SelectItem>
                  <SelectItem value="homologacao">Homologação (QA)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>URL Base</Label>
              <Input
                value={formData.base_url}
                onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                placeholder={API_TYPES[formData.tipo as keyof typeof API_TYPES]?.defaultUrl}
              />
            </div>

            <div className="space-y-2">
              <Label>Token de Autenticação *</Label>
              <Input
                type="password"
                value={formData.auth_token}
                onChange={(e) => setFormData({ ...formData, auth_token: e.target.value })}
                placeholder="SEU_AUTH_TOKEN"
              />
              <p className="text-xs text-muted-foreground">
                Token fornecido pelo sistema para autenticação na API
              </p>
            </div>

            <div className="space-y-2">
              <Label>Nome da Integração (opcional)</Label>
              <Input
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder={`Ex: ${API_TYPES[formData.tipo as keyof typeof API_TYPES]?.label} - Corretora ABC`}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.ativo}
                onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })}
              />
              <Label>Integração ativa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
