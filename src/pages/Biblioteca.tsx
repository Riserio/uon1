import { Link } from "react-router-dom";
import { Scale, ArrowRight } from "lucide-react";
import Treinamento from "./Treinamento";

/**
 * Biblioteca (menu antigo "Ajuda") — área protegida.
 * Mantém o conteúdo original da Ajuda (Treinamento) e adiciona,
 * no topo, um atalho para o Estudo Regulatório (rota pública).
 */
export default function Biblioteca() {
  return (
    <>
      <div className="p-4 md:p-8 pb-0">
        <Link
          to="/biblioteca/estudoregulatorio"
          className="group flex items-center gap-4 rounded-2xl border bg-card p-5 transition-all duration-200 hover:shadow-md hover:bg-muted/40"
        >
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <Scale className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground">Estudo Regulatório</h3>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 rounded-full px-2 py-0.5">
                Público
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Leis, resoluções do CNSP, circulares da Susep e normas de governança,
              riscos e compliance — com modos de consulta, resumo e estudo.
            </p>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
      <Treinamento />
    </>
  );
}
