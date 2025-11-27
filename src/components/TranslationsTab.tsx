import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Languages, Save, RotateCcw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Labels padrão do sistema
const defaultLabels: Record<string, string> = {
  corretora: "Corretora",
  corretoras: "Corretoras",
  sinistro: "Sinistro",
  sinistros: "Sinistros",
  vistoria: "Vistoria",
  vistorias: "Vistorias",
  atendimento: "Atendimento",
  atendimentos: "Atendimentos",
  associado: "Associado",
  associados: "Associados",
  cliente: "Cliente",
  clientes: "Clientes",
  parceiro: "Parceiro",
  parceiros: "Parceiros",
  usuario: "Usuário",
  usuarios: "Usuários",
  contato: "Contato",
  contatos: "Contatos",
  documento: "Documento",
  documentos: "Documentos",
  comunicado: "Comunicado",
  comunicados: "Comunicados",
  lancamento: "Lançamento",
  lancamentos: "Lançamentos",
  financeiro: "Financeiro",
  comite: "Comitê",
  oficina: "Oficina",
  oficinas: "Oficinas",
  reparo: "Reparo",
  reparos: "Reparos",
  peca: "Peça",
  pecas: "Peças",
  custo: "Custo",
  custos: "Custos",
  agenda: "Agenda",
  equipe: "Equipe",
  equipes: "Equipes",
  painel: "Painel",
  configuracoes: "Configurações",
  mensagem: "Mensagem",
  mensagens: "Mensagens",
};

export function TranslationsTab() {
  const { user } = useAuth();
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
        });

      if (error) throw error;
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

  const filteredLabels = Object.entries(labels).filter(([key, value]) => 
    key.toLowerCase().includes(search.toLowerCase()) || 
    value.toLowerCase().includes(search.toLowerCase())
  );

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
          Renomeie os termos do sistema para adaptar à sua nomenclatura. 
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

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredLabels.map(([key, value]) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key} className="text-xs text-muted-foreground capitalize">
                {key.replace(/_/g, " ")} (padrão: {defaultLabels[key]})
              </Label>
              <Input
                id={key}
                value={value}
                onChange={(e) => setLabels(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={defaultLabels[key]}
              />
            </div>
          ))}
        </div>

        {filteredLabels.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum termo encontrado para "{search}"
          </div>
        )}
      </CardContent>
    </Card>
  );
}
