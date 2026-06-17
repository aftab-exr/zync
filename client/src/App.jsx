import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/useAuthStore';
import Login from './pages/Login';
import SetupProfile from './pages/SetupProfile';
import Inbox from './pages/Inbox';
import Sidecar from './pages/Sidecar';
import Settings from './pages/Settings';
import AuthGuard from './components/AuthGuard';
import GuestGuard from './components/GuestGuard';

function App() {
  const { checkAuth, isCheckingAuth } = useAuthStore();

  // Fire the Boot Sequence
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // The Hermes Loading Screen (prevents router flashing)
  if (isCheckingAuth) {
    return (
      <div className="h-screen w-screen bg-[var(--bg-base)] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--text-secondary)] border-t-[var(--accent)] rounded-full animate-spin"></div>
      </div>
    );
  }
  return (
    <BrowserRouter>
      {/* ⚡ Global toast portal — dark theme to match the app shell */}
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: 'var(--success)', secondary: 'var(--bg-surface)' } },
          error: { iconTheme: { primary: 'var(--error)', secondary: 'var(--bg-surface)' } },
        }}
      />
      <Routes>
        {/* Redirect root to login */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        
        {/* 🛡️ GUEST ROUTES: Only accessible if NOT fully logged in */}
        <Route element={<GuestGuard />}>
          <Route path="/login" element={<Login />} />
          <Route path="/setup-profile" element={<SetupProfile />} />
        </Route>
        
        {/* 🛡️ PROTECTED ROUTES */}
        <Route element={<AuthGuard />}>
          {/* ⚡ OPTIMIZATION: The '?' makes the ID optional. The Inbox will NEVER unmount, keeping the Socket permanently stable. */}
          <Route path="/inbox/:conversationId?" element={<Inbox />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/sidecar" element={<Sidecar />} />
        </Route>
        
      </Routes>
    </BrowserRouter>
  );
}

export default App;