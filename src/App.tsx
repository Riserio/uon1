import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useOneSignalInterno } from "@/hooks/useOneSignalInterno";
import { usePontoAlertas } from "@/hooks/usePontoAlertas";
import { useVisitorTracking } from "@/hooks/useVisitorTracking";
// sidebar is now self-contained in AppSidebar
import { AppSidebar } from "@/components/AppSidebar";
import { PortalAuthProvider } from '@/contexts/PortalAuthContext';
import { PortalLayoutProvider } from "./contexts/PortalLayoutContext";
import { Suspense } from "react";
import { lazyWithRetry } from "@/lib/lazyWithRetry";

// Lazy-loaded pages for code splitting
const Auth = lazyWithRetry(() => import("./pages/Auth"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"));
const ChangePassword = lazyWithRetry(() => import("./pages/ChangePassword"));
const Index = lazyWithRetry(() => import("./pages/Index"));
const Dashboard = lazyWithRetry(() => import("./pages/Dashboard"));
const DashboardAnalytics = lazyWithRetry(() => import("./pages/DashboardAnalytics"));
const Corretoras = lazyWithRetry(() => import("./pages/Corretoras"));
const Contatos = lazyWithRetry(() => import("./pages/Contatos"));
const Termos = lazyWithRetry(() => import("./pages/Termos"));
const Usuarios = lazyWithRetry(() => import("./pages/Usuarios"));
const Equipes = lazyWithRetry(() => import("./pages/Equipes"));
const Financeiro = lazyWithRetry(() => import("./pages/Financeiro"));
const Agenda = lazyWithRetry(() => import("./pages/Agenda"));
const Comunicados = lazyWithRetry(() => import("./pages/Comunicados"));
const Documentos = lazyWithRetry(() => import("./pages/Documentos"));
const Mensagens = lazyWithRetry(() => import("./pages/Mensagens"));
const Emails = lazyWithRetry(() => import("./pages/Emails"));
const Configuracoes = lazyWithRetry(() => import("./pages/Configuracoes"));
const ReportarProblema = lazyWithRetry(() => import("./pages/ReportarProblema"));
const ComiteDeliberacao = lazyWithRetry(() => import("./pages/ComiteDeliberacao"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const IndividualPerformance = lazyWithRetry(() => import("./pages/IndividualPerformance"));
const DesempenhoCorretoras = lazyWithRetry(() => import("./pages/DesempenhoCorretoras"));
const Sinistros = lazyWithRetry(() => import("./pages/Sinistros"));
const VistoriaDigital = lazyWithRetry(() => import("./pages/VistoriaDigital"));
const VistoriaManual = lazyWithRetry(() => import("./pages/VistoriaManual"));
const VistoriaDetalhe = lazyWithRetry(() => import("./pages/VistoriaDetalhe"));
const VistoriaPublicaLanding = lazyWithRetry(() => import('./pages/VistoriaPublicaLanding'));
const VistoriaPublicaCaptura = lazyWithRetry(() => import('./pages/VistoriaPublicaCaptura'));
const VistoriaPublicaFormulario = lazyWithRetry(() => import('./pages/VistoriaPublicaFormulario'));
const VistoriaPublicaTermos = lazyWithRetry(() => import('./pages/VistoriaPublicaTermos'));
const VistoriaPublicaConclusao = lazyWithRetry(() => import('./pages/VistoriaPublicaConclusao'));
const AcompanhamentoSinistro = lazyWithRetry(() => import('./pages/AcompanhamentoSinistro'));
const AcompanhamentoSinistroInterno = lazyWithRetry(() => import('./pages/AcompanhamentoSinistroInterno'));
const ConfiguracaoStatusPublico = lazyWithRetry(() => import('./pages/ConfiguracaoStatusPublico'));
const Administradora = lazyWithRetry(() => import("./pages/Administradora"));
const PortalLogin = lazyWithRetry(() => import('./pages/portal/PortalLogin'));
const PortalDashboard = lazyWithRetry(() => import('./pages/portal/PortalDashboard'));
const PID = lazyWithRetry(() => import('./pages/PID'));
const SGABusca = lazyWithRetry(() => import('./pages/SGABusca'));
const Portal = lazyWithRetry(() => import('./pages/Portal'));
const DashboardFinanceiro = lazyWithRetry(() => import("./pages/DashboardFinanceiro"));
const CustosSinistros = lazyWithRetry(() => import("./pages/CustosSinistros"));
const SinistroConfiguracoes = lazyWithRetry(() => import("./pages/SinistroConfiguracoes"));
const SGAInsights = lazyWithRetry(() => import("./pages/SGAInsights"));
const MGFInsights = lazyWithRetry(() => import("./pages/MGFInsights"));
const CobrancaInsights = lazyWithRetry(() => import("./pages/CobrancaInsights"));
const EstudoBaseInsights = lazyWithRetry(() => import("./pages/EstudoBaseInsights"));
const CadastroInsights = lazyWithRetry(() => import("./pages/CadastroInsights"));
const AcompanhamentoEventos = lazyWithRetry(() => import("./pages/AcompanhamentoEventos"));
const PPR = lazyWithRetry(() => import("./pages/PPR"));
const BILayout = lazyWithRetry(() => import("./components/bi/BILayout"));
const Landing = lazyWithRetry(() => import("./pages/Landing"));
const PoliticaPrivacidade = lazyWithRetry(() => import("./pages/PoliticaPrivacidade"));
const TermosServico = lazyWithRetry(() => import("./pages/TermosServico"));
const Gestao = lazyWithRetry(() => import("./pages/Gestao"));
const Uon1Sign = lazyWithRetry(() => import("./pages/Uon1Sign"));
const ContratoAssinatura = lazyWithRetry(() => import("./pages/ContratoAssinatura"));
const CentralAtendimento = lazyWithRetry(() => import("./pages/CentralAtendimento"));
const Biblioteca = lazyWithRetry(() => import("./pages/Biblioteca"));
const EstudoRegulatorio = lazyWithRetry(() => import("./pages/EstudoRegulatorio"));
const WhatsAppFlows = lazyWithRetry(() => import("./pages/WhatsAppFlows"));
const VideoRooms = lazyWithRetry(() => import("./pages/VideoRooms"));
const MeetingRoom = lazyWithRetry(() => import("./pages/MeetingRoom"));
const InviteEntry = lazyWithRetry(() => import("./pages/InviteEntry"));
const PortalGestaoAssociacao = lazyWithRetry(() => import("./pages/portal/PortalGestaoAssociacao"));
const PortalLayout = lazyWithRetry(() => import("./components/portal/PortalLayout"));
const PortalAcompanhamentoEventos = lazyWithRetry(() => import("./pages/portal/PortalAcompanhamentoEventos"));
const PortalOuvidoria = lazyWithRetry(() => import("./pages/portal/PortalOuvidoria"));
const MeetingRsvp = lazyWithRetry(() => import("./pages/MeetingRsvp"));
const OuvidoriaPublica = lazyWithRetry(() => import("./pages/OuvidoriaPublica"));
const OuvidoriaBackoffice = lazyWithRetry(() => import("./pages/OuvidoriaBackoffice"));
const OuvidoriaEmbed = lazyWithRetry(() => import("./pages/OuvidoriaEmbed"));
const Treinamento = lazyWithRetry(() => import("./pages/Treinamento"));
const DebitosVeiculares = lazyWithRetry(() => import("./pages/DebitosVeiculares"));
const GestaoCobranca = lazyWithRetry(() => import("./pages/GestaoCobranca"));
const Formularios = lazyWithRetry(() => import("./pages/Formularios"));
const FormularioEditor = lazyWithRetry(() => import("./pages/FormularioEditor"));
const FormularioRespostas = lazyWithRetry(() => import("./pages/FormularioRespostas"));
const FormularioPublico = lazyWithRetry(() => import("./pages/FormularioPublico"));
const DispositivosPonto = lazyWithRetry(() => import("./pages/DispositivosPonto"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    },
  },
});

// Re-fetch all active queries when the auth token is refreshed,
// so components don't get stuck with stale/failed data from the old token.
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'TOKEN_REFRESHED') {
      // Small delay to let the new token propagate to the client
      setTimeout(() => {
        queryClient.invalidateQueries();
      }, 250);
    }
  });
}

