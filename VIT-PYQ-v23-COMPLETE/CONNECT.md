# Connect Firebase (Auth + Firestore + Storage)

This app runs **without** Firebase (localStorage). When you are ready, connect a Firebase project.

## 1. Create a Firebase project
1. Open https://console.firebase.google.com/
2. **Add project** → name it (e.g. `vit-pyq-2026`)
3. Disable Google Analytics if you do not need it (optional)

## 2. Register a Web app
1. Project overview → **Web** (`</>`)
2. App nickname: `VIT PYQ`
3. Copy the `firebaseConfig` object values

## 3. Confirm the configured project
`firebase-config.js` and `.firebaserc` are configured for `vit-pyq-v2`. If you use another Firebase project, replace the web app values and project ID in those files.

```js
window.FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "your-id.firebaseapp.com",
  projectId: "vit-pyq-v2",
  storageBucket: "your-id.appspot.com",
  messagingSenderId: "339392780723",
  appId: "1:339392780723:web:4abb9846e0b9f5b56813c6"
};
window.USE_FIREBASE = true;
```

Also set **`.firebaserc`** → `"default": "your-id"`.

## 4. Enable Authentication (Google OAuth)
1. Firebase Console → **Build → Authentication → Get started**
2. **Sign-in method → Google → Enable**
3. Set support email
4. (Optional) Under **Settings → Authorized domains**, add your hosting domain and `localhost`
5. Google sign-in in the app is restricted to **`@vitstudent.ac.in`** in code (`firebase-api.js` + `hd` parameter)

## 5. Create Firestore database
1. **Build → Firestore Database → Create database**
2. Start in **production mode** (rules file is provided)
3. Choose a region close to users (e.g. `asia-south1`)
4. Deploy rules:
   ```bash
   npm i
   npx firebase login
   npx firebase deploy --only firestore:rules
   ```

## 6. Create Storage bucket
1. **Build → Storage → Get started**
2. Use the default bucket (same as `storageBucket` in config)
3. Deploy rules:
   ```bash
   npx firebase deploy --only storage
   ```
4. Paper PDFs / images can be uploaded under `papers/`; avatars under `avatars/{uid}/`

## 7. Hosting (optional)
```bash
npx firebase deploy --only hosting
```
`firebase.json` serves the **root** folder (flat structure — no `public/` folder required).

## 8. Verify
1. Open the site
2. Browser console should log: `[VIT PYQ] Firebase ready.`
3. **Continue with Google** → pick a `@vitstudent.ac.in` account
4. Other emails still use the app's local password login; Firebase password authentication is not configured in this app.

## Notes
- Firebase Auth, Firestore, Storage, and Analytics must be enabled for `vit-pyq-v2` in the Firebase Console; this repository cannot enable those project services remotely.
- Until those services and authorized domains are configured, Firebase operations can fail and the app keeps its localStorage fallback.
- Passwords are not included in Firestore user mirrors. Existing local password accounts remain local and are not migrated to Firebase Authentication.
- OTP “forgot password” is **demo-mode** in the client (shows OTP in an alert). For production, use Firebase Email Auth or a Cloud Function to send mail.
- Large PDF data-URLs in localStorage can hit quota; with Storage enabled, prefer uploading files to the bucket and saving download URLs in Firestore.
