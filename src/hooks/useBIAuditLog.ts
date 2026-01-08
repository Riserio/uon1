import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { Json } from "@/integrations/supabase/types";

type Modulo = "bi_indicadores" | "sga_insights" | "mgf_insights" | "cobranca_insights";
type Acao = "importacao" | "alteracao" | "exclusao" | "visualizacao";

interface LogParams {
  modulo: Modulo;
  acao: Acao;
  descricao: string;
  corretoraId?: string;
  dadosAnteriores?: Json;
  dadosNovos?: Json;
}

export function useBIAuditLog() {
  const { user } = useAuth();
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
    if (user) {
      supabase
        .from("profiles")
        .select("nome")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          setUserName(data?.nome || user.email || "Usuário");
        });
    }
  }, [user]);

  const registrarLog = async ({
    modulo,
    acao,
    descricao,
    corretoraId,
    dadosAnteriores,
    dadosNovos,
  }: LogParams) => {
    if (!user) {
      console.warn("Usuário não autenticado, log não registrado");
      return;
    }

    try {
      const { error } = await supabase.from("bi_audit_logs").insert([{
        user_id: user.id,
        user_nome: userName || user.email || "Usuário",
        modulo,
        acao,
        descricao,
        corretora_id: corretoraId || null,
        dados_anteriores: dadosAnteriores || null,
        dados_novos: dadosNovos || null,
      }]);

      if (error) {
        console.error("Erro ao registrar log:", error);
      }
    } catch (error) {
      console.error("Erro ao registrar log:", error);
    }
  };

  return { registrarLog };
}
