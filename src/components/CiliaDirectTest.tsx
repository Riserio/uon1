import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CiliaDirectTestProps {
  baseUrl: string;
  authToken: string;
  integrationId: string;
}

export const CiliaDirectTest = ({ baseUrl, authToken, integrationId }: CiliaDirectTestProps) => {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const testDirectConnection = async () => {
    setTesting(true);
    setResult(null);

    try {
      const endpoint = `${baseUrl.replace(/\/$/, '')}/services/generico-ws/rest/v2/integracao/createBudget`;
      
      // Payload de teste completo
      const testPayload = {
        integrationNumber: `TESTE-${Date.now()}`,
        licensePlate: "ABC-1234",
        vehicleName: "VW GOL 1.0 2015",
        budgetDate: new Date().toISOString().split('T')[0],
        workshopCnpj: "00000000000000",
        workshopName: "Oficina Teste",
        clientName: "Cliente Teste",
        clientCpf: "00000000000",
        clientPhone: "(11) 99999-9999",
        eventDate: new Date().toISOString().split('T')[0],
        eventDescription: "Teste de integração CILIA via navegador"
      };

      console.log("🧪 TESTE DIRETO CILIA - Chamada do navegador", {
        endpoint,
        tokenLength: authToken.length,
        payload: testPayload
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authToken': authToken.trim().replace(/^["']|["']$/g, ''),
        },
        body: JSON.stringify(testPayload)
      });

      const responseText = await response.text();
      let responseData;
      
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
      }

      console.log("🧪 TESTE DIRETO CILIA - Resposta", {
        status: response.status,
        statusText: response.statusText,
        data: responseData
      });

      if (response.ok || response.status === 201) {
        setResult({
          success: true,
          status: response.status,
          message: "✅ Conexão CILIA funcionando! Token e payload estão corretos.",
          data: responseData
        });
        toast.success("Teste direto CILIA bem-sucedido!");
      } else {
        setResult({
          success: false,
          status: response.status,
          message: response.status === 401 
            ? "❌ Falha de autenticação - Token inválido ou expirado"
            : `❌ Erro ${response.status} - ${response.statusText}`,
          data: responseData
        });
        toast.error("Teste direto CILIA falhou");
      }

    } catch (error: any) {
      console.error("🧪 TESTE DIRETO CILIA - Erro", error);
      
      setResult({
        success: false,
        message: "❌ Erro de CORS ou Rede - A CILIA pode estar bloqueando chamadas diretas do navegador",
        error: error.message,
        note: "Se houver erro de CORS, significa que a CILIA não aceita chamadas diretas do frontend. Neste caso, a integração via Edge Function é obrigatória."
      });
      toast.error("Erro ao testar CILIA diretamente");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Alert className="border-warning bg-warning/10">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <AlertDescription className="text-sm">
          <strong>⚠️ TESTE TEMPORÁRIO:</strong> Este método expõe o token no navegador e deve ser usado APENAS para validação.
          Após confirmar que token/payload funcionam, remova este componente e resolva o whitelist de IP com CILIA.
        </AlertDescription>
      </Alert>

      <Button
        onClick={testDirectConnection}
        disabled={testing}
        variant="outline"
        className="w-full"
      >
        {testing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Testando conexão direta...
          </>
        ) : (
          "🧪 Testar CILIA Direto (Temporário)"
        )}
      </Button>

      {result && (
        <div className={`p-4 rounded-lg border ${
          result.success 
            ? 'bg-success/10 border-success' 
            : 'bg-destructive/10 border-destructive'
        }`}>
          <h4 className="font-semibold mb-2">{result.message}</h4>
          <pre className="text-xs bg-background/50 p-2 rounded overflow-auto max-h-96">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
