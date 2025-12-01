import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SinistroPergunta {
  id: string;
  categoria_id: string;
  tipo_sinistro: string;
  pergunta: string;
  tipo_campo: string;
  opcoes: string[] | null;
  peso: number;
  peso_positivo: string[] | null;
  peso_negativo: string[] | null;
  obrigatoria: boolean;
  ordem: number;
  auto_preenchivel: string | null;
  nivel_alerta: string | null;
  ativo: boolean;
  categoria_nome?: string;
}

export interface SinistroPerguntaCategoria {
  id: string;
  tipo_sinistro: string;
  nome: string;
  ordem: number;
  ativo: boolean;
  perguntas?: SinistroPergunta[];
}

export function useSinistroPerguntas(tipoSinistro?: string) {
  const [categorias, setCategorias] = useState<SinistroPerguntaCategoria[]>([]);
  const [perguntas, setPerguntas] = useState<SinistroPergunta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPerguntas = async () => {
    if (!tipoSinistro) {
      setCategorias([]);
      setPerguntas([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Normalizar tipo para busca EXATA - sem fallbacks
      const tipoNormalizado = normalizeTipoSinistro(tipoSinistro);

      console.log('🔍 Buscando perguntas para tipo:', tipoSinistro, '-> normalizado:', tipoNormalizado);

      // Carregar categorias - buscar APENAS pelo tipo normalizado exato
      const { data: categoriasData, error: categoriasError } = await supabase
        .from('sinistro_pergunta_categorias')
        .select('*')
        .ilike('tipo_sinistro', tipoNormalizado)
        .eq('ativo', true)
        .order('ordem');

      if (categoriasError) throw categoriasError;

      console.log('📁 Categorias encontradas:', categoriasData?.length || 0);

      // Carregar perguntas - buscar APENAS pelo tipo normalizado exato
      const { data: perguntasData, error: perguntasError } = await supabase
        .from('sinistro_perguntas')
        .select('*')
        .ilike('tipo_sinistro', tipoNormalizado)
        .eq('ativo', true)
        .order('ordem');

      if (perguntasError) throw perguntasError;

      console.log('❓ Perguntas encontradas:', perguntasData?.length || 0);

      const perguntasTyped: SinistroPergunta[] = (perguntasData || []).map(p => ({
        ...p,
        opcoes: p.opcoes as string[] | null,
      }));

      // Filtrar categorias que têm perguntas associadas
      const categoriaIdsComPerguntas = new Set(perguntasTyped.map(p => p.categoria_id));
      
      const categoriasComPerguntas: SinistroPerguntaCategoria[] = (categoriasData || [])
        .filter(cat => categoriaIdsComPerguntas.has(cat.id))
        .map(cat => ({
          ...cat,
          perguntas: perguntasTyped.filter(p => p.categoria_id === cat.id)
        }));

      setCategorias(categoriasComPerguntas);
      setPerguntas(perguntasTyped);
    } catch (err) {
      console.error('Erro ao carregar perguntas:', err);
      setError('Erro ao carregar perguntas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPerguntas();
  }, [tipoSinistro]);

  return { categorias, perguntas, loading, error, reload: loadPerguntas };
}

// Normaliza o tipo de sinistro para um formato padronizado de busca
// Retorna o padrão EXATO que deve existir no banco - sem fallbacks
export function normalizeTipoSinistro(tipo: string): string {
  const tipoLower = (tipo || '').toLowerCase().trim();
  
  // Colisão - aceita variantes mas retorna padrão
  if (tipoLower.includes('colisão') || tipoLower.includes('colisao')) {
    return 'colisao';
  }
  
  // Roubo
  if (tipoLower === 'roubo' || tipoLower.includes('roubo')) {
    return 'roubo';
  }
  
  // Furto  
  if (tipoLower === 'furto' || tipoLower.includes('furto')) {
    return 'furto';
  }
  
  // Roubo/Furto combinado
  if (tipoLower.includes('roubo') && tipoLower.includes('furto')) {
    return 'roubo_furto';
  }
  
  // Vidros
  if (tipoLower.includes('vidro')) {
    return 'vidros';
  }
  
  // Danos da Natureza
  if (tipoLower.includes('dano') && tipoLower.includes('natureza')) {
    return 'danos_natureza';
  }
  
  // Incêndio
  if (tipoLower.includes('incêndio') || tipoLower.includes('incendio')) {
    return 'incendio';
  }
  
  // Perda Total
  if (tipoLower.includes('perda total')) {
    return 'perda_total';
  }
  
  // Retorna o tipo original em minúsculas - SEM FALLBACK para colisão
  return tipoLower;
}

// Função legada mantida para compatibilidade
export function getTipoVariants(tipo: string): string[] {
  const normalizado = normalizeTipoSinistro(tipo);
  return [normalizado];
}

export function mapTipoSinistro(tipo: string): string {
  return normalizeTipoSinistro(tipo);
}

export function calcularPesoRespostas(
  respostas: Record<string, string>,
  perguntas: SinistroPergunta[]
): { total: number; maxPossivel: number; percentual: number; alertas: string[] } {
  let total = 0;
  let maxPossivel = 0;
  const alertas: string[] = [];

  // FILTRAR: considerar APENAS respostas de perguntas que existem no array de perguntas
  const perguntaIds = new Set(perguntas.map(p => p.id));

  perguntas.forEach(pergunta => {
    const resposta = respostas[pergunta.id];
    
    // Ignorar se a pergunta não está na lista válida
    if (!perguntaIds.has(pergunta.id)) return;
    
    if (pergunta.peso > 0) {
      maxPossivel += pergunta.peso;
      
      if (resposta) {
        // Verificar se é resposta positiva ou negativa
        if (pergunta.peso_positivo?.includes(resposta)) {
          total += pergunta.peso;
        } else if (pergunta.peso_negativo?.includes(resposta)) {
          // Peso negativo
          if (pergunta.nivel_alerta === 'passivel_negativa') {
            alertas.push(`⚠️ ${pergunta.pergunta}: ${resposta}`);
          }
        }
      }
    }
  });

  return {
    total,
    maxPossivel,
    percentual: maxPossivel > 0 ? (total / maxPossivel) * 100 : 0,
    alertas
  };
}
