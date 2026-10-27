import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { MediaPlayerProvider } from "@/contexts/MediaPlayerContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { EnvironmentProvider } from "@/contexts/EnvironmentContext";
import { JointConnectionGuard } from "@/components/JointConnectionGuard";
import { SwitchVeil } from "@/components/SwitchVeil";
import { AppShell } from "@/components/layout/AppShell";
import { AppErrorBoundary } from "@/components/layout/AppErrorBoundary";
import { BootLauncher } from "@/components/BootLauncher";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import News from "./pages/News";
import Scanner from "./pages/Scanner";
import Pricing from "./pages/Pricing";
import Upgrade from "./pages/Upgrade";
import Dashboard from "./pages/Dashboard";
import DashboardSettings from "./pages/DashboardSettings";
import PaymentSuccess from "./pages/PaymentSuccess";
import AdminVault from "./pages/AdminVault";
import Social from "./pages/Social";
import Chat from "./pages/Chat";
import AveriaAI from "./pages/AveriaAI";
import Debunked from "./pages/Debunked";
import ArticleDetail from "./pages/ArticleDetail";
import JointDashboard from "./pages/JointDashboard";
import Trade from "./pages/Trade";
import Projects from "./pages/Projects";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <MediaPlayerProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <EnvironmentProvider>
          <WorkspaceProvider>
          <SwitchVeil />
          <BootLauncher />
          <JointConnectionGuard />
          <AppErrorBoundary>
          <AppShell>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/index" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/news" element={<News />} />
            <Route path="/scanner" element={<Scanner />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/upgrade" element={<Upgrade />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/settings" element={<DashboardSettings />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/admin-vault" element={<AdminVault />} />
            <Route path="/social" element={<Social />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/averia-ai" element={<AveriaAI />} />
            <Route path="/debunked" element={<Debunked />} />
            <Route path="/article" element={<ArticleDetail />} />
            <Route path="/joint/:id" element={<JointDashboard />} />
            <Route path="/trade" element={<Trade />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </AppShell>
          </AppErrorBoundary>
          </WorkspaceProvider>
          </EnvironmentProvider>
        </BrowserRouter>
      </TooltipProvider>
      </MediaPlayerProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
