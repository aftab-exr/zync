import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { auth, requestPushPermission } from '../lib/firebase';
import { api } from '../lib/axios';

export default function AuthGuard() {
  const { isAuthenticated, user } = useAuthStore();

  useEffect(() => {
    // Only trigger the OS prompt once the user has cleared all authentication boundaries
    if (isAuthenticated && user) {
      const initPush = async () => {
        const token = await requestPushPermission();
        if (token) {
          console.log("🚀 READY FOR PUSH. Device Token:", token);
          try {
            const idToken = await auth.currentUser?.getIdToken();
            if (!idToken) {
              console.error("No auth token available to update FCM token.");
              return;
            }
            // Send the token to the new Render endpoint!
            await api.patch('/users/update-fcm', { fcmToken: token }, {
              headers: { Authorization: `Bearer ${idToken}` }
            });
            console.log("✅ FCM Token locked into MongoDB.");
          } catch (error) {
            console.error("Failed to save token to DB:", error);
          }
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