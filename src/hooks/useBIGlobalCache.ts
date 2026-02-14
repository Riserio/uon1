/**
 * Cache global para dados dos módulos BI.
 * Armazena dados em memória para navegação instantânea entre módulos.
 * Os dados persistem enquanto a sessão do navegador estiver ativa.
 */

type BIModule = 'eventos' | 'mgf' | 'cobranca' | 'estudo-base' | 'indicadores';

interface CacheEntry {
  data: any[];
  importacao: any;
  timestamp: number;
  associacaoId: string;
}

interface AssociacoesCacheEntry {
  data: { id: string; nome: string; slug?: string | null }[];
  timestamp: number;
}

const biCache: Record<string, CacheEntry> = {};
let associacoesCache: AssociacoesCacheEntry | null = null;

// Tempo máximo de cache: 10 minutos
const CACHE_TTL = 10 * 60 * 1000;

function getCacheKey(associacaoId: string, module: BIModule): string {
  return `${associacaoId}::${module}`;
}

export function getBICachedData(associacaoId: string, module: BIModule): CacheEntry | null {
  const key = getCacheKey(associacaoId, module);
  const entry = biCache[key];
  if (!entry) return null;
  
  // Verificar se o cache expirou
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    delete biCache[key];
    return null;
  }
  
  return entry;
}

export function setBICachedData(associacaoId: string, module: BIModule, data: any[], importacao?: any) {
  const key = getCacheKey(associacaoId, module);
  biCache[key] = {
    data,
    importacao: importacao || null,
    timestamp: Date.now(),
    associacaoId,
  };
}

export function invalidateBICache(associacaoId?: string, module?: BIModule) {
  if (associacaoId && module) {
    delete biCache[getCacheKey(associacaoId, module)];
  } else if (associacaoId) {
    Object.keys(biCache).forEach(key => {
      if (key.startsWith(`${associacaoId}::`)) delete biCache[key];
    });
  } else {
    Object.keys(biCache).forEach(key => delete biCache[key]);
  }
}

// Cache de associações para navegação instantânea entre módulos BI
export function getCachedAssociacoes(): { id: string; nome: string; slug?: string | null }[] | null {
  if (!associacoesCache) return null;
  if (Date.now() - associacoesCache.timestamp > CACHE_TTL) {
    associacoesCache = null;
    return null;
  }
  return associacoesCache.data;
}

export function setCachedAssociacoes(data: { id: string; nome: string; slug?: string | null }[]) {
  associacoesCache = { data, timestamp: Date.now() };
}
