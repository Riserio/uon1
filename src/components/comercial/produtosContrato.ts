// Produto do Comercial → modelo de contrato do Uon1 Sign + tabela de preços.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CAMPOS_PADRAO,
  campoComercial,
  derivarContrato,
  type CampoModelo,
  type Dados,
} from "../../../supabase/functions/uonisign/modelo";
import type { ProdutoContrato } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ModeloContrato = Record<string, any>;

export function camposDoModelo(m?: ModeloContrato | null): CampoModelo[] {
  return Array.isArray(m?.campos) && m.campos.length ? (m.campos as CampoModelo[]) : CAMPOS_PADRAO;
}

/** Condições comerciais do modelo (preço, prazo, vigência): são os itens da proposta. */
export const camposComerciais = (m?: ModeloContrato | null) => (m ? camposDoModelo(m).filter(campoComercial) : []);

/** Valores iniciais da proposta: padrão do modelo, depois a tabela de preços. */
export function termosIniciais(m: ModeloContrato | null, cfg?: ProdutoContrato | null, atuais?: Dados | null): Dados {
  const t: Dados = {};
  for (const c of camposComerciais(m)) {
    const v = atuais?.[c.chave] ?? cfg?.valores?.[c.chave] ?? c.padrao;
    if (v != null && String(v) !== "") t[c.chave] = String(v);
  }
  // travados valem sempre os da tabela
  for (const k of cfg?.travados ?? []) if (cfg?.valores?.[k] != null) t[k] = String(cfg.valores[k]);
  return t;
}

/** Total da proposta quando o modelo define quais campos somam (soma_valor). */
export function totalDosTermos(m: ModeloContrato | null, termos: Dados): number | null {
  if (!m) return null;
  return derivarContrato(camposDoModelo(m), termos).valor_contrato;
}

export function useProdutosContrato(ativo = true) {
  return useQuery({
    queryKey: ["comercial_produtos_contrato"],
    enabled: ativo,
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [{ data: cfgs, error: e1 }, { data: mods, error: e2 }] = await Promise.all([
        db.from("comercial_produtos_contrato").select("*"),
        db.from("contrato_templates").select("id, titulo, campos, ativo, fluxo_versao, logo_url, contratada").eq("ativo", true),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const modelos = ((mods ?? []) as ModeloContrato[]).filter((m) => (m.fluxo_versao ?? 1) >= 2);
      return {
        configs: new Map<string, ProdutoContrato>(((cfgs ?? []) as ProdutoContrato[]).map((c) => [c.produto, c])),
        modelos,
        modeloPorId: new Map<string, ModeloContrato>(modelos.map((m) => [m.id, m])),
      };
    },
  });
}
