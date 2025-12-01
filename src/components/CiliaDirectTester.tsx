import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";

export default function CiliaDirectTester() {
  const [baseUrl, setBaseUrl] = useState("https://sistema.cilia.com.br");
  const [authToken, setAuthToken] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const testCiliaDirectly = async () => {
    setTesting(true);
    setResult(null);

    try {
      const ciliaUrl = `${baseUrl.replace(/\/$/, "")}/services/generico-ws/rest/v2/integracao/createBudget`;
      
      console.log("🔥 TESTE DIRETO CILIA - URL:", ciliaUrl);
      console.log("🔥 Token length:", authToken.length);

      const testPayload = {
        Budget: {
          numeroSinistro: `TESTE-${Date.now()}`,
          dataAbertura: new Date().toISOString(),
          status: "Teste",
          veiculo: {
            marca: "Volkswagen",
            modelo: "Gol",
            placa: "ABC-1234"
          }
        }
      };

      const response = await fetch(ciliaUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "authToken": authToken.trim(),
          "Accept": "application/json",
        },
        body: JSON.stringify(testPayload),
      });

      const responseText = await response.text();
      let responseData;
      
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { raw: responseText };
      }

      const result = {
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseData,
        payload: testPayload
      };

      console.log("🔥 RESULTADO:", result);
      setResult(result);

    } catch (error: any) {
      console.error("🔥 ERRO:", error);
      setResult({
        success: false,
        error: error.message,
        stack: error.stack
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <Alert variant="destructive" className="border-red-600 bg-red-50">
        <AlertTriangle className="h-5 w-5" />
        <AlertDescription className="text-red-900 font-semibold">
          ⚠️ AVISO CRÍTICO DE SEGURANÇA ⚠️
          <br />
          Este teste expõe o token CILIA diretamente no frontend.
          <br />
          <strong>NUNCA USE EM PRODUÇÃO!</strong> Apenas para validação temporária.
          <br />
          O token ficará visível no código JavaScript e pode ser roubado.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🔥 Teste DIRETO CILIA (Bypass Edge Function)
          </CardTitle>
          <CardDescription>
            Este testador chama a API CILIA diretamente do browser, ignorando o Edge Function.
            Você verá se o problema é o IP do Edge Function ou o token/request.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="baseUrl">URL Base CILIA</Label>
            <Input
              id="baseUrl"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://sistema.cilia.com.br"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="authToken">Token de Autenticação</Label>
            <Textarea
              id="authToken"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              placeholder="Cole o token CILIA aqui"
              rows={3}
              className="font-mono text-sm"
            />
          </div>

          <Button 
            onClick={testCiliaDirectly}
            disabled={testing || !authToken}
            className="w-full"
          >
            {testing ? "Testando..." : "🔥 Testar Conexão Direta"}
          </Button>

          {result && (
            <Card className={result.success ? "border-green-500" : "border-red-500"}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {result.success ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      ✅ Sucesso!
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-red-600" />
                      ❌ Falhou
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label className="font-semibold">Status HTTP:</Label>
                    <p className="font-mono text-sm mt-1">
                      {result.status} {result.statusText}
                    </p>
                  </div>

                  {result.body && (
                    <div>
                      <Label className="font-semibold">Resposta da API:</Label>
                      <pre className="mt-2 p-4 bg-muted rounded-lg overflow-auto text-xs">
                        {JSON.stringify(result.body, null, 2)}
                      </pre>
                    </div>
                  )}

                  {result.error && (
                    <div>
                      <Label className="font-semibold text-red-600">Erro:</Label>
                      <pre className="mt-2 p-4 bg-red-50 border border-red-200 rounded-lg overflow-auto text-xs">
                        {result.error}
                      </pre>
                    </div>
                  )}

                  <details className="cursor-pointer">
                    <summary className="font-semibold text-sm">
                      🔍 Payload Enviado
                    </summary>
                    <pre className="mt-2 p-4 bg-muted rounded-lg overflow-auto text-xs">
                      {JSON.stringify(result.payload, null, 2)}
                    </pre>
                  </details>

                  <details className="cursor-pointer">
                    <summary className="font-semibold text-sm">
                      📋 Headers da Resposta
                    </summary>
                    <pre className="mt-2 p-4 bg-muted rounded-lg overflow-auto text-xs">
                      {JSON.stringify(result.headers, null, 2)}
                    </pre>
                  </details>
                </div>
              </CardContent>
            </Card>
          )}

          <Alert className="bg-blue-50 border-blue-200">
            <AlertDescription className="text-sm">
              <strong>🔍 Interpretando o resultado:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li><strong>Sucesso (200/201)</strong> = Token válido, request correto, problema é IP do Edge Function</li>
                <li><strong>401 Unauthorized</strong> = Token inválido, expirado ou IP bloqueado também aqui</li>
                <li><strong>CORS Error</strong> = CILIA não permite chamadas diretas do browser (normal)</li>
                <li><strong>Network Error</strong> = Problema de conectividade</li>
              </ul>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
