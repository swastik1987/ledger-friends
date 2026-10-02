import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppProvider } from "@/contexts/AppContext";
import { lazy, Suspense } from "react";
import SpikeLauncher from "./spike/SpikeLauncher";

const AuthPage = lazy(() => import("./pages/Auth"));
const Home = lazy(() => import("./pages/Home"));
const LandingPage = lazy(() => import("./pages/Landing"));
const TrackerDetail = lazy(() => import("./pages/TrackerDetail"));
const UploadStatement = lazy(() => import("./pages/UploadStatement"));
const ProfilePage = lazy(() => import("./pages/Profile"));
const NotFound = lazy(() => import("./pages/NotFound"));
// Phase 0 Android offline-sync spike (throwaway) — docs/android-spike-runbook.md
const SpikePage = lazy(() => import("./spike/SpikePage"));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading...</div></div>
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function HomeOrLanding() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  return user ? <Home /> : <LandingPage />;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="bottom-center" />
      <BrowserRouter>
        <AuthProvider>
          <AppProvider>
            <SpikeLauncher />
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
                <Route path="/" element={<HomeOrLanding />} />
                <Route path="/tracker/:trackerId" element={<ProtectedRoute><TrackerDetail /></ProtectedRoute>} />
                <Route path="/tracker/:trackerId/upload" element={<ProtectedRoute><UploadStatement /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                {/* Unprotected on purpose: the spike observes auth state while offline. */}
                <Route path="/spike" element={<SpikePage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AppProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
