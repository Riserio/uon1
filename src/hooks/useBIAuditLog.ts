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

/**
 * Evita erro: "invalid input syntax for type json"
 * - garante que o valor enviado ao Postgres json/jsonb é JSON válido (Json | null)
 * - nunca manda string "[object Object]" ou valores não serializáveis
 */
function normalizeJson(value: unknown): Json | null {
  if (value === undefined || value === null) return null;

  // Se já for um Json "simples", retorna
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value as Json;

  // Datas, BigInt, etc -> converte para string segura
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();

  // Se vier string "JSON", tenta parsear; se falhar, embrulha em { raw: ... }
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    try {
      return JSON.parse(s) as Json;
    } catch {
      return { raw: s } as Json;
    }
  }

  // Objetos/arrays: garante serialização
  try {
    // Remove undefined, funções, etc. e garante JSON válido
    return JSON.parse(JSON.stringify(value)) as Json;
  } catch {
    // fallback: não quebra o insert
    return { raw: String(value) } as Json;
  }
}

export function useBIAuditLog() {
  const { user } = useAuth();
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    const loadProfileName = async () => {
      if (!user) return;

      const { data, error } = await supabase.from("profiles").select("nome").eq("id", user.id).single();

      if (!cancelled) {
        if (error) {
          setUserName(user.email || "Usuário");
          return;
        }
        setUserName(data?.nome || user.email || "Usuário");
      }
    };

    loadProfileName();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const registrarLog = async ({ modulo, acao, descricao, corretoraId, dadosAnteriores, dadosNovos }: LogParams) => {
    if (!user) {
      console.warn("Usuário não autenticado, log não registrado");
      return;
    }

    const payload = {
      user_id: user.id,
      user_nome: userName || user.email || "Usuário",
      modulo,
      acao,
      descricao,
      corretora_id: corretoraId ?? null,
      dados_anteriores: normalizeJson(dadosAnteriores),
      dados_novos: normalizeJson(dadosNovos),
    };

    try {
      const { error } = await supabase.from("bi_audit_logs").insert([payload]);

      if (error) {
        // Esses campos ajudam MUITO a achar a coluna que está quebrando
        console.error("Erro ao registrar log:", error.message, (error as any).details, (error as any).hint, payload);
      }
    } catch (error: any) {
      console.error("Erro ao registrar log:", error?.message ?? error, error);
    }
  };

  return { registrarLog };
}
