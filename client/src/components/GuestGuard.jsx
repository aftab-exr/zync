import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

export default function GuestGuard() {
  const { isAuthenticated, user } = useAuthStore();

  // If fully authenticated, prevent accessing login/signup and push to inbox
  if (isAuthenticated && user) {
    return <Navigate to="/inbox" replace />;
  }

  return <Outlet />;
}
