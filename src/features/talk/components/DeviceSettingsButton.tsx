import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import { lk } from "../livekit";

type DeviceKind = "audioinput" | "videoinput" | "audiooutput";

const GROUPS: { kind: DeviceKind; label: string }[] = [
  { kind: "audioinput", label: "Microfone" },
  { kind: "videoinput", label: "Câmera" },
  { kind: "audiooutput", label: "Alto-falante" },
];

/** Troca de microfone/câmera/alto-falante durante a chamada (padrão Meet/Zoom) */
export default function DeviceSettingsButton({ buttonClass }: { buttonClass: string }) {
  const roomContext = lk.useRoomContext?.() || null;
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [active, setActive] = useState<Record<string, string>>({});

  const loadDevices = async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((d) => d.deviceId));
      if (roomContext?.getActiveDevice) {
        setActive({
          audioinput: roomContext.getActiveDevice("audioinput") || "",
          videoinput: roomContext.getActiveDevice("videoinput") || "",
          audiooutput: roomContext.getActiveDevice("audiooutput") || "",
        });
      }
    } catch (e) {
      console.warn("[Devices] enumerateDevices falhou:", e);
    }
  };

  const switchDevice = async (kind: DeviceKind, deviceId: string) => {
    try {
      await roomContext?.switchActiveDevice(kind, deviceId);
      setActive((a) => ({ ...a, [kind]: deviceId }));
      toast.success("Dispositivo alterado");
    } catch {
      toast.error("Não foi possível trocar o dispositivo");
    }
  };

  return (
    <Popover onOpenChange={(open) => open && loadDevices()}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button className={buttonClass} aria-label="Dispositivos">
              <Settings2 className="h-5 w-5" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top"><p>Dispositivos</p></TooltipContent>
      </Tooltip>
      <PopoverContent className="w-80" align="center" side="top">
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-sm mb-1">Dispositivos</h4>
            <p className="text-xs text-muted-foreground">Troque microfone, câmera e alto-falante sem sair da reunião</p>
          </div>
          {GROUPS.map(({ kind, label }) => {
            const options = devices.filter((d) => d.kind === kind);
            if (options.length === 0) return null;
            return (
              <div key={kind} className="space-y-1.5">
                <Label className="text-xs font-semibold">{label}</Label>
                <Select value={active[kind] || undefined} onValueChange={(v) => switchDevice(kind, v)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={`Selecionar ${label.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent className="z-[130]">
                    {options.map((d, i) => (
                      <SelectItem key={d.deviceId} value={d.deviceId} className="text-xs">
                        {d.label || `${label} ${i + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
