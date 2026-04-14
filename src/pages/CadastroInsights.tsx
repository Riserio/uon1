import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBILayout } from "@/contexts/BILayoutContext";
import CadastroDashboard from "@/components/cadastro/CadastroDashboard";
import CadastroTabela from "@/components/cadastro/CadastroTabela";
import CadastroImportacao from "@/components/cadastro/CadastroImportacao";

export default function CadastroInsights() {
  const biLayout = useBILayout();
  const corretoraId = biLayout?.selectedAssociacao || "";
  const corretoraNome = biLayout?.associacoes?.find((a: any) => a.id === corretoraId)?.nome || "";

  const [registros, setRegistros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");

  useEffect(() => {
    if (corretoraId) fetchRegistros();
    else { setRegistros([]); setLoading(false); }
  }, [corretoraId]);

  const fetchRegistros = async () => {
    setLoading(true);
    try {
      const { data: importacao } = await supabase
        .from("cadastro_importacoes")
        .select("id")
        .eq("corretora_id", corretoraId)
        .eq("ativo", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!importacao) { setRegistros([]); setLoading(false); return; }

      const allRegistros: any[] = [];
      let from = 0;
      const BATCH = 1000;
      while (true) {
        const { data } = await supabase
          .from("cadastro_registros")
          .select("*")
          .eq("importacao_id", importacao.id)
          .range(from, from + BATCH - 1);
        if (!data || data.length === 0) break;
        allRegistros.push(...data);
        if (data.length < BATCH) break;
        from += BATCH;
      }
      setRegistros(allRegistros);
    } catch (err) {
      console.error("Erro ao carregar cadastro:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (biLayout) {
      biLayout.setHeaderDynamic({
        recordCount: registros.length,
        hasActiveFilters: false,
        fileName: undefined,
      });
    }
  }, [registros.length]);

  return (
    <div className="container mx-auto px-4 sm:px-6 pb-8">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="tabela">Tabela</TabsTrigger>
          <TabsTrigger value="importar">Importar</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <CadastroDashboard registros={registros} loading={loading} />
        </TabsContent>
        <TabsContent value="tabela">
          <CadastroTabela registros={registros} loading={loading} />
        </TabsContent>
        <TabsContent value="importar">
          <CadastroImportacao
            onImportSuccess={fetchRegistros}
            corretoraId={corretoraId}
            corretoraNome={corretoraNome}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
