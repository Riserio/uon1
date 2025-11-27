import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Languages, Save, RotateCcw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { defaultLabels, useTranslations } from "@/contexts/TranslationsContext";

// Categorias para organização
const labelCategories: Record<string, string[]> = {
  "Menus": [
    "menu_painel", "menu_atendimentos", "menu_corretoras", "menu_termos",
    "menu_contatos", "menu_usuarios", "menu_sinistros", "menu_lancamentos",
    "menu_agenda", "menu_documentos", "menu_mensagens", "menu_pid",
    "menu_emails", "menu_comunicados", "menu_configuracoes"
  ],
  "Seções": ["secao_navegacao", "secao_cadastros", "secao_ferramentas"],
  "Entidades": [
    "corretora", "corretoras", "sinistro", "sinistros", "vistoria", "vistorias",
    "atendimento", "atendimentos", "associado", "associados", "cliente", "clientes",
    "parceiro", "parceiros", "usuario", "usuarios", "contato", "contatos",
    "documento", "documentos", "comunicado", "comunicados", "lancamento", "lancamentos"
  ],
  "Outros": [
    "financeiro", "comite", "oficina", "oficinas", "reparo", "reparos",
    "peca", "pecas", "custo", "custos", "agenda", "equipe", "equipes",
    "painel", "configuracoes", "mensagem", "mensagens"
  ]
};

export function TranslationsTab() {
  const { user } = useAuth();
  const { reloadTranslations } = useTranslations();
  const [labels, setLabels] = useState<Record<string, string>>(defaultLabels);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadTranslations();
  }, [user]);

  const loadTranslations = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("app_config")
        .select("colors")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      const storedLabels = (data?.colors as any)?.translations;
      if (storedLabels) {
        setLabels({ ...defaultLabels, ...storedLabels });
      }
    } catch (error) {
      console.error("Error loading translations:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    try {
      setIsSaving(true);
      
      const { data: existing } = await supabase
        .from("app_config")
        .select("colors")
        .eq("user_id", user.id)
        .maybeSingle();

      const currentColors = (existing?.colors as any) || {};
      const updatedColors = {
        ...currentColors,
        translations: labels,
      };

      const { error } = await supabase
        .from("app_config")
        .upsert({
          user_id: user.id,
          colors: updatedColors,
        }, { onConflict: 'user_id' });

      if (error) throw error;
      
      // Recarrega traduções globalmente
      await reloadTranslations();
      toast.success("Traduções salvas com sucesso!");
    } catch (error) {
      console.error("Error saving translations:", error);
      toast.error("Erro ao salvar traduções");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setLabels(defaultLabels);
    toast.success("Traduções resetadas para o padrão");
  };

  const getFilteredLabels = (category: string) => {
    const keys = labelCategories[category] || [];
    return keys.filter(key => 
      key.toLowerCase().includes(search.toLowerCase()) || 
      labels[key]?.toLowerCase().includes(search.toLowerCase()) ||
      defaultLabels[key]?.toLowerCase().includes(search.toLowerCase())
    );
  };

  if (isLoading) {
    return (
      <Card className="border-2">
        <CardContent className="py-8 text-center text-muted-foreground">
          Carregando traduções...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="h-5 w-5" />
          Personalização de Textos
        </CardTitle>
        <CardDescription>
          Renomeie os termos e menus do sistema para adaptar à sua nomenclatura. 
          Por exemplo, troque "Corretora" por "Associação".
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar termo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button onClick={handleReset} variant="outline" className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Resetar
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            <Save className="h-4 w-4" />
            {isSaving ? "Salvando..." : "Salvar"}
          </Button>
        </div>

        {Object.keys(labelCategories).map(category => {
          const filteredKeys = getFilteredLabels(category);
          if (filteredKeys.length === 0) return null;
          
          return (
            <div key={category} className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground border-b pb-2">{category}</h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredKeys.map(key => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={key} className="text-xs text-muted-foreground">
                      {key.replace(/_/g, " ")} (padrão: {defaultLabels[key]})
                    </Label>
                    <Input
                      id={key}
                      value={labels[key] || ""}
                      onChange={(e) => setLabels(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder={defaultLabels[key]}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {Object.keys(labelCategories).every(cat => getFilteredLabels(cat).length === 0) && (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum termo encontrado para "{search}"
          </div>
        )}
      </CardContent>
    </Card>
  );
}
