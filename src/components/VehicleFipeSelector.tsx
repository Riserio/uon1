import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { VehicleTypeSelector } from "@/components/VehicleTypeSelector";
import { SearchableVehicleSelect } from "@/components/SearchableVehicleSelect";
import { FipeConsultButton } from "@/components/FipeConsultButton";
import { useFipeVeiculos } from "@/hooks/useFipeVeiculos";
import { toast } from "sonner";

interface VehicleFipeSelectorProps {
  vehicleType: string;
  onVehicleTypeChange: (value: string) => void;
  marca: string;
  onMarcaChange: (value: string) => void;
  modelo: string;
  onModeloChange: (value: string) => void;
  ano?: string;
  onAnoChange?: (value: string) => void;
  valorFipe?: number | null;
  onValorFipeChange?: (value: number | null) => void;
  dataConsultaFipe?: Date | string | null;
  onDataConsultaFipeChange?: (value: Date | null) => void;
  codigoFipe?: string | null;
  onCodigoFipeChange?: (value: string | null) => void;
  disabled?: boolean;
}

export function VehicleFipeSelector({
  vehicleType,
  onVehicleTypeChange,
  marca,
  onMarcaChange,
  modelo,
  onModeloChange,
  ano,
  onAnoChange,
  valorFipe,
  onValorFipeChange,
  dataConsultaFipe,
  onDataConsultaFipeChange,
  codigoFipe,
  onCodigoFipeChange,
  disabled = false,
}: VehicleFipeSelectorProps) {
  const {
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
  } = useFipeVeiculos();

  const [consultingFipe, setConsultingFipe] = useState(false);

  // Carregar marcas quando o tipo de veículo mudar
  useEffect(() => {
    if (vehicleType) {
      consultarMarcas(vehicleType);
    }
  }, [vehicleType]);

  // Sincronizar marca selecionada
  useEffect(() => {
    if (marca && marca !== marcaSelecionada) {
      setMarcaSelecionada(marca);
    }
  }, [marca]);

  const handleVehicleTypeChange = (value: string) => {
    onVehicleTypeChange(value);
    onMarcaChange("");
    onModeloChange("");
    if (onAnoChange) onAnoChange("");
    resetModelos();
    resetAnos();
  };

  const handleMarcaChange = (value: string) => {
    onMarcaChange(value);
    onModeloChange("");
    if (onAnoChange) onAnoChange("");
    
    // Encontrar código da marca selecionada
    const marcaObj = marcas.find(m => m.name === value);
    if (marcaObj && vehicleType) {
      consultarModelos(vehicleType, marcaObj.code, value);
    }
    resetAnos();
  };

  const handleModeloChange = (value: string) => {
    onModeloChange(value);
    if (onAnoChange) onAnoChange("");
    
    // Carregar anos quando modelo for selecionado
    if (marcaCodigo !== null && vehicleType) {
      const modeloObj = modelos.find(m => m.name === value);
      if (modeloObj) {
        consultarAnos(vehicleType, marcaCodigo, modeloObj.code);
      }
    }
  };

  const handleAnoChange = (value: string) => {
    if (onAnoChange) {
      onAnoChange(value);
    }
  };

  const handleConsultarFipe = async () => {
    if (!vehicleType || !marca || !modelo || !ano) {
      toast.error("Selecione tipo de veículo, marca, modelo e ano para consultar FIPE");
      return;
    }

    if (marcaCodigo === null || modeloCodigo === null) {
      toast.error("Dados de marca/modelo não carregados corretamente");
      return;
    }

    // Encontrar código do ano
    const anoObj = anos.find(a => a.name.includes(ano));
    if (!anoObj) {
      toast.error("Ano não encontrado");
      return;
    }

    setConsultingFipe(true);
    try {
      const resultado = await consultarValor(vehicleType, marcaCodigo, modeloCodigo, anoObj.code);
      
      if (resultado && onValorFipeChange && onDataConsultaFipeChange && onCodigoFipeChange) {
        // Extrair valor numérico do preço (remover R$ e converter)
        const valorNumerico = parseFloat(resultado.price.replace(/[^\d,]/g, '').replace(',', '.'));
        
        onValorFipeChange(valorNumerico);
        onDataConsultaFipeChange(new Date());
        onCodigoFipeChange(resultado.codeFipe);
      }
    } catch (error) {
      console.error("Erro ao consultar FIPE:", error);
      toast.error("Erro ao consultar valor FIPE");
    } finally {
      setConsultingFipe(false);
    }
  };

  return (
    <div className="space-y-4">
      <VehicleTypeSelector
        value={vehicleType}
        onChange={handleVehicleTypeChange}
      />

      <div className="grid grid-cols-2 gap-4">
        <SearchableVehicleSelect
          label="Marca"
          options={marcas.map(m => m.name)}
          value={marca}
          onChange={handleMarcaChange}
          placeholder="Selecione a marca"
          disabled={disabled || !vehicleType || loading}
          vehicleType={vehicleType}
        />

        <SearchableVehicleSelect
          label="Modelo"
          options={modelos.map(m => m.name)}
          value={modelo}
          onChange={handleModeloChange}
          placeholder="Selecione o modelo"
          disabled={disabled || !marca || loading}
          vehicleType={vehicleType}
        />
      </div>

      {onAnoChange && (
        <SearchableVehicleSelect
          label="Ano"
          options={anos.map(a => a.name)}
          value={ano || ""}
          onChange={handleAnoChange}
          placeholder="Selecione o ano"
          disabled={disabled || !modelo || loading}
          vehicleType={vehicleType}
        />
      )}

      {onValorFipeChange && onDataConsultaFipeChange && (
        <FipeConsultButton
          onConsult={handleConsultarFipe}
          disabled={disabled || !vehicleType || !marca || !modelo || !ano}
          loading={consultingFipe}
          valorFipe={valorFipe}
          dataConsulta={dataConsultaFipe}
        />
      )}
    </div>
  );
}
