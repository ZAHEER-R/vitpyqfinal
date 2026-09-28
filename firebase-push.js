(function() {
  let messaging = null;
  let registration = null;

  async function setup() {
    if (!window.firebase || !window.FIREBASE_CONFIG) throw new Error('Firebase messaging SDK/config is unavailable');
    if (!window.FIREBASE_VAPID_KEY || window.FIREBASE_VAPID_KEY === 'YOUR_PUBLIC_VAPID_KEY') {
      throw new Error('Set FIREBASE_VAPID_KEY in firebase-config.js');
    }
    if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
    if (!firebase.messaging.isSupported || !await firebase.messaging.isSupported()) {
      throw new Error('This browser does not support Firebase web push');
    }
    registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
    messaging = firebase.messaging();
    messaging.onMessage(async payload => {
      const data = payload.data || {};
      const serviceWorker = await navigator.serviceWorker.ready;
      await serviceWorker.showNotification(data.title || "VIT PYQ's", {
        body: data.body || '',
        icon: './favicon.png',
        badge: './favicon.png',
        data: { friendId: data.friendId || '', url: data.url || './' }
      });
    });
    return messaging;
  }

  let activeToken = null;

  window.FirebasePush = {
    async enable() {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) return null;
      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return null;
      }
      const client = await setup();
      activeToken = await client.getToken({ vapidKey: window.FIREBASE_VAPID_KEY, serviceWorkerRegistration: registration });
      return activeToken;
    },
    async disable() {
      if (!messaging) {
        if (!window.firebase || !firebase.apps.length) return activeToken;
        messaging = firebase.messaging();
      }
      if (!activeToken && window.FIREBASE_VAPID_KEY && window.FIREBASE_VAPID_KEY !== 'YOUR_PUBLIC_VAPID_KEY') {
        activeToken = await messaging.getToken({ vapidKey: window.FIREBASE_VAPID_KEY });
      }
      const token = activeToken;
      await messaging.deleteToken();
      activeToken = null;
      return token;
    }
  };
})();
