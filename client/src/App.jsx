import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/useAuthStore';
import AuthGuard from './components/AuthGuard';
import GuestGuard from './components/GuestGuard';
import PushManager from './components/PushManager';

// Dynamic route lazy loading
const Login = lazy(() => import('./pages/Login'));
const SetupProfile = lazy(() => import('./pages/SetupProfile'));
const Inbox = lazy(() => import('./pages/Inbox'));
const Sidecar = lazy(() => import('./pages/Sidecar'));
const Settings = lazy(() => import('./pages/Settings'));

function FullScreenLoader() {
  return (
    <div className="h-[100dvh] w-screen bg-base flex flex-col items-center justify-center">
      <div className="w-12 h-12 bg-primary border-3 border-border shadow-brutal animate-spin"></div>
    </div>
  );
}

function App() {
  const { checkAuth, isCheckingAuth } = useAuthStore();

  // Initialize authentication state on load
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Initial loading state during authentication check
  if (isCheckingAuth) {
    return <FullScreenLoader />;
  }
  return (
    <BrowserRouter>
      {/* Global toast notification portal */}
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--bg-surface)',
            color: 'var(--text-tx-primary)',
            border: '3px solid var(--border)',
            boxShadow: '4px 4px 0px var(--border)',
            borderRadius: '0px',
            fontSize: '14px',
            fontWeight: '600',
          },
          success: { iconTheme: { primary: 'var(--success)', secondary: 'var(--bg-surface)' } },
          error: { iconTheme: { primary: 'var(--error)', secondary: 'var(--bg-surface)' } },
        }}
      />
      <PushManager />
      <Suspense fallback={<FullScreenLoader />}>
        <Routes>
          {/* Redirect root to login */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          
          {/* Guest routes: accessible only to unauthenticated users */}
          <Route element={<GuestGuard />}>
            <Route path="/login" element={<Login />} />
            <Route path="/setup-profile" element={<SetupProfile />} />
          </Route>
          
          {/* Protected routes: require active user session */}
          <Route element={<AuthGuard />}>
            {/* Inbox maintains socket connection by rendering at the root path or with an optional conversation ID */}
            <Route path="/inbox/:conversationId?" element={<Inbox />} />
            <Route path="/chat/:conversationId?" element={<Inbox />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/sidecar" element={<Sidecar />} />
          </Route>
          
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;