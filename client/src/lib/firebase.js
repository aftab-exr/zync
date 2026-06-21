import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID    
};

const app = initializeApp(firebaseConfig);

// --- AUTH & GOOGLE LOGIN ---
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
    prompt: "select_account"
});

// --- CLOUD MESSAGING (PWA PUSH NOTIFICATIONS) ---
let messagingInstance = null;

// Initialize messaging only if supported
isSupported()
  .then((supported) => {
    if (supported) {
      messagingInstance = getMessaging(app);
    } else {
      console.warn("FCM Messaging is not supported in this browser/environment.");
    }
  })
  .catch((err) => {
    console.error("Error checking FCM support:", err);
  });

export const requestPushPermission = async () => {
  try {
    const supported = await isSupported();
    if (!supported || !messagingInstance) {
      console.warn('Push messaging is not supported in this browser/environment.');
      return null;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // Get the FCM device token
      const currentToken = await getToken(messagingInstance, { 
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY 
      });
      
      if (currentToken) {
        console.log('FCM Token Generated:', currentToken);
        // This token will later be sent to Render to target this specific device
        return currentToken;
      } else {
        console.warn('No registration token available. Request permission to generate one.');
        return null;
      }
    } else {
      console.warn('Push permission denied by user.');
      return null;
    }
  } catch (error) {
    console.error('An error occurred while retrieving token. ', error);
    return null;
  }
};

// Listener for foreground messages (when the Zync app is actively open on screen)
export const onForegroundMessage = (callback) => {
  if (!messagingInstance) {
    console.warn('FCM Messaging not initialized/supported. Foreground message listener not active.');
    return () => {};
  }
  return onMessage(messagingInstance, (payload) => {
    console.log('Message received in foreground: ', payload);
    callback(payload);
  });
};