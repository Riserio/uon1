import { useLocation, useNavigate } from "react-router-dom";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissoes } from "@/hooks/usePermissoes";
import { moduloDaRota, SYSTEM_MODULES } from "@/config/modulos";

/**
 * Bloqueia o acesso direto pela URL a um módulo que o cargo/perfil do usuário
 * não libera. Sem isso, esconder o item do menu era só cosmético.
 */
export function GuardaModulo({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { podeVer, carregando } = usePermissoes();
  const modulo = moduloDaRota(pathname);

  if (!modulo || carregando || podeVer(modulo)) return <>{children}</>;

  const nome = SYSTEM_MODULES.find((m) => m.id === modulo)?.label ?? modulo;
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-3">
        <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mx-auto">
          <ShieldOff className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">Sem acesso a {nome}</h2>
        <p className="text-sm text-muted-foreground">
          Seu cargo não libera este módulo. Se precisar dele, peça a um administrador para ajustar o cargo em
          Configurações → Usuários → Permissões.
        </p>
        <Button variant="outline" onClick={() => navigate("/dashboard")}>
          Voltar ao Painel
        </Button>
      </div>
    </div>
  );
}
