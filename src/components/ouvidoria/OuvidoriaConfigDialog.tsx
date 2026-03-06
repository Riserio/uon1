import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Copy, Plus, X, Clock } from "lucide-react";

const STATUSES = [
  "Recebimento",
  "Levantamento",
  "Acionamento Setor",
  "Contato Associado",
  "Monitoramento",
  "Resolvido",
  "Sem Resolução",
];

const SLA_LABELS: Record<string, string> = {
  "Recebimento": "Imediato / horas",
  "Levantamento": "Horas",
  "Acionamento Setor": "Horas",
  "Contato Associado": "Horas",
  "Monitoramento": "Agendado (opcional)",
  "Resolvido": "Finalizado (opcional)",
  "Sem Resolução": "Encerrado (opcional)",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  corretoras: { id: string; nome: string }[];
}

export default function OuvidoriaConfigDialog({ open, onOpenChange, corretoras }: Props) {
  const [selectedCorretora, setSelectedCorretora] = useState("");
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [newDomain, setNewDomain] = useState("");

  useEffect(() => {
    if (selectedCorretora) loadConfig();
  }, [selectedCorretora]);

  const loadConfig = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ouvidoria_config")
      .select("*")
      .eq("corretora_id", selectedCorretora)
      .maybeSingle();

    if (data) {
      setConfig(data);
    } else {
      // Create default config
      const { data: newConfig } = await supabase
        .from("ouvidoria_config")
        .insert({ corretora_id: selectedCorretora })
        .select()
        .single();
      setConfig(newConfig);
    }
    setLoading(false);
  };

  const saveConfig = async (updates: any) => {
    if (!config) return;
    const { error } = await supabase
      .from("ouvidoria_config")
      .update(updates)
      .eq("id", config.id);
    if (error) toast.error("Erro ao salvar");
    else {
      setConfig({ ...config, ...updates });
      toast.success("Configuração salva");
    }
  };

  const addDomain = () => {
    if (!newDomain.trim()) return;
    const domains = [...(config?.dominios_permitidos || []), newDomain.trim()];
    saveConfig({ dominios_permitidos: domains });
    setNewDomain("");
  };

  const removeDomain = (domain: string) => {
    const domains = (config?.dominios_permitidos || []).filter((d: string) => d !== domain);
    saveConfig({ dominios_permitidos: domains });
  };

  const selectedCorretoraData = corretoras.find((c) => c.id === selectedCorretora);
  const publicUrl = selectedCorretoraData ? `${window.location.origin}/ouvidoria/${selectedCorretora}` : "";
  const embedUrl = config ? `${window.location.origin}/embed/ouvidoria/${selectedCorretora}?token=${config.embed_token}` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configuração da Ouvidoria</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Associação</Label>
            <Select value={selectedCorretora} onValueChange={setSelectedCorretora}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {corretoras.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {config && (
            <Tabs defaultValue="geral" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="geral">Geral</TabsTrigger>
                <TabsTrigger value="sla"><Clock className="h-3.5 w-3.5 mr-1" /> SLA por Etapa</TabsTrigger>
              </TabsList>

              <TabsContent value="geral" className="space-y-4 mt-0">
                {/* Cores */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Cor Primária</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={config.cor_primaria || "#1e40af"}
                        onChange={(e) => saveConfig({ cor_primaria: e.target.value })}
                        className="w-10 h-10 rounded cursor-pointer"
                      />
                      <Input
                        value={config.cor_primaria || "#1e40af"}
                        onChange={(e) => saveConfig({ cor_primaria: e.target.value })}
                        className="font-mono text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Cor do Botão</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={config.cor_botao || "#1e40af"}
                        onChange={(e) => saveConfig({ cor_botao: e.target.value })}
                        className="w-10 h-10 rounded cursor-pointer"
                      />
                      <Input
                        value={config.cor_botao || "#1e40af"}
                        onChange={(e) => saveConfig({ cor_botao: e.target.value })}
                        className="font-mono text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* URLs */}
                <div className="space-y-2">
                  <Label className="text-xs">Link Público do Formulário</Label>
                  <div className="flex gap-2">
                    <Input value={publicUrl} readOnly className="text-xs" />
                    <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Copiado!"); }}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Link Embed (Portal)</Label>
                  <div className="flex gap-2">
                    <Input value={embedUrl} readOnly className="text-xs" />
                    <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(embedUrl); toast.success("Copiado!"); }}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Domínios permitidos */}
                <div className="space-y-2">
                  <Label className="text-xs">Domínios Permitidos para Embed</Label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {(config.dominios_permitidos || []).map((d: string) => (
                      <Badge key={d} variant="secondary" className="gap-1">
                        {d}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => removeDomain(d)} />
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      placeholder="ex: portal.associacao.com.br"
                      className="text-sm"
                      onKeyDown={(e) => e.key === "Enter" && addDomain()}
                    />
                    <Button variant="outline" size="sm" onClick={addDomain}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="sla" className="space-y-3 mt-0">
                <p className="text-xs text-muted-foreground">
                  Configure o tempo máximo (em horas) que cada etapa deve levar. Deixe vazio para etapas sem SLA.
                </p>
                <div className="space-y-2">
                  {STATUSES.map(status => {
                    const slaHoras = config.sla_horas || {};
                    const currentValue = slaHoras[status];
                    return (
                      <div key={status} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{status}</p>
                          <p className="text-xs text-muted-foreground">{SLA_LABELS[status]}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            className="w-20 h-8 text-center text-sm"
                            placeholder="—"
                            value={currentValue ?? ""}
                            onChange={(e) => {
                              const val = e.target.value === "" ? null : Number(e.target.value);
                              const newSla = { ...slaHoras, [status]: val };
                              saveConfig({ sla_horas: newSla });
                            }}
                          />
                          <span className="text-xs text-muted-foreground w-6">hrs</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
