import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import BIAjudaDialog from "@/components/bi/BIAjudaDialog";

/**
 * Abre a "Ajuda do BI" de qualquer ponto do portal do parceiro (menu de
 * configurações, sidebar, barra inferior). O diálogo vive aqui, fora dos
 * menus — assim fechar o menu não fecha a ajuda.
 */
type Ctx = { abrir: (modulo?: string | null) => void };
const BIAjudaContext = createContext<Ctx | null>(null);

export function BIAjudaProvider({
  children,
  corretoraId,
  corretoraNome,
  moduloAtual,
  modulosPermitidos,
}: {
  children: ReactNode;
  corretoraId: string | null | undefined;
  corretoraNome?: string | null;
  moduloAtual?: string | null;
  modulosPermitidos?: string[] | null;
}) {
  const [open, setOpen] = useState(false);
  const [modulo, setModulo] = useState<string | null | undefined>(moduloAtual);

  const abrir = useCallback(
    (m?: string | null) => {
      setModulo(m ?? moduloAtual);
      setOpen(true);
    },
    [moduloAtual],
  );
  const value = useMemo(() => ({ abrir }), [abrir]);

  return (
    <BIAjudaContext.Provider value={value}>
      {children}
      <BIAjudaDialog
        open={open}
        onOpenChange={setOpen}
        corretoraId={corretoraId}
        corretoraNome={corretoraNome}
        moduloInicial={modulo}
        modulosPermitidos={modulosPermitidos}
      />
    </BIAjudaContext.Provider>
  );
}

export function useBIAjudaOptional() {
  return useContext(BIAjudaContext);
}
