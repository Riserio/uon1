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
import { Plus, Trash2, Edit2, CheckCircle, XCircle, Server, Eye, EyeOff } from "lucide-react";
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

export function ApiIntegrationsConfig() {
  const { user } = useAuth();
  const [integrations, setIntegrations] = useState<ApiIntegration[]>([]);
  const [corretoras, setCorretoras] = useState<Corretora[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<ApiIntegration | null>(null);
  const [showToken, setShowToken] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState({
    corretora_id: "",
    tipo: "cilia",
    nome: "",
    ambiente: "producao",
    base_url: "https://sistema.cilia.com.br",
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

  const handleOpenDialog = (integration?: ApiIntegration) => {
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
        tipo: "cilia",
        nome: "",
        ambiente: "producao",
        base_url: "https://sistema.cilia.com.br",
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

    try {
      if (editingIntegration) {
        const { error } = await supabase
          .from("api_integrations")
          .update({
            corretora_id: formData.corretora_id,
            tipo: formData.tipo,
            nome: formData.nome || `CILIA - ${corretoras.find(c => c.id === formData.corretora_id)?.nome}`,
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
          nome: formData.nome || `CILIA - ${corretoras.find(c => c.id === formData.corretora_id)?.nome}`,
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
        toast.error("Já existe uma integração CILIA para esta corretora");
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

  const handleAmbienteChange = (ambiente: string) => {
    const baseUrl = ambiente === "homologacao" 
      ? "https://qa.cilia.com.br" 
      : "https://sistema.cilia.com.br";
    setFormData({ ...formData, ambiente, base_url: baseUrl });
  };

  return (
    <div className="space-y-6">
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Integrações CILIA
              </CardTitle>
              <CardDescription>
                Configure os tokens de acesso à API CILIA para cada corretora
              </CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Integração
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : integrations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma integração configurada. Clique em "Nova Integração" para começar.
            </div>
          ) : (
            <div className="space-y-4">
              {integrations.map((integration) => (
                <div
                  key={integration.id}
                  className="flex items-center justify-between p-4 border rounded-lg bg-card"
                >
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingIntegration ? "Editar Integração CILIA" : "Nova Integração CILIA"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
                placeholder="https://sistema.cilia.com.br"
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
                Token fornecido pela Cilia para autenticação na API
              </p>
            </div>

            <div className="space-y-2">
              <Label>Nome da Integração (opcional)</Label>
              <Input
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Ex: CILIA - Corretora ABC"
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
