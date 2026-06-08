import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

export default function GuestGuard() {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  // 1. Firebase active, but no Zync Profile
  if (isAuthenticated && !user) {
    // ⚡ ANTI-LOOP FIX: If they are already on the setup page, let them render it!
    if (location.pathname === '/setup-profile') {
      return <Outlet />;
    }
    // Otherwise, push them there.
    return <Navigate to="/setup-profile" replace />;
  }
  
  // 2. Fully authenticated & profile exists -> Force to Inbox
  if (isAuthenticated && user) {
    return <Navigate to="/inbox" replace />;
  }

  // 3. Completely Logged out
  // If a logged-out user tries to type /setup-profile manually, kick them to login
  if (!isAuthenticated && location.pathname === '/setup-profile') {
    return <Navigate to="/login" replace />;
  }

  // 4. Safe to show the Login page
  return <Outlet />;
}