import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

export default function GuestGuard() {
  const { isAuthenticated, user } = useAuthStore();

  // If they authenticated but have no MongoDB profile -> Force them to Setup Profile
  if (isAuthenticated && !user) {
    return <Navigate to="/setup-profile" replace />;
  }
  
  // If they are fully authenticated with a profile -> Force them to Inbox
  if (isAuthenticated && user) {
    return <Navigate to="/inbox" replace />;
  }

  // Otherwise, let them see the Login screen
  return <Outlet />;
}