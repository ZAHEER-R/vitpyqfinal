(function () {
  window.fb = { ready: false, auth: null, db: null, storage: null, analytics: null, googleProvider: null, app: null };

  function configOk(c) {
    if (!c) return false;
    if (!c.apiKey || String(c.apiKey).indexOf("YOUR_") === 0) return false;
    if (!c.projectId || String(c.projectId).indexOf("YOUR_") === 0) return false;
    return true;
  }

  window.initFirebaseBridge = function initFirebaseBridge() {
    if (!window.USE_FIREBASE) {
      console.info("[VIT PYQ] Firebase disabled. Using localStorage.");
      return Promise.resolve(false);
    }
    if (!configOk(window.FIREBASE_CONFIG)) {
      console.warn("[VIT PYQ] Firebase config incomplete. Using localStorage.");
      return Promise.resolve(false);
    }
    if (typeof firebase === "undefined") {
      console.warn("[VIT PYQ] Firebase SDK not loaded.");
      return Promise.resolve(false);
    }
    try {
      if (!firebase.apps.length) {
        window.fb.app = firebase.initializeApp(window.FIREBASE_CONFIG);
      } else {
        window.fb.app = firebase.app();
      }
      if (typeof firebase.analytics === "function") {
        try {
          window.fb.analytics = firebase.analytics();
        } catch (e) {
          console.info("[VIT PYQ] Analytics unavailable in this browser.");
        }
      }
      window.fb.auth = firebase.auth();
      window.fb.db = firebase.firestore();
      window.fb.storage = firebase.storage();
      window.fb.googleProvider = new firebase.auth.GoogleAuthProvider();
      window.fb.googleProvider.setCustomParameters({
        hd: window.VIT_EMAIL_DOMAIN || "vitstudent.ac.in",
        prompt: "select_account"
      });
      window.fb.ready = true;
      console.info("[VIT PYQ] Firebase ready.");
      return Promise.resolve(true);
    } catch (e) {
      console.error("[VIT PYQ] Firebase init failed", e);
      window.fb.ready = false;
      return Promise.resolve(false);
    }
  };
})();
