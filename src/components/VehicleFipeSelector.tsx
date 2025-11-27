import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  showFipeButton?: boolean; // Nova prop para controlar exibição do botão FIPE
  showOnlySelectors?: boolean; // Nova prop para mostrar apenas os seletores
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
  showFipeButton = true,
  showOnlySelectors = false,
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
  const [showManualInput, setShowManualInput] = useState(false);

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
    const marcaObj = marcas.find((m) => m.name === value);
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
      const modeloObj = modelos.find((m) => m.name === value);
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

    // Encontrar códigos atuais no momento da consulta
    const marcaObj = marcas.find((m) => m.name === marca);
    const modeloObj = modelos.find((m) => m.name === modelo);
    const anoObj = anos.find((a) => a.name.includes(ano));

    if (!marcaObj || !modeloObj) {
      toast.error("Dados de marca/modelo não carregados. Aguarde o carregamento.");
      return;
    }

    if (!anoObj) {
      toast.error("Ano não encontrado");
      return;
    }

    setConsultingFipe(true);
    try {
      const resultado = await consultarValor(vehicleType, marcaObj.code, modeloObj.code, anoObj.code);

      if (resultado && onValorFipeChange && onDataConsultaFipeChange && onCodigoFipeChange) {
        // Extrair valor numérico do preço (remover R$ e converter)
        const valorNumerico = parseFloat(resultado.price.replace(/[^\d,]/g, "").replace(",", "."));

        onValorFipeChange(valorNumerico);
        onDataConsultaFipeChange(new Date());
        onCodigoFipeChange(resultado.codeFipe);
        setShowManualInput(false);
      }
    } catch (error) {
      console.error("Erro ao consultar FIPE:", error);
      toast.error("Não foi possível consultar FIPE. Insira o valor manualmente.");
      setShowManualInput(true);
    } finally {
      setConsultingFipe(false);
    }
  };

  return (
    <div className="space-y-4">
      {!showOnlySelectors && (
        <>
          <VehicleTypeSelector value={vehicleType} onChange={handleVehicleTypeChange} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SearchableVehicleSelect
              label="Marca"
              options={marcas.map((m) => m.name)}
              value={marca}
              onChange={handleMarcaChange}
              placeholder="Selecione a marca"
              disabled={disabled || loading}
              vehicleType={vehicleType}
            />

            <SearchableVehicleSelect
              label="Modelo"
              options={modelos.map((m) => m.name)}
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
              options={anos.map((a) => a.name)}
              value={ano || ""}
              onChange={handleAnoChange}
              placeholder="Selecione o ano"
              disabled={disabled || !modelo || loading}
              vehicleType={vehicleType}
            />
          )}
        </>
      )}

      {showFipeButton && onValorFipeChange && onDataConsultaFipeChange && (
        <>
          <FipeConsultButton
            onConsult={handleConsultarFipe}
            disabled={disabled || !vehicleType || !marca || !modelo || !ano}
            loading={consultingFipe}
            valorFipe={valorFipe}
            dataConsulta={dataConsultaFipe}
          />

          {/* Campo de entrada manual de valor FIPE - aparece após erro ou se já tem valor */}
          {showManualInput && !valorFipe && (
            <div className="space-y-2">
              <Label>Valor FIPE (Manual)</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Valor FIPE (R$)"
                    value={valorFipe || ""}
                    onChange={(e) => {
                      const value = e.target.value ? parseFloat(e.target.value) : null;
                      onValorFipeChange(value);
                      if (value) {
                        onDataConsultaFipeChange(new Date());
                      }
                    }}
                    disabled={disabled}
                  />
                </div>
              </div>
              {valorFipe && dataConsultaFipe && (
                <p className="text-xs text-muted-foreground">
                  Inserido em: {new Date(dataConsultaFipe).toLocaleString("pt-BR")}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