function MainContent({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" className="min-h-screen overflow-x-hidden transition-[margin-left] duration-300 ease-in-out md:ml-[3.5rem] ml-0">
      {children}
    </main>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isParceiro } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (isParceiro) {
    return <Navigate to="/portal" replace />;
  }

  return <>{children}</>;
}

function AppLayout() {
  usePushNotifications();
  usePontoAlertas();
  useVisitorTracking();
  // Push (OneSignal): registra o dispositivo e as tags de segmentação
  // (tipo: interno + cargo) para usuários fora do Portal do Parceiro
  useOneSignalInterno();

  return (
    <div className="min-h-screen w-full">
      <AppSidebar />
      <MainContent>
        <Outlet />
      </MainContent>
    </div>
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

import { ErrorReportPrompt } from "@/components/report/ErrorReportPrompt";

const App = () => (
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <PortalAuthProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <ErrorReportPrompt />
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
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
              <Route path="/politica-de-privacidade" element={<PoliticaPrivacidade />} />
              <Route path="/termos-de-servico" element={<TermosServico />} />
              <Route path="/ouvidoria/:slug" element={<OuvidoriaPublica />} />
              <Route path="/embed/ouvidoria/:slug" element={<OuvidoriaEmbed />} />
              <Route path="/gestao-cobranca" element={<GestaoCobranca />} />
              <Route path="/f/:slug" element={<FormularioPublico />} />
              <Route path="/biblioteca/estudoregulatorio" element={<EstudoRegulatorio />} />
              <Route path="/" element={<DomainBasedRoute />} />

              {/* All protected routes share sidebar via AppLayout */}
              <Route element={<AppLayout />}>
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
                <Route path="/reportar-problema" element={<ProtectedRoute><ReportarProblema /></ProtectedRoute>} />
                <Route path="/configuracao-status-publico" element={<ProtectedRoute><ConfiguracaoStatusPublico /></ProtectedRoute>} />
                <Route path="/sga" element={<ProtectedRoute><SGABusca /></ProtectedRoute>} />
                <Route element={<ProtectedRoute><BILayout /></ProtectedRoute>}>
                  <Route path="/pid" element={<PID />} />
                  <Route path="/sga-insights" element={<SGAInsights />} />
                  <Route path="/mgf-insights" element={<MGFInsights />} />
                  <Route path="/cobranca-insights" element={<CobrancaInsights />} />
                  <Route path="/estudo-base-insights" element={<EstudoBaseInsights />} />
                  <Route path="/cadastro-insights" element={<CadastroInsights />} />
                  <Route path="/acompanhamento-eventos" element={<AcompanhamentoEventos />} />
                </Route>
                <Route path="/ppr" element={<ProtectedRoute><PPR /></ProtectedRoute>} />
                <Route path="/gestao" element={<ProtectedRoute><Gestao /></ProtectedRoute>} />
                <Route path="/uon1sign" element={<ProtectedRoute><Uon1Sign /></ProtectedRoute>} />
                <Route path="/video" element={<ProtectedRoute><VideoRooms /></ProtectedRoute>} />
                <Route path="/ouvidoria-backoffice" element={<ProtectedRoute><OuvidoriaBackoffice /></ProtectedRoute>} />
                <Route path="/biblioteca" element={<ProtectedRoute><Biblioteca /></ProtectedRoute>} />
                <Route path="/ajuda" element={<ProtectedRoute><Treinamento /></ProtectedRoute>} />
                <Route path="/debitos-veiculares" element={<ProtectedRoute><DebitosVeiculares /></ProtectedRoute>} />
                <Route path="/formularios" element={<ProtectedRoute><Formularios /></ProtectedRoute>} />
                <Route path="/formularios/novo" element={<ProtectedRoute><FormularioEditor /></ProtectedRoute>} />
                <Route path="/formularios/:id/editar" element={<ProtectedRoute><FormularioEditor /></ProtectedRoute>} />
                <Route path="/formularios/:id/respostas" element={<ProtectedRoute><FormularioRespostas /></ProtectedRoute>} />
                <Route path="/dispositivos-ponto" element={<ProtectedRoute><DispositivosPonto /></ProtectedRoute>} />
                <Route path="/talk" element={<Navigate to="/video" replace />} />
              </Route>

              <Route path="/meeting-rsvp" element={<MeetingRsvp />} />
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
                <Route path="ouvidoria" element={<PortalOuvidoria />} />
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
