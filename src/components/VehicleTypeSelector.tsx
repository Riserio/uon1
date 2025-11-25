import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Car, Bike, Truck } from "lucide-react";

interface VehicleTypeSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export function VehicleTypeSelector({ value, onChange }: VehicleTypeSelectorProps) {
  return (
    <div className="space-y-3">
      <Label className="text-base font-semibold">Tipo de Veículo</Label>
      <RadioGroup value={value} onValueChange={onChange} className="grid grid-cols-3 gap-4">
        <div>
          <RadioGroupItem value="carro" id="carro" className="peer sr-only" />
          <Label
            htmlFor="carro"
            className="flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
          >
            <Car className="mb-2 h-6 w-6" />
            <span className="text-sm font-medium">Carro</span>
          </Label>
        </div>
        <div>
          <RadioGroupItem value="moto" id="moto" className="peer sr-only" />
          <Label
            htmlFor="moto"
            className="flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
          >
            <Bike className="mb-2 h-6 w-6" />
            <span className="text-sm font-medium">Moto</span>
          </Label>
        </div>
        <div>
          <RadioGroupItem value="caminhao" id="caminhao" className="peer sr-only" />
          <Label
            htmlFor="caminhao"
            className="flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
          >
            <Truck className="mb-2 h-6 w-6" />
            <span className="text-sm font-medium">Caminhão</span>
          </Label>
        </div>
      </RadioGroup>
    </div>
  );
}
