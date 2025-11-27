import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Labels padrão do sistema (incluindo menus)
export const defaultLabels: Record<string, string> = {
  // Entidades
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
  // Menus
  menu_painel: "Painel",
  menu_atendimentos: "Atendimentos",
  menu_corretoras: "Corretoras",
  menu_termos: "Termos de Aceite",
  menu_contatos: "Contatos",
  menu_usuarios: "Usuários",
  menu_sinistros: "Sinistros",
  menu_lancamentos: "Lançamentos Financeiros",
  menu_agenda: "Agenda",
  menu_documentos: "Documentos",
  menu_mensagens: "Mensagens",
  menu_pid: "PID",
  menu_emails: "E-mails",
  menu_comunicados: "Comunicados",
  menu_configuracoes: "Configurações",
  // Seções
  secao_navegacao: "Navegação",
  secao_cadastros: "Cadastros",
  secao_ferramentas: "Ferramentas",
};

interface TranslationsContextType {
  labels: Record<string, string>;
  t: (key: string) => string;
  isLoading: boolean;
  reloadTranslations: () => Promise<void>;
}

const TranslationsContext = createContext<TranslationsContextType | undefined>(undefined);

export function TranslationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [labels, setLabels] = useState<Record<string, string>>(defaultLabels);
  const [isLoading, setIsLoading] = useState(true);

  const loadTranslations = async () => {
    if (!user) {
      setLabels(defaultLabels);
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
      } else {
        setLabels(defaultLabels);
      }
    } catch (error) {
      console.error("Error loading translations:", error);
      setLabels(defaultLabels);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTranslations();
  }, [user]);

  const t = (key: string): string => {
    return labels[key] || defaultLabels[key] || key;
  };

  return (
    <TranslationsContext.Provider value={{ labels, t, isLoading, reloadTranslations: loadTranslations }}>
      {children}
    </TranslationsContext.Provider>
  );
}

export function useTranslations() {
  const context = useContext(TranslationsContext);
  if (context === undefined) {
    // Fallback para quando não está no provider
    return {
      labels: defaultLabels,
      t: (key: string) => defaultLabels[key] || key,
      isLoading: false,
      reloadTranslations: async () => {},
    };
  }
  return context;
}
