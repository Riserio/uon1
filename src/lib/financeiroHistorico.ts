import { supabase } from "@/integrations/supabase/client";

type AcaoHistorico = 'criacao' | 'edicao' | 'aprovacao' | 'rejeicao' | 'pagamento' | 'conciliacao' | 'exclusao';

interface RegistrarHistoricoParams {
  lancamentoId?: string;
  userId: string;
  userNome: string;
  acao: AcaoHistorico;
  campoAlterado?: string;
  valorAnterior?: string;
  valorNovo?: string;
  dadosCompletos?: Record<string, any>;
}

export async function registrarHistoricoFinanceiro({
  lancamentoId,
  userId,
  userNome,
  acao,
  campoAlterado,
  valorAnterior,
  valorNovo,
  dadosCompletos,
}: RegistrarHistoricoParams) {
  try {
    const { error } = await supabase
      .from("lancamentos_financeiros_historico")
      .insert({
        lancamento_id: lancamentoId,
        user_id: userId,
        user_nome: userNome,
        acao,
        campo_alterado: campoAlterado,
        valor_anterior: valorAnterior,
        valor_novo: valorNovo,
        dados_completos: dadosCompletos,
      });

    if (error) {
      console.error("Erro ao registrar histórico financeiro:", error);
    }
  } catch (err) {
    console.error("Erro ao registrar histórico financeiro:", err);
  }
}
