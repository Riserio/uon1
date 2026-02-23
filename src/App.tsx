import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { usePontoAlertas } from "@/hooks/usePontoAlertas";
import { useVisitorTracking } from "@/hooks/useVisitorTracking";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { PortalAuthProvider } from '@/contexts/PortalAuthContext';
import { PortalLayoutProvider } from "./contexts/PortalLayoutContext";
import { lazy, Suspense } from "react";

// Lazy-loaded pages for code splitting
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
const Index = lazy(() => import("./pages/Index"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DashboardAnalytics = lazy(() => import("./pages/DashboardAnalytics"));
const Corretoras = lazy(() => import("./pages/Corretoras"));
const Contatos = lazy(() => import("./pages/Contatos"));
const Termos = lazy(() => import("./pages/Termos"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const Equipes = lazy(() => import("./pages/Equipes"));
const Financeiro = lazy(() => import("./pages/Financeiro"));
const Agenda = lazy(() => import("./pages/Agenda"));
const Comunicados = lazy(() => import("./pages/Comunicados"));
const Documentos = lazy(() => import("./pages/Documentos"));
const Mensagens = lazy(() => import("./pages/Mensagens"));
const Emails = lazy(() => import("./pages/Emails"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const ComiteDeliberacao = lazy(() => import("./pages/ComiteDeliberacao"));
const NotFound = lazy(() => import("./pages/NotFound"));
const IndividualPerformance = lazy(() => import("./pages/IndividualPerformance"));
const DesempenhoCorretoras = lazy(() => import("./pages/DesempenhoCorretoras"));
const Sinistros = lazy(() => import("./pages/Sinistros"));
const VistoriaDigital = lazy(() => import("./pages/VistoriaDigital"));
const VistoriaManual = lazy(() => import("./pages/VistoriaManual"));
const VistoriaDetalhe = lazy(() => import("./pages/VistoriaDetalhe"));
const VistoriaPublicaLanding = lazy(() => import('./pages/VistoriaPublicaLanding'));
const VistoriaPublicaCaptura = lazy(() => import('./pages/VistoriaPublicaCaptura'));
const VistoriaPublicaFormulario = lazy(() => import('./pages/VistoriaPublicaFormulario'));
const VistoriaPublicaTermos = lazy(() => import('./pages/VistoriaPublicaTermos'));
const VistoriaPublicaConclusao = lazy(() => import('./pages/VistoriaPublicaConclusao'));
const AcompanhamentoSinistro = lazy(() => import('./pages/AcompanhamentoSinistro'));
const AcompanhamentoSinistroInterno = lazy(() => import('./pages/AcompanhamentoSinistroInterno'));
const ConfiguracaoStatusPublico = lazy(() => import('./pages/ConfiguracaoStatusPublico'));
const Administradora = lazy(() => import("./pages/Administradora"));
const PortalLogin = lazy(() => import('./pages/portal/PortalLogin'));
const PortalDashboard = lazy(() => import('./pages/portal/PortalDashboard'));
const PID = lazy(() => import('./pages/PID'));
const Portal = lazy(() => import('./pages/Portal'));
const DashboardFinanceiro = lazy(() => import("./pages/DashboardFinanceiro"));
const CustosSinistros = lazy(() => import("./pages/CustosSinistros"));
const SinistroConfiguracoes = lazy(() => import("./pages/SinistroConfiguracoes"));
const SGAInsights = lazy(() => import("./pages/SGAInsights"));
const MGFInsights = lazy(() => import("./pages/MGFInsights"));
const CobrancaInsights = lazy(() => import("./pages/CobrancaInsights"));
const EstudoBaseInsights = lazy(() => import("./pages/EstudoBaseInsights"));
const AcompanhamentoEventos = lazy(() => import("./pages/AcompanhamentoEventos"));
const BILayout = lazy(() => import("./components/bi/BILayout"));
const Landing = lazy(() => import("./pages/Landing"));
const Gestao = lazy(() => import("./pages/Gestao"));
const Uon1Sign = lazy(() => import("./pages/Uon1Sign"));
const ContratoAssinatura = lazy(() => import("./pages/ContratoAssinatura"));
const CentralAtendimento = lazy(() => import("./pages/CentralAtendimento"));
const WhatsAppFlows = lazy(() => import("./pages/WhatsAppFlows"));
const VideoRooms = lazy(() => import("./pages/VideoRooms"));
const MeetingRoom = lazy(() => import("./pages/MeetingRoom"));
const InviteEntry = lazy(() => import("./pages/InviteEntry"));
const PortalGestaoAssociacao = lazy(() => import("./pages/portal/PortalGestaoAssociacao"));
const PortalLayout = lazy(() => import("./components/portal/PortalLayout"));
const PortalAcompanhamentoEventos = lazy(() => import("./pages/portal/PortalAcompanhamentoEventos"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

function MainContent({ children }: { children: React.ReactNode }) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  
  return (
    <main 
      className="flex-1 overflow-auto transition-[margin] duration-200 ease-linear"
      style={{ marginLeft: isCollapsed ? '3.5rem' : '16rem' }}
    >
      {children}
    </main>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isParceiro } = useAuth();
  usePushNotifications();
  usePontoAlertas();
  useVisitorTracking();
  
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
        <MainContent>
          {children}
        </MainContent>
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

  if (!isParceiro) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return (
    <PortalLayoutProvider>
      {children}
    </PortalLayoutProvider>
  );
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

// Global safety net for uncaught promise rejections
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Global] Unhandled promise rejection:', event.reason);
    event.preventDefault();
  });
}

const App = () => (
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <PortalAuthProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
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
              <Route path="/central-atendimento" element={<ProtectedRoute><Emails /></ProtectedRoute>} />
              <Route path="/emails" element={<Navigate to="/central-atendimento" replace />} />
              <Route path="/central-whatsapp" element={<Navigate to="/central-atendimento" replace />} />
              <Route path="/whatsapp-flows" element={<Navigate to="/central-atendimento" replace />} />
              <Route path="/comunicados" element={<ProtectedRoute><AdminRoute><Comunicados /></AdminRoute></ProtectedRoute>} />
              <Route path="/configuracoes" element={<ProtectedRoute><AdminRoute><Configuracoes /></AdminRoute></ProtectedRoute>} />
              <Route element={<ProtectedRoute><BILayout /></ProtectedRoute>}>
                <Route path="/pid" element={<PID />} />
                <Route path="/sga-insights" element={<SGAInsights />} />
                <Route path="/mgf-insights" element={<MGFInsights />} />
                <Route path="/cobranca-insights" element={<CobrancaInsights />} />
                <Route path="/estudo-base-insights" element={<EstudoBaseInsights />} />
                <Route path="/acompanhamento-eventos" element={<AcompanhamentoEventos />} />
              </Route>
              <Route path="/gestao" element={<ProtectedRoute><Gestao /></ProtectedRoute>} />
              <Route path="/uon1sign" element={<ProtectedRoute><Uon1Sign /></ProtectedRoute>} />
              <Route path="/talk" element={<Navigate to="/video" replace />} />
              <Route path="/video" element={<ProtectedRoute><VideoRooms /></ProtectedRoute>} />
              <Route path="/video/:roomId" element={<ProtectedRoute><MeetingRoom /></ProtectedRoute>} />
              <Route path="/invite/:inviteId" element={<InviteEntry />} />
              <Route path="/portal" element={<PortalRoute><PortalLayout /></PortalRoute>}>
                <Route index element={<Portal />} />
                <Route path="sga-insights" element={<SGAInsights />} />
                <Route path="mgf-insights" element={<MGFInsights />} />
                <Route path="cobranca-insights" element={<CobrancaInsights />} />
                <Route path="estudo-base-insights" element={<EstudoBaseInsights />} />
                <Route path="gestao-associacao" element={<PortalGestaoAssociacao />} />
                <Route path="acompanhamento-eventos" element={<PortalAcompanhamentoEventos />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </TooltipProvider>
        </AuthProvider>
      </PortalAuthProvider>
    </QueryClientProvider>
  </BrowserRouter>
);

export default App;
