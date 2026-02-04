import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

type ModuleData = {
  eventos?: any[];
  mgf?: any[];
  cobranca?: any[];
  indicadores?: boolean;
  timestamp?: number;
};

type PrefetchCache = {
  [corretoraId: string]: ModuleData;
};

// Cache global em memória para acesso instantâneo
const memoryCache: PrefetchCache = {};
const prefetchPromises: { [key: string]: Promise<any> } = {};

// Configuração de cache
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutos
const STORAGE_KEY_PREFIX = "portal_cache_";

// Funções utilitárias para localStorage
function getStorageKey(corretoraId: string): string {
  return `${STORAGE_KEY_PREFIX}${corretoraId}`;
}

function loadFromStorage(corretoraId: string): ModuleData | null {
  try {
    const stored = localStorage.getItem(getStorageKey(corretoraId));
    if (!stored) return null;
    
    const parsed = JSON.parse(stored) as ModuleData;
    
    // Verificar se o cache expirou
    if (parsed.timestamp && Date.now() - parsed.timestamp > CACHE_DURATION_MS) {
      localStorage.removeItem(getStorageKey(corretoraId));
      return null;
    }
    
    return parsed;
  } catch {
    return null;
  }
}

function saveToStorage(corretoraId: string, data: ModuleData): void {
  try {
    const dataWithTimestamp = { ...data, timestamp: Date.now() };
    localStorage.setItem(getStorageKey(corretoraId), JSON.stringify(dataWithTimestamp));
  } catch (e) {
    // localStorage cheio ou não disponível - continuar sem persistência
    console.warn("[Prefetch] Não foi possível salvar no localStorage:", e);
  }
}

// Inicializar cache de memória do localStorage
function initMemoryCacheFromStorage(corretoraId: string): boolean {
  if (memoryCache[corretoraId]) return true;
  
  const stored = loadFromStorage(corretoraId);
  if (stored) {
    memoryCache[corretoraId] = stored;
    console.log(`[Prefetch] Cache restaurado do localStorage para ${corretoraId}`);
    return true;
  }
  return false;
}

export function usePortalDataPrefetch(
  corretoraId: string | undefined,
  currentModule: 'indicadores' | 'eventos' | 'mgf' | 'cobranca',
  availableModules: string[]
) {
  const prefetchedRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!corretoraId) return;

    // Tentar restaurar do localStorage na primeira execução
    if (!initializedRef.current) {
      initMemoryCacheFromStorage(corretoraId);
      initializedRef.current = true;
    }

    // Inicializar cache para esta corretora
    if (!memoryCache[corretoraId]) {
      memoryCache[corretoraId] = {};
    }

    // Módulos a pré-carregar (TODOS disponíveis, incluindo o atual para cache)
    const modulesToPrefetch = availableModules.filter(m => 
      !hasPrefetchedData(corretoraId, m)
    );

    if (modulesToPrefetch.length === 0) return;

    // Pré-carregar cada módulo em segundo plano
    modulesToPrefetch.forEach((module, index) => {
      const cacheKey = `${corretoraId}-${module}`;
      
      // Evitar pré-carregar se já está em progresso
      if (prefetchedRef.current.has(cacheKey) || prefetchPromises[cacheKey]) return;
      
      prefetchedRef.current.add(cacheKey);
      
      // Priorizar o módulo atual, depois escalonar os outros
      const delay = module === currentModule ? 0 : (index + 1) * 300;
      
      setTimeout(() => {
        prefetchModule(corretoraId, module as any);
      }, delay);
    });
  }, [corretoraId, currentModule, availableModules]);

  return memoryCache[corretoraId || ''] || {};
}

// Hook para pré-carregar tudo ao entrar no portal
export function usePortalEagerPrefetch(
  corretoraId: string | undefined,
  availableModules: string[]
) {
  useEffect(() => {
    if (!corretoraId || availableModules.length === 0) return;

    // Restaurar do localStorage primeiro
    initMemoryCacheFromStorage(corretoraId);

    // Pré-carregar todos os módulos imediatamente
    availableModules.forEach((module, index) => {
      if (!hasPrefetchedData(corretoraId, module)) {
        setTimeout(() => {
          prefetchModule(corretoraId, module as any);
        }, index * 200); // Escalonar para não sobrecarregar
      }
    });
  }, [corretoraId, availableModules]);
}

async function prefetchModule(
  corretoraId: string,
  module: 'indicadores' | 'eventos' | 'mgf' | 'cobranca'
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
        case 'indicadores':
          // Indicadores não precisa de prefetch específico - marcamos como carregado
          if (!memoryCache[corretoraId]) memoryCache[corretoraId] = {};
          memoryCache[corretoraId].indicadores = true;
          break;
      }
      
      // Salvar no localStorage após carregar
      saveToStorage(corretoraId, memoryCache[corretoraId] || {});
      
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
    // Buscar apenas primeiros 2000 registros para preview mais completo
    const { data: eventos } = await supabase
      .from("sga_eventos")
      .select("*")
      .eq("importacao_id", importacao.id)
      .limit(2000);

    if (!memoryCache[corretoraId]) memoryCache[corretoraId] = {};
    memoryCache[corretoraId].eventos = eventos || [];
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
    const { data: mgf } = await supabase
      .from("mgf_dados")
      .select("*")
      .eq("importacao_id", importacao.id)
      .limit(2000);

    if (!memoryCache[corretoraId]) memoryCache[corretoraId] = {};
    memoryCache[corretoraId].mgf = mgf || [];
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
      .select("*")
      .eq("importacao_id", importacao.id)
      .limit(2000);

    if (!memoryCache[corretoraId]) memoryCache[corretoraId] = {};
    memoryCache[corretoraId].cobranca = boletos || [];
  }
}

// Função para limpar cache (útil ao trocar de associação)
export function clearPrefetchCache(corretoraId?: string) {
  if (corretoraId) {
    delete memoryCache[corretoraId];
    try {
      localStorage.removeItem(getStorageKey(corretoraId));
    } catch {}
  } else {
    Object.keys(memoryCache).forEach(key => delete memoryCache[key]);
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(STORAGE_KEY_PREFIX))
        .forEach(k => localStorage.removeItem(k));
    } catch {}
  }
}

// Função para verificar se dados já estão em cache
export function hasPrefetchedData(corretoraId: string, module: string): boolean {
  // Verificar memória primeiro
  if (memoryCache[corretoraId]?.[module as keyof ModuleData]) return true;
  
  // Tentar restaurar do localStorage
  const stored = loadFromStorage(corretoraId);
  if (stored?.[module as keyof ModuleData]) {
    memoryCache[corretoraId] = stored;
    return true;
  }
  
  return false;
}

// Função para obter dados do cache
export function getPrefetchedData<T>(corretoraId: string, module: string): T[] | null {
  // Verificar memória primeiro
  let data = memoryCache[corretoraId]?.[module as keyof ModuleData];
  
  // Tentar restaurar do localStorage se não estiver em memória
  if (!data) {
    const stored = loadFromStorage(corretoraId);
    if (stored) {
      memoryCache[corretoraId] = stored;
      data = stored[module as keyof ModuleData];
    }
  }
  
  return Array.isArray(data) ? data as T[] : null;
}
