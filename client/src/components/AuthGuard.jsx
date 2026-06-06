import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

export default function AuthGuard() {
  const { isAuthenticated, user } = useAuthStore();

  // Rule 1: Not logged in via Google -> Kick to Login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Rule 2: Logged in via Google, but no Zync Profile in MongoDB -> Kick to Setup
  if (isAuthenticated && !user) {
    return <Navigate to="/setup-profile" replace />;
  }

  // Rule 3: Logged in AND Profile is complete -> Allow access to child routes (like /inbox)
  return <Outlet />;
}