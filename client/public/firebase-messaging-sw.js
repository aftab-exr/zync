// Firebase Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const params = new URL(location).searchParams;
const firebaseConfig = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId')
};

if (firebaseConfig.apiKey) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage(async (payload) => {
    if (!payload || !payload.data) return;

    const { senderName, conversationId } = payload.data;
    const notificationTitle = 'New Message';
    const notificationOptions = {
      body: senderName ? `${senderName} sent you a message` : 'You have a new message',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      vibrate: [200, 100, 200],
      data: {
        conversationId: conversationId
      }
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
  });
}

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const conversationId = event.notification.data?.conversationId;
  const targetUrl = conversationId ? '/chat/' + conversationId : '/inbox';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes('/inbox') || client.url.includes('/chat')) {
          if (conversationId && 'navigate' in client) {
            return client.navigate(targetUrl).then(() => client.focus());
          }
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});