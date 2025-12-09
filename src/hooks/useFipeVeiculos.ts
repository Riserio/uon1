import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import marcasModelosData from "@/data/marcas_modelos.json";

export interface FipeMarca {
  code: number;
  name: string;
}

export interface FipeModelo {
  code: number;
  name: string;
}

export interface FipeAno {
  code: string;
  name: string;
}

export interface FipeValor {
  price: string;
  brand: string;
  model: string;
  modelYear: number;
  fuel: string;
  codeFipe: string;
  month: string;
  year: number;
}

export interface VeiculosData {
  [marca: string]: string[];
}

const TIPO_VEICULO_MAP = {
  carro: 'carros' as const,
  moto: 'motos' as const,
  caminhao: 'caminhoes' as const,
};

export function useFipeVeiculos() {
  const [loading, setLoading] = useState(false);
  const [marcas, setMarcas] = useState<FipeMarca[]>([]);
  const [modelos, setModelos] = useState<FipeModelo[]>([]);
  const [anos, setAnos] = useState<FipeAno[]>([]);
  const [marcaSelecionada, setMarcaSelecionada] = useState<string>("");
  const [marcaCodigo, setMarcaCodigo] = useState<number | null>(null);
  const [modeloCodigo, setModeloCodigo] = useState<number | null>(null);

  // Fallback para marcas do JSON local
  // IMPORTANTE: Preservar nomes originais do JSON para distinguir "Ford" (carros) de "FORD" (caminhões)
  const getMarcasFromJSON = useCallback((tipoVeiculo: string) => {
    const allMarcas = Object.keys(marcasModelosData as VeiculosData).sort();
    
    return allMarcas.map((name, index) => ({
      code: index,
      name: name, // Manter nome original do JSON sem transformação
    }));
  }, []);

  // Fallback para modelos do JSON local
  // IMPORTANTE: Preservar nomes originais do JSON
  const getModelosFromJSON = useCallback((marca: string) => {
    // Buscar marca exata primeiro, depois case-insensitive como fallback
    let marcaOriginal = Object.keys(marcasModelosData as VeiculosData).find(
      m => m === marca
    );
    
    if (!marcaOriginal) {
      marcaOriginal = Object.keys(marcasModelosData as VeiculosData).find(
        m => m.toLowerCase() === marca.toLowerCase()
      );
    }
    
    if (!marcaOriginal) return [];
    
    const modelosData = (marcasModelosData as VeiculosData)[marcaOriginal] || [];
    return modelosData.map((nome, index) => ({
      code: index,
      name: nome, // Manter nome original sem transformação
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const consultarMarcas = useCallback(async (tipoVeiculo: string) => {
    const tipoFipe = TIPO_VEICULO_MAP[tipoVeiculo as keyof typeof TIPO_VEICULO_MAP];
    if (!tipoFipe) {
      console.error('Tipo de veículo inválido:', tipoVeiculo);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('consultar-fipe', {
        body: {
          tipo: tipoFipe,
          action: 'marcas',
        },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        // Ordenar marcas alfabeticamente
        const marcasOrdenadas = [...data.data].sort((a, b) => a.name.localeCompare(b.name));
        setMarcas(marcasOrdenadas);
      } else {
        throw new Error('Erro ao buscar marcas da FIPE');
      }
    } catch (error) {
      console.error('Erro ao consultar marcas FIPE, usando fallback:', error);
      // Usar JSON local como fallback
      const marcasFallback = getMarcasFromJSON(tipoVeiculo);
      setMarcas(marcasFallback);
      toast.info('Usando dados locais de marcas');
    } finally {
      setLoading(false);
    }
  }, [getMarcasFromJSON]);

  const consultarModelos = useCallback(async (
    tipoVeiculo: string,
    marcaCodigo: number,
    marcaNome?: string
  ) => {
    const tipoFipe = TIPO_VEICULO_MAP[tipoVeiculo as keyof typeof TIPO_VEICULO_MAP];
    if (!tipoFipe) return;

    setLoading(true);
    setMarcaCodigo(marcaCodigo);
    
    try {
      const { data, error } = await supabase.functions.invoke('consultar-fipe', {
        body: {
          tipo: tipoFipe,
          marcaCodigo: marcaCodigo.toString(),
          action: 'modelos',
        },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        // Ordenar modelos alfabeticamente
        const modelosOrdenados = [...data.data].sort((a, b) => a.name.localeCompare(b.name));
        setModelos(modelosOrdenados);
      } else {
        throw new Error('Erro ao buscar modelos da FIPE');
      }
    } catch (error) {
      console.error('Erro ao consultar modelos FIPE, usando fallback:', error);
      // Usar JSON local como fallback
      if (marcaNome) {
        const modelosFallback = getModelosFromJSON(marcaNome);
        setModelos(modelosFallback);
        toast.info('Usando dados locais de modelos');
      }
    } finally {
      setLoading(false);
    }
  }, [getModelosFromJSON]);

  const consultarAnos = useCallback(async (
    tipoVeiculo: string,
    marcaCodigo: number,
    modeloCodigo: number
  ) => {
    const tipoFipe = TIPO_VEICULO_MAP[tipoVeiculo as keyof typeof TIPO_VEICULO_MAP];
    if (!tipoFipe) return;

    setLoading(true);
    setModeloCodigo(modeloCodigo);
    
    try {
      const { data, error } = await supabase.functions.invoke('consultar-fipe', {
        body: {
          tipo: tipoFipe,
          marcaCodigo: marcaCodigo.toString(),
          modeloCodigo: modeloCodigo.toString(),
          action: 'anos',
        },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        setAnos(data.data);
      } else {
        throw new Error('Erro ao buscar anos da FIPE');
      }
    } catch (error) {
      console.error('Erro ao consultar anos FIPE:', error);
      toast.error('Erro ao buscar anos disponíveis');
      setAnos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const consultarValor = useCallback(async (
    tipoVeiculo: string,
    marcaCodigo: number,
    modeloCodigo: number,
    anoCodigo: string
  ): Promise<FipeValor | null> => {
    const tipoFipe = TIPO_VEICULO_MAP[tipoVeiculo as keyof typeof TIPO_VEICULO_MAP];
    if (!tipoFipe) return null;

    setLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('consultar-fipe', {
        body: {
          tipo: tipoFipe,
          marcaCodigo: marcaCodigo.toString(),
          modeloCodigo: modeloCodigo.toString(),
          anoCodigo,
          action: 'valor',
        },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        toast.success('Valor FIPE consultado com sucesso!');
        return data.data;
      } else {
        throw new Error('Erro ao buscar valor da FIPE');
      }
    } catch (error) {
      console.error('Erro ao consultar valor FIPE:', error);
      toast.error('Erro ao consultar valor FIPE');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const resetModelos = useCallback(() => {
    setModelos([]);
    setModeloCodigo(null);
    setAnos([]);
  }, []);

  const resetAnos = useCallback(() => {
    setAnos([]);
  }, []);

  return {
    loading,
    marcas,
    modelos,
    anos,
    marcaSelecionada,
    setMarcaSelecionada,
    marcaCodigo,
    modeloCodigo,
    consultarMarcas,
    consultarModelos,
    consultarAnos,
    consultarValor,
    resetModelos,
    resetAnos,
  };
}