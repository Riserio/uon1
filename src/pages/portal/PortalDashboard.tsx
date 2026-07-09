import { useParams, Navigate } from "react-router-dom";
import { usePortalAuth } from "@/contexts/PortalAuthContext";
import PortalIndicadores from "@/components/portal/PortalIndicadores";

// Esta rota (/:slug/dashboard) antes renderizava PortalIndicadores sem
// nenhuma prop — o componente espera `corretoraId`, então ficava sempre
// undefined e a tela travava no skeleton de carregamento para sempre (o
// early-return em `fetchIndicadores` quando `!corretoraId` nunca chega a
// desligar o loading). Agora resolve a associação logada via
// PortalAuthContext (preenchido pelo login em /:slug/login) e passa o id
// certo. Se não houver sessão válida para ESTE slug (ex.: acesso direto ao
// link sem login, ou sessão de outra associação), manda para o login em vez
// de mostrar uma tela vazia/carregando pra sempre.
export default function PortalDashboard() {
  const { slug } = useParams<{ slug: string }>();
  const { corretora } = usePortalAuth();

  if (!corretora || corretora.slug !== slug) {
    return <Navigate to={`/${slug}/login`} replace />;
  }

  return <PortalIndicadores corretoraId={corretora.id} />;
}
