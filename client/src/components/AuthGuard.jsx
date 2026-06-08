import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

export default function AuthGuard() {
  const { isAuthenticated, user } = useAuthStore();

  // If they aren't logged into Google at all, kick to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If they logged into Google but bypassed the profile setup, kick them back
  if (isAuthenticated && !user) {
    return <Navigate to="/setup-profile" replace />;
  }

  // Fully authenticated, let them access the Inbox
  return <Outlet />;
}