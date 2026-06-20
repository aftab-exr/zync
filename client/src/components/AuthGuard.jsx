import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { requestPushPermission } from '../lib/firebase';

export default function AuthGuard() {
  const { isAuthenticated, user } = useAuthStore();

  useEffect(() => {
    // Only trigger the OS prompt once the user has cleared all authentication boundaries
    if (isAuthenticated && user) {
      const initPush = async () => {
        const token = await requestPushPermission();
        if (token) {
          console.log("🚀 READY FOR PUSH. Device Token:", token);
          // Soon we will wire a backend endpoint to save this token to your MongoDB profile!
        }
      };
      
      initPush();
    }
  }, [isAuthenticated, user]);

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