import { useEffect, useRef } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { auth, requestPushPermission } from '../lib/firebase';
import { api } from '../lib/axios';

export default function AuthGuard() {
  const { isAuthenticated, user } = useAuthStore();
  const pushInitRef = useRef(false);

  useEffect(() => {
    // OS prompt for push notifications triggers after successful auth — run once only
    if (isAuthenticated && user && !pushInitRef.current) {
      pushInitRef.current = true;
      const initPush = async () => {
        const token = await requestPushPermission();
        if (token) {
          try {
            const idToken = await auth.currentUser?.getIdToken();
            if (!idToken) {
              return;
            }
            await api.patch('/users/update-fcm', { fcmToken: token }, {
              headers: { Authorization: `Bearer ${idToken}` }
            });
          } catch (error) {
            // Failed to save token
          }
        }
      };
      
      initPush();
    }
  }, [isAuthenticated, user]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isAuthenticated && !user) {
    return <Navigate to="/setup-profile" replace />;
  }

  return <Outlet />;
}