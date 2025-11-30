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

      // Mapear tipo de sinistro para o tipo no banco
      const tipoDb = mapTipoSinistro(tipoSinistro);

      // Carregar categorias
      const { data: categoriasData, error: categoriasError } = await supabase
        .from('sinistro_pergunta_categorias')
        .select('*')
        .eq('tipo_sinistro', tipoDb)
        .eq('ativo', true)
        .order('ordem');

      if (categoriasError) throw categoriasError;

      // Carregar perguntas
      const { data: perguntasData, error: perguntasError } = await supabase
        .from('sinistro_perguntas')
        .select('*')
        .eq('tipo_sinistro', tipoDb)
        .eq('ativo', true)
        .order('ordem');

      if (perguntasError) throw perguntasError;

      const perguntasTyped: SinistroPergunta[] = (perguntasData || []).map(p => ({
        ...p,
        opcoes: p.opcoes as string[] | null,
      }));

      const categoriasComPerguntas: SinistroPerguntaCategoria[] = (categoriasData || []).map(cat => ({
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

export function mapTipoSinistro(tipo: string): string {
  const tipoLower = (tipo || '').toLowerCase().trim();
  
  if (tipoLower.includes('colisão') || tipoLower.includes('colisao')) return 'colisao';
  if (tipoLower.includes('roubo') || tipoLower.includes('furto')) return 'roubo_furto';
  if (tipoLower.includes('vidro')) return 'vidros';
  if (tipoLower.includes('dano') && tipoLower.includes('natureza')) return 'colisao';
  if (tipoLower.includes('incêndio') || tipoLower.includes('incendio')) return 'colisao';
  if (tipoLower.includes('perda total')) return 'colisao';
  
  return 'colisao'; // default
}

export function calcularPesoRespostas(
  respostas: Record<string, string>,
  perguntas: SinistroPergunta[]
): { total: number; maxPossivel: number; percentual: number; alertas: string[] } {
  let total = 0;
  let maxPossivel = 0;
  const alertas: string[] = [];

  perguntas.forEach(pergunta => {
    const resposta = respostas[pergunta.id];
    
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
