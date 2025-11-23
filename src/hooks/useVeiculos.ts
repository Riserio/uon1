import { useState, useEffect, useMemo } from "react";
import marcasModelosData from "@/data/marcas_modelos.json";

export interface VeiculosData {
  [marca: string]: string[];
}

export function useVeiculos() {
  const [marcaSelecionada, setMarcaSelecionada] = useState<string>("");
  
  // Lista de todas as marcas (ordenada alfabeticamente)
  const marcas = useMemo(() => {
    return Object.keys(marcasModelosData as VeiculosData).sort();
  }, []);

  // Lista de modelos da marca selecionada (ordenada alfabeticamente)
  const modelos = useMemo(() => {
    if (!marcaSelecionada) return [];
    const modelosData = (marcasModelosData as VeiculosData)[marcaSelecionada] || [];
    return modelosData.sort();
  }, [marcaSelecionada]);

  const resetModelos = () => {
    setMarcaSelecionada("");
  };

  return {
    marcas,
    modelos,
    marcaSelecionada,
    setMarcaSelecionada,
    resetModelos,
  };
}
