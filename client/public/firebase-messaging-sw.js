// client/public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// TODO: Replace these with your actual Firebase config variables from client/src/lib/firebase.js
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID    
};

// Initialize the Firebase app in the service worker
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// The Zero-Knowledge Silent Intercept
messaging.onBackgroundMessage(async (payload) => {
  console.log('[Firebase SW] Received silent data payload: ', payload);

  // 1. Extract the encrypted data from the silent push
  const { senderName, ciphertext } = payload.data;

  // 2. TODO: In Phase 1.5, we will import your Dexie DB and Crypto logic here 
  // to decrypt the 'ciphertext' using the local Private Key.
  
  // For now, we will show a secure placeholder to prove the background wake-up works
  const notificationTitle = `New Secure Message`;
  const notificationOptions = {
    body: `Encrypted payload received from ${senderName}`,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png', // Small monochrome icon for Android status bar
    vibrate: [200, 100, 200],
    data: {
      url: '/' // Clicking the notification opens the Zync PWA
    }
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle user clicking the notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      if (windowClients.length > 0) {
        // App is already open, focus it
        return windowClients[0].focus();
      } else {
        // App is closed, open it
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});