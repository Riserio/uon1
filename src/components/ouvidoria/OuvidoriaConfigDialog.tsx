import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Copy, Plus, X, Clock, ExternalLink, Code, Pencil, Check } from "lucide-react";

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
  corretoras: { id: string; nome: string; slug?: string | null }[];
}

export default function OuvidoriaConfigDialog({ open, onOpenChange, corretoras }: Props) {
  const [selectedCorretora, setSelectedCorretora] = useState("");
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugValue, setSlugValue] = useState("");

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

  const saveSlug = async () => {
    const slug = slugValue.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!slug) { toast.error("Slug inválido"); return; }
    const { error, data } = await supabase.from("corretoras").update({ slug }).eq("id", selectedCorretora).select();
    if (error) { 
      console.error("Erro ao salvar slug:", error);
      toast.error("Erro ao salvar slug (pode já estar em uso)"); 
      return; 
    }
    console.log("Slug salvo com sucesso:", data);
    // Force corretoras prop update by mutating the reference
    const idx = corretoras.findIndex(c => c.id === selectedCorretora);
    if (idx >= 0) (corretoras[idx] as any).slug = slug;
    setEditingSlug(false);
    toast.success("Slug salvo!");
  };

  const selectedCorretoraData = corretoras.find((c) => c.id === selectedCorretora);
  const slugOrId = selectedCorretoraData?.slug || selectedCorretora;
  const hasSlug = !!selectedCorretoraData?.slug;
  const publicUrl = selectedCorretoraData ? `${window.location.origin}/ouvidoria/${slugOrId}` : "";
  const embedUrl = config ? `${window.location.origin}/embed/ouvidoria/${slugOrId}?token=${config.embed_token}` : "";
  const iframeSnippet = embedUrl ? `<iframe src="${embedUrl}" width="100%" height="600" frameborder="0"></iframe>` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Configuração da Ouvidoria</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto -mr-4 pr-4" style={{ maxHeight: "calc(90vh - 100px)" }}>
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

                  {/* Slug Config */}
                  <div className="p-3 rounded-xl border bg-muted/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-xs font-semibold">Slug da URL</Label>
                        <p className="text-[11px] text-muted-foreground">Identificador amigável usado nos links (ex: <span className="font-mono">associacao</span>)</p>
                      </div>
                      {!editingSlug ? (
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => { setSlugValue(selectedCorretoraData?.slug || ""); setEditingSlug(true); }}>
                          <Pencil className="h-3 w-3" /> {hasSlug ? "Editar" : "Configurar"}
                        </Button>
                      ) : null}
                    </div>
                    {editingSlug ? (
                      <div className="flex gap-2">
                        <Input
                          value={slugValue}
                          onChange={(e) => setSlugValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                          placeholder="ex: associacao"
                          className="text-sm font-mono h-8"
                          onKeyDown={(e) => e.key === "Enter" && saveSlug()}
                        />
                        <Button size="sm" className="h-8 gap-1" onClick={saveSlug}><Check className="h-3 w-3" /> Salvar</Button>
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => setEditingSlug(false)}>Cancelar</Button>
                      </div>
                    ) : (
                      <div>
                        {hasSlug ? (
                          <Badge variant="secondary" className="bg-accent text-accent-foreground border-0 text-xs font-mono">{selectedCorretoraData?.slug}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Nenhum slug configurado — usando UUID</Badge>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Link Público */}
                  <div className="p-4 rounded-xl border bg-muted/20 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <ExternalLink className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">Formulário Público</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Link direto para o associado abrir uma manifestação. Compartilhe por e-mail, WhatsApp ou site.</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Input value={publicUrl} readOnly className="text-xs font-mono bg-background" />
                      <Button variant="outline" size="icon" className="shrink-0" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Copiado!"); }}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" className="shrink-0" onClick={() => window.open(publicUrl, "_blank")}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Link Embed */}
                  <div className="p-4 rounded-xl border bg-muted/20 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <Code className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">Embed para Portal</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Incorpore o formulário via iframe no portal do parceiro. Requer token de autenticação.</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Input value={embedUrl} readOnly className="text-xs font-mono bg-background" />
                      <Button variant="outline" size="icon" className="shrink-0" onClick={() => { navigator.clipboard.writeText(embedUrl); toast.success("Copiado!"); }}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    {iframeSnippet && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Snippet iframe</Label>
                        <div className="flex gap-2">
                          <Input value={iframeSnippet} readOnly className="text-[10px] font-mono bg-background" />
                          <Button variant="outline" size="icon" className="shrink-0" onClick={() => { navigator.clipboard.writeText(iframeSnippet); toast.success("Snippet copiado!"); }}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
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
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
