import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import Login from './pages/Login';
import SetupProfile from './pages/SetupProfile';
import Inbox from './pages/Inbox';
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
      <Routes>
        {/* Redirect root to login */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        
        {/* 🛡️ GUEST ROUTES: Only accessible if NOT fully logged in */}
        <Route element={<GuestGuard />}>
          <Route path="/login" element={<Login />} />
          <Route path="/setup-profile" element={<SetupProfile />} />
        </Route>
        
        {/* 🛡️ PROTECTED ROUTES: Only accessible if authenticated AND profile complete */}
        <Route element={<AuthGuard />}>
          <Route path="/inbox" element={<Inbox />} />
          {/* Future V2 routes like /groups and /settings will go inside this block */}

          {/* Dynamic Conversation Route */}
          <Route path="/inbox/:conversationId" element={<Inbox />} />
        </Route>
        
      </Routes>
    </BrowserRouter>
  );
}

export default App;