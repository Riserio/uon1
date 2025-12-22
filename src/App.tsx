import { Toaster } from "@/components/ui/toaster";
import ComiteDeliberacao from "./pages/ComiteDeliberacao";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { usePontoAlertas } from "@/hooks/usePontoAlertas";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import ChangePassword from "./pages/ChangePassword";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import DashboardAnalytics from "./pages/DashboardAnalytics";
import Corretoras from "./pages/Corretoras";
import Contatos from "./pages/Contatos";
import Termos from "./pages/Termos";
import Usuarios from "./pages/Usuarios";
import Equipes from "./pages/Equipes";
import Financeiro from "./pages/Financeiro";
import Agenda from "./pages/Agenda";
import Comunicados from "./pages/Comunicados";
import Documentos from "./pages/Documentos";
import Mensagens from "./pages/Mensagens";
import Emails from "./pages/Emails";
import Configuracoes from "./pages/Configuracoes";

import NotFound from "./pages/NotFound";
import IndividualPerformance from "./pages/IndividualPerformance";
import DesempenhoCorretoras from "./pages/DesempenhoCorretoras";
import Sinistros from "./pages/Sinistros";
import VistoriaDigital from "./pages/VistoriaDigital";
import VistoriaManual from "./pages/VistoriaManual";
import VistoriaDetalhe from "./pages/VistoriaDetalhe";
import VistoriaPublicaLanding from './pages/VistoriaPublicaLanding';
import VistoriaPublicaCaptura from './pages/VistoriaPublicaCaptura';
import VistoriaPublicaFormulario from './pages/VistoriaPublicaFormulario';
import VistoriaPublicaTermos from './pages/VistoriaPublicaTermos';
import VistoriaPublicaConclusao from './pages/VistoriaPublicaConclusao';
import AcompanhamentoSinistro from './pages/AcompanhamentoSinistro';
import AcompanhamentoSinistroInterno from './pages/AcompanhamentoSinistroInterno';
import ConfiguracaoStatusPublico from './pages/ConfiguracaoStatusPublico';
import Administradora from "./pages/Administradora";
import { PortalAuthProvider } from '@/contexts/PortalAuthContext';
import PortalLogin from './pages/portal/PortalLogin';
import PortalDashboard from './pages/portal/PortalDashboard';
import PID from './pages/PID';
import Portal from './pages/Portal';
import DashboardFinanceiro from "@/pages/DashboardFinanceiro";
import CustosSinistros from "@/pages/CustosSinistros";
import SinistroConfiguracoes from "@/pages/SinistroConfiguracoes";
import SGAInsights from "@/pages/SGAInsights";
import MGFInsights from "@/pages/MGFInsights";
import Landing from "./pages/Landing";
import Gestao from "./pages/Gestao";
import Uon1Sign from "./pages/Uon1Sign";
import ContratoAssinatura from "./pages/ContratoAssinatura";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isParceiro } = useAuth();
  usePushNotifications();
  usePontoAlertas();
  
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // DECISÃO DEFINITIVA: Parceiros têm acesso EXCLUSIVO ao portal PID
  // Eles NÃO podem acessar nenhuma outra parte do sistema
  if (isParceiro) {
    return <Navigate to="/portal" replace />;
  }
  
  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen w-full flex">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}

function PortalRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isParceiro } = useAuth();
  usePushNotifications();
  
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // DECISÃO DEFINITIVA: Apenas usuários com role 'parceiro' podem acessar o portal PID
  // Todos os outros usuários são redirecionados para o dashboard principal
  if (!isParceiro) {
    return <Navigate to="/dashboard" replace />;
  }
  
  // Parceiros veem APENAS o portal - sem sidebar, sem acesso a outras rotas
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { userRole } = useAuth();
  return userRole === 'superintendente' ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

// Componente para redirecionar baseado no domínio e status de login
function DomainBasedRoute() {
  const { user, loading } = useAuth();
  const hostname = window.location.hostname;
  
  // Se for uon1.com.br (com ou sem www), mostra a landing
  const isMainDomain = hostname === 'uon1.com.br' || hostname === 'www.uon1.com.br';
  
  if (isMainDomain) {
    return <Landing />;
  }
  
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }
  
  // Se usuário está logado, vai para dashboard
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  
  // Usuário não logado vai para auth
  return <Navigate to="/auth" replace />;
}

