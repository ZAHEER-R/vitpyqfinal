window.FirebaseAPI = {
  async signInWithGoogle() {
    if (!window.fb || !window.fb.ready) throw new Error("Firebase not ready");
    const result = await window.fb.auth.signInWithPopup(window.fb.googleProvider);
    const user = result.user;
    const email = (user.email || "").toLowerCase();
    const domain = window.VIT_EMAIL_DOMAIN || "vitstudent.ac.in";
    if (!email.endsWith("@" + domain)) {
      await window.fb.auth.signOut();
      throw new Error("Only @" + domain + " Google accounts are allowed");
    }
    return {
      uid: user.uid,
      email: email,
      displayName: user.displayName || email.split("@")[0],
      photoURL: user.photoURL || "",
      emailVerified: !!user.emailVerified
    };
  },

  async signOut() {
    if (window.fb && window.fb.ready) await window.fb.auth.signOut();
  },

  async upsertUser(profile) {
    if (!window.fb || !window.fb.ready) return;
    await window.fb.db.collection("users").doc(profile.id).set(profile, { merge: true });
  },

  async getUser(id) {
    if (!window.fb || !window.fb.ready) return null;
    const snap = await window.fb.db.collection("users").doc(id).get();
    return snap.exists ? snap.data() : null;
  },

  async saveCollection(name, items) {
    if (!window.fb || !window.fb.ready) return;
    await window.fb.db.collection("mirrors").doc(name).set({ items: items, updatedAt: Date.now() });
  },

  async loadCollection(name) {
    if (!window.fb || !window.fb.ready) return null;
    const snap = await window.fb.db.collection("mirrors").doc(name).get();
    return snap.exists ? (snap.data().items || []) : null;
  },

  async uploadFile(path, dataUrl) {
    if (!window.fb || !window.fb.ready) return dataUrl;
    const ref = window.fb.storage.ref().child(path);
    await ref.putString(dataUrl, "data_url");
    return await ref.getDownloadURL();
  }
};
