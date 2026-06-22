import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

export default function GuestGuard() {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  // 1. Firebase active, but no profile setup
  if (isAuthenticated && !user) {
    if (location.pathname === '/setup-profile') {
      return <Outlet />;
    }
    return <Navigate to="/setup-profile" replace />;
  }
  
  // 2. Fully authenticated & profile exists, redirect to Inbox
  if (isAuthenticated && user) {
    return <Navigate to="/inbox" replace />;
  }

  // 3. Completely Logged out
  if (!isAuthenticated && location.pathname === '/setup-profile') {
    return <Navigate to="/login" replace />;
  }

  // 4. Safe to show the Guest page (Login)
  return <Outlet />;
}