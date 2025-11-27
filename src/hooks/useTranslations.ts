import { useState, useEffect, createContext, useContext } from "react";
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

export interface TranslationsConfig {
  labels: Record<string, string>;
}

interface TranslationsContextType {
  labels: Record<string, string>;
  t: (key: string) => string;
  updateLabel: (key: string, value: string) => Promise<void>;
  saveTranslations: () => Promise<void>;
  resetToDefaults: () => void;
  isLoading: boolean;
}

export function useTranslationsState() {
  const { user } = useAuth();
  const [labels, setLabels] = useState<Record<string, string>>(defaultLabels);
  const [isLoading, setIsLoading] = useState(true);

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

      // Use colors JSON to store translations (reusing existing structure)
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

  const t = (key: string): string => {
    return labels[key] || defaultLabels[key] || key;
  };

  const updateLabel = async (key: string, value: string) => {
    setLabels(prev => ({ ...prev, [key]: value }));
  };

  const saveTranslations = async () => {
    if (!user) return;

    try {
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
    } catch (error) {
      console.error("Error saving translations:", error);
      throw error;
    }
  };

  const resetToDefaults = () => {
    setLabels(defaultLabels);
  };

  return {
    labels,
    t,
    updateLabel,
    saveTranslations,
    resetToDefaults,
    isLoading,
    defaultLabels,
  };
}

// Export default labels for the config page
export { defaultLabels };
