import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, FileText, CheckCircle2, XCircle, PenLine, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ContratoAssinatura() {
  const { token } = useParams<{ token: string }>();
  const [aceito, setAceito] = useState(false);
  const [assinando, setAssinando] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

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

  // Setup canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

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
          ip_assinatura: "browser",
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
        ip: "browser",
        user_agent: navigator.userAgent,
      });

      // Check if all signatures are done
      const allSigned = contrato.contrato_assinaturas.every(
        (a: any) => a.id === currentAssinatura.id || a.status === "assinado"
      );

      if (allSigned) {
        await supabase
          .from("contratos")
          .update({ status: "assinado" })
          .eq("id", contrato.id);
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
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>{contrato.titulo}</CardTitle>
                <CardDescription>
                  Contrato nº {contrato.numero} • Criado em {format(new Date(contrato.created_at), "dd/MM/yyyy", { locale: ptBR })}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Contract Content */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Documento</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="prose prose-sm max-w-none border rounded-lg p-4 bg-card max-h-[50vh] overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: contrato.conteudo_html }}
            />
          </CardContent>
        </Card>

        {/* Signature Area */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <PenLine className="h-5 w-5" />
              Assinatura de {currentAssinatura.nome}
            </CardTitle>
            <CardDescription>
              Desenhe sua assinatura no campo abaixo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-2 bg-white">
              <canvas
                ref={canvasRef}
                width={500}
                height={150}
                className="w-full cursor-crosshair touch-none"
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
              <Label htmlFor="aceitar" className="text-sm leading-relaxed">
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