import { cn } from "@/lib/utils";

/** Logo oficial da Vangard (símbolo laranja + palavra). */
export const LOGO_VANGARD = "/images/vangard-logo.png";
/** Mesma logo com a palavra em branco — para fundos escuros. */
export const LOGO_VANGARD_BRANCA = "/images/vangard-logo-branca.png";
/** Só o símbolo (ícone) da Vangard. */
export const SIMBOLO_VANGARD = "/images/vangard-simbolo.png";

interface LogoVangardProps {
  className?: string;
  /**
   * claro  → palavra escura (fundo claro)
   * escuro → palavra branca (fundo escuro)
   * auto   → segue o tema: palavra branca quando o modo escuro estiver ativo
   */
  fundo?: "claro" | "escuro" | "auto";
  alt?: string;
}

export function LogoVangard({ className, fundo = "auto", alt = "Vangard" }: LogoVangardProps) {
  const base = cn("w-auto object-contain", className);
  if (fundo === "claro") return <img src={LOGO_VANGARD} alt={alt} className={base} />;
  if (fundo === "escuro") return <img src={LOGO_VANGARD_BRANCA} alt={alt} className={base} />;
  return (
    <>
      <img src={LOGO_VANGARD} alt={alt} className={cn(base, "dark:hidden")} />
      <img src={LOGO_VANGARD_BRANCA} alt={alt} className={cn(base, "hidden dark:block")} />
    </>
  );
}
