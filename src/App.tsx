import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MutationCache, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isNativeApp } from "@/lib/platform";
import { bindQueryClient, LocalNotSyncedError, markStale, refreshQueries } from "@/lib/local/state";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppProvider } from "@/contexts/AppContext";
import { lazy, Suspense } from "react";

const AuthPage = lazy(() => import("./pages/Auth"));
const Home = lazy(() => import("./pages/Home"));
const LandingPage = lazy(() => import("./pages/Landing"));
const TrackerDetail = lazy(() => import("./pages/TrackerDetail"));
const UploadStatement = lazy(() => import("./pages/UploadStatement"));
const ProfilePage = lazy(() => import("./pages/Profile"));
const NotFound = lazy(() => import("./pages/NotFound"));

// The Android app reads from its local store (src/lib/local), which works
// offline, so its queries must run without a network instead of pausing. A
// successful write means the local copy is behind the server until the next pull.
const queryClient = isNativeApp
  ? new QueryClient({
      defaultOptions: {
        queries: {
          networkMode: 'always',
          retry: (failureCount, error) => !(error instanceof LocalNotSyncedError) && failureCount < 3,
        },
      },
      mutationCache: new MutationCache({ onSuccess: () => markStale() }),
    })
  : new QueryClient();
if (isNativeApp) {
  bindQueryClient(queryClient);
  // onlineManager assumes online until it sees an `offline` event. After an
  // offline cold start it would then miss the reconnect, and the
  // refetch-on-reconnect that pulls fresh data wouldn't run.
  onlineManager.setOnline(navigator.onLine);
  // Pull on reconnect, even for queries still within their staleTime.
  // onlineManager notifies only on real offline → online transitions.
  onlineManager.subscribe(online => {
    if (online) refreshQueries();
  });
}

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
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
                <Route path="/" element={<HomeOrLanding />} />
                <Route path="/tracker/:trackerId" element={<ProtectedRoute><TrackerDetail /></ProtectedRoute>} />
                <Route path="/tracker/:trackerId/upload" element={<ProtectedRoute><UploadStatement /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
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
