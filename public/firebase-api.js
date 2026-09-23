/**
 * VIT PYQ's — Firebase API layer (Auth, Firestore, Storage, Functions)
 * Used when FIREBASE_CONFIG has real keys. Otherwise app.js stays on localStorage.
 */
(function (global) {
  const cfg = global.FIREBASE_CONFIG || {};
  const ready = cfg.apiKey && cfg.apiKey !== 'YOUR_API_KEY';

  global.vitAuthRules = {
    isVitStudentEmail(email) {
      const d = (email || '').split('@')[1]?.toLowerCase() || '';
      return (global.VIT_OAUTH_DOMAINS || ['vitstudent.ac.in']).includes(d);
    },
    canPasswordRegister(email) {
      const d = (email || '').split('@')[1]?.toLowerCase() || '';
      if (this.isVitStudentEmail(email)) return false;
      return (global.PASSWORD_SIGNUP_DOMAINS || ['gmail.com']).includes(d);
    },
    canGoogleSignIn(email) {
      return this.isVitStudentEmail(email);
    }
  };

  if (!ready) {
    global.VITPYQ_BACKEND = 'local';
    global.VitApi = null;
    console.info('[VITPYQ] Demo mode (localStorage). Paste keys in firebase-config.js to enable Firebase.');
    return;
  }

  if (typeof firebase === 'undefined') {
    console.error('[VITPYQ] Firebase SDK not loaded');
    global.VITPYQ_BACKEND = 'local';
    return;
  }

  firebase.initializeApp(cfg);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const storage = firebase.storage();
  const supabaseCfg = global.SUPABASE_CONFIG || {};
  const supabaseReady = global.supabase && supabaseCfg.url &&
    supabaseCfg.url !== 'YOUR_SUPABASE_URL' && supabaseCfg.anonKey &&
    supabaseCfg.anonKey !== 'YOUR_SUPABASE_ANON_KEY';
  const supabase = supabaseReady
    ? global.supabase.createClient(supabaseCfg.url, supabaseCfg.anonKey)
    : null;
  let functions = null;
  try { functions = firebase.functions(); } catch (e) {}

  global.VITPYQ_BACKEND = 'firebase';

  const VitApi = {
    auth, db, storage, functions,

    /** Google Sign-In — rejects non-@vitstudent.ac.in */
    async signInWithGoogle() {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account', hd: 'vitstudent.ac.in' });
      const result = await auth.signInWithPopup(provider);
      const email = result.user.email || '';
      if (!global.vitAuthRules.canGoogleSignIn(email)) {
        await auth.signOut();
        throw new Error('Google Sign-In is only for @vitstudent.ac.in');
      }
      await this.ensureUserDoc(result.user);
      return result.user;
    },

    /** Register with Gmail + password only */
    async registerEmail(email, password, profile) {
      if (!global.vitAuthRules.canPasswordRegister(email)) {
        throw new Error('Register with Gmail only. VIT students must use Google Sign-In.');
      }
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await this.ensureUserDoc(cred.user, profile);
      return cred.user;
    },

    async loginEmail(email, password) {
      const cred = await auth.signInWithEmailAndPassword(email, password);
      await this.ensureUserDoc(cred.user);
      return cred.user;
    },

    async logout() {
      await auth.signOut();
    },

    onAuth(cb) {
      return auth.onAuthStateChanged(cb);
    },

    async ensureUserDoc(user, extra = {}) {
      const ref = db.collection('users').doc(user.uid);
      const snap = await ref.get();
      if (!snap.exists) {
        const uname = (user.email || 'user').split('@')[0].replace(/[^a-z0-9]/gi, '').slice(0, 16) || 'user';
        await ref.set({
          uid: user.uid,
          email: user.email,
          displayName: extra.displayName || user.displayName || uname,
          username: (extra.username || uname).toLowerCase(),
          firstName: extra.firstName || '',
          lastName: extra.lastName || '',
          branch: extra.branch || '',
          avatar: user.photoURL || '',
          badge: 'bronze',
          verified: false,
          vcash: 0,
          uploads: 0,
          downloads: 0,
          visits: 1,
          isAdmin: false,
          items: [],
          activeItems: [],
          friends: [],
          requests: [],
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } else {
        await ref.update({ visits: firebase.firestore.FieldValue.increment(1) });
      }
      return (await ref.get()).data();
    },

    userRef(uid) { return db.collection('users').doc(uid); },
    async updateUser(uid, data) {
      await db.collection('users').doc(uid).set(data, { merge: true });
    },
    papersCol() { return db.collection('papers'); },

    async getUser(uid) {
      const s = await db.collection('users').doc(uid).get();
      return s.exists ? { id: s.id, ...s.data() } : null;
    },

    listenUsers(cb) {
      return db.collection('users').onSnapshot(snap => {
        cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
    },

    listenPapers(cb) {
      return db.collection('papers').orderBy('createdAt', 'desc').onSnapshot(snap => {
        cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, err => console.warn('papers listen', err));
    },

    async uploadPaperFile(uid, file) {
      const path = `papers/${uid}/${Date.now()}_${file.name}`;
      if (supabase) {
        const { error } = await supabase.storage.from(supabaseCfg.bucket || 'papers').upload(path, file, {
          contentType: 'application/pdf',
          upsert: false
        });
        if (error) throw error;
        const { data } = supabase.storage.from(supabaseCfg.bucket || 'papers').getPublicUrl(path);
        return { path, url: data.publicUrl };
      }
      const ref = storage.ref(path);
      await ref.put(file, { contentType: 'application/pdf' });
      const url = await ref.getDownloadURL();
      return { path, url };
    },

    async uploadAvatar(uid, file) {
      if (!supabase) throw new Error('Supabase Storage is not configured');
      if (!file.type || !file.type.startsWith('image/')) throw new Error('Profile photo must be an image');
      if (file.size > 2 * 1024 * 1024) throw new Error('Profile photo must be smaller than 2 MB');
      const bucket = supabaseCfg.avatarBucket || 'avatars';
      const path = `${uid}/profile_${Date.now()}_${file.name.replace(/[^a-z0-9._-]/gi, '_')}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        contentType: file.type,
        upsert: false
      });
      if (error) throw error;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      return { path, url: data.publicUrl };
    },

    async createPaper(data) {
      const doc = await db.collection('papers').add({
        ...data,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        views: 0,
        downloads: 0,
        likes: 0,
        likedBy: []
      });
      return doc.id;
    },

    async deletePaper(id) {
      await db.collection('papers').doc(id).delete();
    },

    listenGlobalChat(cb) {
      return db.collection('chats').doc('global').collection('messages')
        .orderBy('ts', 'asc').limitToLast(100)
        .onSnapshot(snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    },

    async sendGlobalMessage(payload) {
      await db.collection('chats').doc('global').collection('messages').add({
        ...payload,
        ts: Date.now(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    },

    chatId(a, b) {
      return [a, b].sort().join('_');
    },

    listenPrivateChat(uidA, uidB, cb) {
      const id = this.chatId(uidA, uidB);
      return db.collection('privateChats').doc(id).collection('messages')
        .orderBy('ts', 'asc').limitToLast(100)
        .onSnapshot(snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    },

    async sendPrivateMessage(uidA, uidB, payload) {
      const id = this.chatId(uidA, uidB);
      await db.collection('privateChats').doc(id).collection('messages').add({
        ...payload,
        ts: Date.now(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    },

    async requestPasswordOtp(email) {
      if (!functions) throw new Error('Functions not available');
      const fn = functions.httpsCallable('requestPasswordOtp');
      return (await fn({ email })).data;
    },

    async verifyPasswordOtp(email, otp, newPassword) {
      if (!functions) throw new Error('Functions not available');
      const fn = functions.httpsCallable('verifyPasswordOtp');
      return (await fn({ email, otp, newPassword })).data;
    }
  };

  global.VitApi = VitApi;
  console.info('[VITPYQ] Firebase API ready');
})(window);
