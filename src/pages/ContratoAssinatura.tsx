import { useState, useEffect, useRef, useCallback } from "react";
import DOMPurify from "dompurify";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, FileText, CheckCircle2, XCircle, PenLine, AlertCircle, Clock } from "lucide-react";
import { format, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ContratoAssinatura() {
  const { token } = useParams<{ token: string }>();
  const [aceito, setAceito] = useState(false);
  const [assinando, setAssinando] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 500, height: 150 });

  // Fetch contrato by token
  const { data: contrato, isLoading, error, refetch } = useQuery({
    queryKey: ["contrato-publico", token],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratos")
        .select(`
          *,
          contrato_assinaturas(*)
        `)
        .eq("link_token", token)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) throw new Error("Contrato não encontrado");
      return data;
    },
    enabled: !!token,
  });

  // Get current signatory (first pending one for this token)
  const currentAssinatura = contrato?.contrato_assinaturas?.find(
    (a: any) => a.status === "pendente"
  );

  // Resize canvas based on container
  useEffect(() => {
    const updateCanvasSize = () => {
      const container = canvasRef.current?.parentElement;
      if (container) {
        const containerWidth = container.clientWidth - 16; // padding
        const newWidth = Math.min(containerWidth, 600);
        const newHeight = Math.round(newWidth * 0.3);
        setCanvasSize({ width: newWidth, height: newHeight });
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  // Setup canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set actual canvas dimensions
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [canvasSize]);

  const getCoordinates = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    } else {
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, [getCoordinates]);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  }, [isDrawing, getCoordinates]);

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const assinar = useMutation({
    mutationFn: async () => {
      if (!contrato || !currentAssinatura) throw new Error("Contrato inválido");
      if (!hasSignature) throw new Error("Por favor, assine no campo abaixo");
      if (!aceito) throw new Error("Você deve aceitar os termos do contrato");

      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Erro ao capturar assinatura");

      const assinaturaDataUrl = canvas.toDataURL("image/png");

      // Get location
      let latitude: number | null = null;
      let longitude: number | null = null;

      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
      } catch (e) {
        console.log("Geolocation not available");
      }

      // Get IP (try to get real IP via external service)
      let ipAddress = "N/A";
      try {
        const ipResponse = await fetch("https://api.ipify.org?format=json");
        const ipData = await ipResponse.json();
        ipAddress = ipData.ip;
      } catch (e) {
        console.log("Could not get IP");
      }

      // Generate hash
      const encoder = new TextEncoder();
      const data = encoder.encode(contrato.conteudo_html + currentAssinatura.id + new Date().toISOString());
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

      // Update assinatura
      const { error } = await supabase
        .from("contrato_assinaturas")
        .update({
          status: "assinado",
          assinado_em: new Date().toISOString(),
          assinatura_url: assinaturaDataUrl,
          ip_assinatura: ipAddress,
          latitude,
          longitude,
          hash_documento: hashHex,
          user_agent: navigator.userAgent,
        })
        .eq("id", currentAssinatura.id);

      if (error) throw error;

      // Log history
      await supabase.from("contrato_historico").insert({
        contrato_id: contrato.id,
        acao: "assinado",
        descricao: `Contrato assinado por ${currentAssinatura.nome}`,
        ip: ipAddress,
        user_agent: navigator.userAgent,
      });

      // Check if all signatures are done - fetch fresh data
      const { data: freshAssinaturas, error: fetchError } = await supabase
        .from("contrato_assinaturas")
        .select("*")
        .eq("contrato_id", contrato.id);

      if (fetchError) {
        console.error("Erro ao buscar assinaturas:", fetchError);
      }

      console.log("Fresh assinaturas:", freshAssinaturas);
      
      const allSigned = freshAssinaturas && freshAssinaturas.length > 0 && 
        freshAssinaturas.every((a: any) => a.status === "assinado");

      console.log("All signed:", allSigned);

      if (allSigned) {
        const { error: updateError } = await supabase
          .from("contratos")
          .update({ status: "assinado" })
          .eq("id", contrato.id);
          
        if (updateError) {
          console.error("Erro ao atualizar status do contrato:", updateError);
        } else {
          console.log("Status do contrato atualizado para assinado");
        }
      }

      return true;
    },
    onSuccess: () => {
      toast.success("Contrato assinado com sucesso!");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !contrato) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Contrato não encontrado</h2>
            <p className="text-muted-foreground">
              O link de assinatura é inválido ou expirou.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if link is expired
  if (contrato.link_expires_at && isPast(new Date(contrato.link_expires_at))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Clock className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Link Expirado</h2>
            <p className="text-muted-foreground">
              O prazo para assinatura deste contrato expirou em{" "}
              {format(new Date(contrato.link_expires_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Entre em contato com o remetente para solicitar um novo link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const allSigned = contrato.contrato_assinaturas?.every((a: any) => a.status === "assinado");

  if (allSigned) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Contrato Assinado</h2>
            <p className="text-muted-foreground">
              Todas as assinaturas foram coletadas com sucesso.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentAssinatura) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Aguardando</h2>
            <p className="text-muted-foreground">
              Este contrato está aguardando outras assinaturas.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-2 sm:p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <div className="flex items-start sm:items-center gap-3 flex-col sm:flex-row">
              <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-primary flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <CardTitle className="text-lg sm:text-xl break-words">{contrato.titulo}</CardTitle>
                <CardDescription className="text-sm">
                  Contrato nº {contrato.numero} • Criado em {format(new Date(contrato.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  {contrato.link_expires_at && (
                    <span className="block sm:inline sm:ml-2 text-amber-600">
                      • Expira em {format(new Date(contrato.link_expires_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  )}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Contract Content */}
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2">
            <CardTitle className="text-base sm:text-lg">Documento</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-2 sm:pt-2">
            <div
              className="prose prose-sm max-w-none border rounded-lg p-3 sm:p-4 bg-card max-h-[40vh] sm:max-h-[50vh] overflow-y-auto text-sm"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(contrato.conteudo_html) }}
            />
          </CardContent>
        </Card>

        {/* Signature Area */}
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <PenLine className="h-4 w-4 sm:h-5 sm:w-5" />
              Assinatura de {currentAssinatura.nome}
            </CardTitle>
            <CardDescription className="text-sm">
              Desenhe sua assinatura no campo abaixo
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-2 sm:pt-2 space-y-4">
            <div className="border-2 border-dashed rounded-lg p-2 bg-white overflow-hidden">
              <canvas
                ref={canvasRef}
                style={{
                  width: '100%',
                  height: `${canvasSize.height}px`,
                  touchAction: 'none'
                }}
                className="cursor-crosshair block"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
            </div>
            <Button variant="outline" size="sm" onClick={clearSignature}>
              Limpar Assinatura
            </Button>

            <div className="flex items-start gap-2">
              <Checkbox
                id="aceitar"
                checked={aceito}
                onCheckedChange={(checked) => setAceito(checked === true)}
              />
              <Label htmlFor="aceitar" className="text-xs sm:text-sm leading-relaxed">
                Li e aceito os termos do contrato. Estou ciente de que esta assinatura
                digital tem validade jurídica conforme a legislação brasileira.
              </Label>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={() => assinar.mutate()}
              disabled={assinar.isPending || !hasSignature || !aceito}
            >
              {assinar.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PenLine className="h-4 w-4 mr-2" />
              )}
              Assinar Contrato
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}