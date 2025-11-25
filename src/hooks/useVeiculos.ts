import { useState, useEffect, useMemo } from "react";
import marcasModelosData from "@/data/marcas_modelos.json";

export interface VeiculosData {
  [marca: string]: string[];
}

export function useVeiculos() {
  const [marcaSelecionada, setMarcaSelecionada] = useState<string>("");
  
  // Lista de todas as marcas (ordenada alfabeticamente com capitalização correta)
  const marcas = useMemo(() => {
    return Object.keys(marcasModelosData as VeiculosData)
      .map(marca => marca.charAt(0).toUpperCase() + marca.slice(1).toLowerCase())
      .sort();
  }, []);

  // Lista de modelos da marca selecionada (ordenada alfabeticamente com capitalização correta)
  const modelos = useMemo(() => {
    if (!marcaSelecionada) return [];
    const marcaOriginal = Object.keys(marcasModelosData as VeiculosData).find(
      m => m.toLowerCase() === marcaSelecionada.toLowerCase()
    );
    if (!marcaOriginal) return [];
    const modelosData = (marcasModelosData as VeiculosData)[marcaOriginal] || [];
    return modelosData.map(modelo => modelo.charAt(0).toUpperCase() + modelo.slice(1).toLowerCase()).sort();
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