const App = () => (
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <PortalAuthProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <Routes>
              {/* Portal PID Routes */}
          <Route path="/:slug/login" element={<PortalLogin />} />
          <Route path="/:slug/dashboard" element={<PortalDashboard />} />
              
              {/* Regular App Routes */}
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/change-password" element={<ChangePassword />} />
              <Route path="/vistoria/:token" element={<VistoriaPublicaLanding />} />
            <Route path="/vistoria/:token/captura" element={<VistoriaPublicaCaptura />} />
            <Route path="/vistoria/:token/formulario" element={<VistoriaPublicaFormulario />} />
            <Route path="/vistoria/:token/termos" element={<VistoriaPublicaTermos />} />
            <Route path="/vistoria/:token/conclusao" element={<VistoriaPublicaConclusao />} />
              <Route path="/contrato/:token" element={<ContratoAssinatura />} />
              <Route path="/acompanhamento" element={<AcompanhamentoSinistro />} />
              <Route path="/configuracao-status-publico" element={<ProtectedRoute><ConfiguracaoStatusPublico /></ProtectedRoute>} />
              <Route path="/" element={<DomainBasedRoute />} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/atendimentos" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/sinistros" element={<ProtectedRoute><Sinistros /></ProtectedRoute>} />
              <Route path="/sinistros/configuracoes" element={<ProtectedRoute><SinistroConfiguracoes /></ProtectedRoute>} />
              <Route path="/sinistros/:id/acompanhamento" element={<ProtectedRoute><AcompanhamentoSinistroInterno /></ProtectedRoute>} />
              <Route path="/sinistros/:atendimentoId/deliberacao" element={<ProtectedRoute><ComiteDeliberacao /></ProtectedRoute>} />
              <Route path="/vistorias/nova/digital" element={<ProtectedRoute><VistoriaDigital /></ProtectedRoute>} />
              <Route path="/vistorias/nova/manual" element={<ProtectedRoute><VistoriaManual /></ProtectedRoute>} />
              <Route path="/vistorias/:id" element={<ProtectedRoute><VistoriaDetalhe /></ProtectedRoute>} />
              <Route path="/dashboard-analytics" element={<ProtectedRoute><DashboardAnalytics /></ProtectedRoute>} />
              <Route path="/desempenho-individual" element={<ProtectedRoute><IndividualPerformance /></ProtectedRoute>} />
              <Route path="/performance/individual" element={<ProtectedRoute><IndividualPerformance /></ProtectedRoute>} />
              <Route path="/performance/corretoras" element={<ProtectedRoute><DesempenhoCorretoras /></ProtectedRoute>} />
              <Route path="/corretoras" element={<ProtectedRoute><Corretoras /></ProtectedRoute>} />
              <Route path="/termos" element={<ProtectedRoute><Termos /></ProtectedRoute>} />
              <Route path="/administradora" element={<ProtectedRoute><AdminRoute><Administradora /></AdminRoute></ProtectedRoute>} />
              <Route path="/contatos" element={<ProtectedRoute><Contatos /></ProtectedRoute>} />
              <Route path="/usuarios" element={<ProtectedRoute><Usuarios /></ProtectedRoute>} />
              <Route path="/equipes" element={<ProtectedRoute><Equipes /></ProtectedRoute>} />
              <Route path="/financeiro" element={<ProtectedRoute><Financeiro /></ProtectedRoute>} />
                <Route path="/dashboard-financeiro" element={<ProtectedRoute><DashboardFinanceiro /></ProtectedRoute>} />
                <Route path="/custos-sinistros" element={<ProtectedRoute><CustosSinistros /></ProtectedRoute>} />
              
              <Route path="/agenda" element={<ProtectedRoute><Agenda /></ProtectedRoute>} />
              <Route path="/documentos" element={<ProtectedRoute><Documentos /></ProtectedRoute>} />
              <Route path="/mensagens" element={<ProtectedRoute><Mensagens /></ProtectedRoute>} />
              <Route path="/emails" element={<ProtectedRoute><Emails /></ProtectedRoute>} />
              <Route path="/comunicados" element={<ProtectedRoute><AdminRoute><Comunicados /></AdminRoute></ProtectedRoute>} />
              <Route path="/configuracoes" element={<ProtectedRoute><AdminRoute><Configuracoes /></AdminRoute></ProtectedRoute>} />
              <Route path="/pid" element={<ProtectedRoute><PID /></ProtectedRoute>} />
              <Route path="/gestao" element={<ProtectedRoute><Gestao /></ProtectedRoute>} />
              <Route path="/uon1sign" element={<ProtectedRoute><Uon1Sign /></ProtectedRoute>} />
              <Route path="/sga-insights" element={<ProtectedRoute><SGAInsights /></ProtectedRoute>} />
              <Route path="/mgf-insights" element={<ProtectedRoute><MGFInsights /></ProtectedRoute>} />
              <Route path="/portal/sga-insights" element={<PortalRoute><SGAInsights /></PortalRoute>} />
              <Route path="/portal/mgf-insights" element={<PortalRoute><MGFInsights /></PortalRoute>} />
              <Route path="/portal" element={<PortalRoute><Portal /></PortalRoute>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </TooltipProvider>
        </AuthProvider>
      </PortalAuthProvider>
    </QueryClientProvider>
  </BrowserRouter>
);

export default App;
