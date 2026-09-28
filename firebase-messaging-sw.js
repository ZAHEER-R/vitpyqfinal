importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCz1ZNnQE38ahmJSfziNUnM2NPaM8cK3O0',
  authDomain: 'vit-pyq-v2.firebaseapp.com',
  projectId: 'vit-pyq-v2',
  storageBucket: 'vit-pyq-v2.firebasestorage.app',
  messagingSenderId: '339392780723',
  appId: '1:339392780723:web:4abb9846e0b9f5b56813c6',
  measurementId: 'G-XVXY6DESCS'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const data = payload.data || {};
  self.registration.showNotification(data.title || "VIT PYQ's", {
    body: data.body || '',
    icon: './favicon.png',
    badge: './favicon.png',
    data: { friendId: data.friendId || '', url: data.url || './' }
  });
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const details = event.notification.data || {};
  const url = details.url || './';
  event.waitUntil((async function() {
    const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const page of pages) {
      if ('focus' in page) {
        if (details.friendId && page.navigate) await page.navigate(url);
        await page.focus();
        if (details.friendId) page.postMessage({ type: 'OPEN_FRIEND_CHAT', friendId: details.friendId });
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
