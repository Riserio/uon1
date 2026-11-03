import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import { Copy, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { slugify } from "./utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  titulo: string;
  subtitulo: string;
  link: string;
}

export function QrCodeDialog({ open, onOpenChange, titulo, subtitulo, link }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  const baixar = () => {
    const canvas = ref.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qrcode-${slugify(titulo)}.png`;
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">{subtitulo}</p>
        <div className="flex justify-center rounded-2xl border bg-white p-4">
          {/* Canvas grande para impressão; exibido reduzido. */}
          <QRCodeCanvas
            ref={ref}
            value={link}
            size={1024}
            marginSize={2}
            level="M"
            style={{ width: 240, height: 240 }}
          />
        </div>
        <p className="text-xs text-muted-foreground break-all text-center">{link}</p>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" size="sm" onClick={baixar}>
            <Download className="h-4 w-4 mr-1" /> PNG
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(link);
              toast.success("Link copiado");
            }}
          >
            <Copy className="h-4 w-4 mr-1" /> Link
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={link} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-1" /> Abrir
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
