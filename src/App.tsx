import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { usePushNotifications } from "@/hooks/usePushNotifications";
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
import Usuarios from "./pages/Usuarios";
import Equipes from "./pages/Equipes";
import Agenda from "./pages/Agenda";
import Comunicados from "./pages/Comunicados";
import Documentos from "./pages/Documentos";
import Mensagens from "./pages/Mensagens";
import Emails from "./pages/Emails";
import Configuracoes from "./pages/Configuracoes";
import NotFound from "./pages/NotFound";
import IndividualPerformance from "./pages/IndividualPerformance";
import Vistorias from "./pages/Vistorias";
import VistoriaDigital from "./pages/VistoriaDigital";
import VistoriaManual from "./pages/VistoriaManual";
import VistoriaDetalhe from "./pages/VistoriaDetalhe";
import VistoriaPublicaLanding from './pages/VistoriaPublicaLanding';
import VistoriaPublicaCaptura from './pages/VistoriaPublicaCaptura';
import VistoriaPublicaConclusao from './pages/VistoriaPublicaConclusao';
import Administradora from "./pages/Administradora";
import AberturaSinistro from './pages/AberturaSinistro';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  usePushNotifications();
  
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
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

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { userRole } = useAuth();
  return userRole === 'superintendente' ? <>{children}</> : <Navigate to="/" replace />;
}

const App = () => (
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/vistoria/:token" element={<VistoriaPublicaLanding />} />
            <Route path="/vistoria/:token/captura" element={<VistoriaPublicaCaptura />} />
            <Route path="/vistoria/:token/conclusao" element={<VistoriaPublicaConclusao />} />
            <Route path="/sinistros/novo" element={<ProtectedRoute><AberturaSinistro /></ProtectedRoute>} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/atendimentos" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/vistorias" element={<ProtectedRoute><Vistorias /></ProtectedRoute>} />
            <Route path="/vistorias/nova/digital" element={<ProtectedRoute><VistoriaDigital /></ProtectedRoute>} />
            <Route path="/vistorias/nova/manual" element={<ProtectedRoute><VistoriaManual /></ProtectedRoute>} />
            <Route path="/vistorias/:id" element={<ProtectedRoute><VistoriaDetalhe /></ProtectedRoute>} />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="/dashboard-analytics" element={<ProtectedRoute><DashboardAnalytics /></ProtectedRoute>} />
            <Route path="/desempenho-individual" element={<ProtectedRoute><IndividualPerformance /></ProtectedRoute>} />
            <Route path="/corretoras" element={<ProtectedRoute><Corretoras /></ProtectedRoute>} />
            <Route path="/administradora" element={<ProtectedRoute><AdminRoute><Administradora /></AdminRoute></ProtectedRoute>} />
            <Route path="/contatos" element={<ProtectedRoute><Contatos /></ProtectedRoute>} />
            <Route path="/usuarios" element={<ProtectedRoute><Usuarios /></ProtectedRoute>} />
            <Route path="/equipes" element={<ProtectedRoute><Equipes /></ProtectedRoute>} />
            
            <Route path="/agenda" element={<ProtectedRoute><Agenda /></ProtectedRoute>} />
            <Route path="/documentos" element={<ProtectedRoute><Documentos /></ProtectedRoute>} />
            <Route path="/mensagens" element={<ProtectedRoute><Mensagens /></ProtectedRoute>} />
            <Route path="/emails" element={<ProtectedRoute><Emails /></ProtectedRoute>} />
            <Route path="/comunicados" element={<ProtectedRoute><AdminRoute><Comunicados /></AdminRoute></ProtectedRoute>} />
            <Route path="/configuracoes" element={<ProtectedRoute><AdminRoute><Configuracoes /></AdminRoute></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </BrowserRouter>
);

export default App;
