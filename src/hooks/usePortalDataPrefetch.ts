import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

type ModuleData = {
  eventos?: any[];
  mgf?: any[];
  cobranca?: any[];
  indicadores?: boolean;
};

type PrefetchCache = {
  [corretoraId: string]: ModuleData;
};

// Cache global para pré-carregamento
const prefetchCache: PrefetchCache = {};
const prefetchPromises: { [key: string]: Promise<any> } = {};

export function usePortalDataPrefetch(
  corretoraId: string | undefined,
  currentModule: 'indicadores' | 'eventos' | 'mgf' | 'cobranca',
  availableModules: string[]
) {
  const prefetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!corretoraId || availableModules.length <= 1) return;

    // Inicializar cache para esta corretora
    if (!prefetchCache[corretoraId]) {
      prefetchCache[corretoraId] = {};
    }

    // Módulos a pré-carregar (excluindo o atual)
    const modulesToPrefetch = availableModules.filter(m => m !== currentModule);

    // Pré-carregar cada módulo em segundo plano
    modulesToPrefetch.forEach(module => {
      const cacheKey = `${corretoraId}-${module}`;
      
      // Evitar pré-carregar se já está no cache ou em progresso
      if (prefetchedRef.current.has(cacheKey) || prefetchPromises[cacheKey]) return;
      
      prefetchedRef.current.add(cacheKey);
      
      // Delay para não sobrecarregar (escalonar as requisições)
      const delay = modulesToPrefetch.indexOf(module) * 500;
      
      setTimeout(() => {
        prefetchModule(corretoraId, module as any);
      }, delay);
    });
  }, [corretoraId, currentModule, availableModules]);

  return prefetchCache[corretoraId || ''] || {};
}

async function prefetchModule(
  corretoraId: string,
  module: 'eventos' | 'mgf' | 'cobranca'
) {
  const cacheKey = `${corretoraId}-${module}`;
  
  // Evitar múltiplas requisições paralelas para o mesmo módulo
  if (prefetchPromises[cacheKey]) return prefetchPromises[cacheKey];

  console.log(`[Prefetch] Iniciando pré-carregamento: ${module}`);

  const promise = (async () => {
    try {
      switch (module) {
        case 'eventos':
          await prefetchEventos(corretoraId);
          break;
        case 'mgf':
          await prefetchMGF(corretoraId);
          break;
        case 'cobranca':
          await prefetchCobranca(corretoraId);
          break;
      }
      console.log(`[Prefetch] Concluído: ${module}`);
    } catch (error) {
      console.error(`[Prefetch] Erro ao pré-carregar ${module}:`, error);
    } finally {
      delete prefetchPromises[cacheKey];
    }
  })();

  prefetchPromises[cacheKey] = promise;
  return promise;
}

async function prefetchEventos(corretoraId: string) {
  // Buscar importação ativa
  const { data: importacao } = await supabase
    .from("sga_importacoes")
    .select("id")
    .eq("ativo", true)
    .eq("corretora_id", corretoraId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (importacao) {
    // Buscar apenas primeiros 1000 registros para preview rápido
    const { data: eventos } = await supabase
      .from("sga_eventos")
      .select("*")
      .eq("importacao_id", importacao.id)
      .limit(1000);

    if (!prefetchCache[corretoraId]) prefetchCache[corretoraId] = {};
    prefetchCache[corretoraId].eventos = eventos || [];
  }
}

async function prefetchMGF(corretoraId: string) {
  const { data: importacao } = await supabase
    .from("mgf_importacoes")
    .select("id")
    .eq("ativo", true)
    .eq("corretora_id", corretoraId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (importacao) {
    const SELECT_COLS = "id, operacao, sub_operacao, valor, situacao_pagamento, data_vencimento, cooperativa, regional";
    
    const { data: mgf } = await supabase
      .from("mgf_dados")
      .select(SELECT_COLS)
      .eq("importacao_id", importacao.id)
      .limit(1000);

    if (!prefetchCache[corretoraId]) prefetchCache[corretoraId] = {};
    prefetchCache[corretoraId].mgf = mgf || [];
  }
}

async function prefetchCobranca(corretoraId: string) {
  const { data: importacao } = await supabase
    .from("cobranca_importacoes")
    .select("id")
    .eq("ativo", true)
    .eq("corretora_id", corretoraId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (importacao) {
    const { data: boletos } = await supabase
      .from("cobranca_boletos")
      .select("id, situacao, valor, data_vencimento_original, dia_vencimento_veiculo, cooperativa, regional_boleto")
      .eq("importacao_id", importacao.id)
      .limit(1000);

    if (!prefetchCache[corretoraId]) prefetchCache[corretoraId] = {};
    prefetchCache[corretoraId].cobranca = boletos || [];
  }
}

// Função para limpar cache (útil ao trocar de associação)
export function clearPrefetchCache(corretoraId?: string) {
  if (corretoraId) {
    delete prefetchCache[corretoraId];
  } else {
    Object.keys(prefetchCache).forEach(key => delete prefetchCache[key]);
  }
}

// Função para verificar se dados já estão em cache
export function hasPrefetchedData(corretoraId: string, module: string): boolean {
  return !!(prefetchCache[corretoraId]?.[module as keyof ModuleData]);
}

// Função para obter dados do cache
export function getPrefetchedData<T>(corretoraId: string, module: string): T[] | null {
  const data = prefetchCache[corretoraId]?.[module as keyof ModuleData];
  return Array.isArray(data) ? data as T[] : null;
}
