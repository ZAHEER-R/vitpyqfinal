# VIT PYQ's — Full starter bundle (Firebase)

Complete package: **website UI** + **Firebase config** + **API layer** + **Cloud Functions (OTP email)** + **Firestore/Storage rules** + **GitHub Actions branch deploy**.

No Railway, no Render, no Vite. Deploy with **Firebase Hosting** via **GitHub Actions** on `main` / `master`.

---

## Folder map

```
vitpyq-full-starter/
├── public/                    # Frontend (static site)
│   ├── index.html
│   ├── styles.css
│   ├── app.js                 # UI logic (works in demo + Firebase)
│   ├── firebase-config.js     # ← PUT YOUR KEYS HERE
│   ├── firebase-bridge.js
│   ├── firebase-api.js        # Auth / Firestore / Storage / Functions API
│   ├── developer.jpg, logo.jpeg, favicon.png
├── functions/                 # Backend (Cloud Functions)
│   ├── index.js               # OTP email + paper hook
│   └── package.json
├── firestore.rules            # Database security rules
├── firestore.indexes.json
├── storage.rules              # PDF / avatar rules
├── firebase.json              # Hosting + functions wiring
├── .firebaserc                # Project id placeholder
├── .github/workflows/deploy.yml
├── docs/
│   ├── DATABASE.md
│   ├── AUTH.md
│   └── CONNECT.md
└── README.md                  # this file
```

---

## Auth rules

| Method | Allowed |
|--------|---------|
| **Google Sign-In** | Only `@vitstudent.ac.in` |
| **Register (email/password)** | Only **Gmail** (`@gmail.com`) — blocked for `@vitstudent.ac.in` |
| **Login (password)** | Any registered Gmail (or admin) |
| **Forgot password** | OTP emailed via Cloud Functions |

VIT students must use **Continue with Google**, not password signup with student mail.

---

## 1. One-time Firebase setup

1. Create project: https://console.firebase.google.com  
2. Enable **Authentication** → Email/Password + **Google**  
3. Create **Firestore** (production) and **Storage**  
4. Upgrade to **Blaze** if you need Cloud Functions email  
5. Add a **Web app** → copy config  

### Paste keys

Edit `public/firebase-config.js`:

```js
window.FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

Edit `.firebaserc`:

```json
{ "projects": { "default": "your-project-id" } }
```

---

## 2. Local deploy (CLI)

```bash
npm install -g firebase-tools
firebase login
cd vitpyq-full-starter
cd functions && npm install && cd ..
firebase deploy
```

URL: `https://YOUR_PROJECT_ID.web.app`

### OTP email (Gmail app password)

```bash
firebase functions:config:set smtp.user="you@gmail.com" smtp.pass="APP_PASSWORD"
firebase deploy --only functions
```

---

## 3. GitHub Actions deploy (branch)

1. Push this folder to a GitHub repo.  
2. Repo → **Settings → Secrets and variables → Actions** → add:

| Secret | Value |
|--------|--------|
| `FIREBASE_TOKEN` | Run locally: `firebase login:ci` → paste token |
| `FIREBASE_PROJECT_ID` | Your Firebase project id |
| `SMTP_USER` | (optional) Gmail for OTP |
| `SMTP_PASS` | (optional) Gmail app password |

3. Push to **`main`** or **`master`** → workflow **Deploy Firebase** runs automatically.  
4. Or run **Actions → Deploy Firebase → Run workflow**.

Hosting updates on every push to those branches. No Vite, no Railway, no Render.

---

## 4. Make an admin

Firestore → `users` → your user document → field:

```
isAdmin: true
```

---

## 5. How data & notifications connect

See detailed docs:

- [`docs/CONNECT.md`](docs/CONNECT.md) — wire Auth, live data, OTP from the UI  
- [`docs/DATABASE.md`](docs/DATABASE.md) — collections & fields  
- [`docs/AUTH.md`](docs/AUTH.md) — Google vs Gmail rules  

**API entry point:** `window.VitApi` (from `firebase-api.js`) after keys are set.

Examples:

```js
// Google (VIT only)
await VitApi.signInWithGoogle();

// Gmail register
await VitApi.registerEmail('you@gmail.com', 'secret12', { displayName: 'You', username: 'you' });

// Live papers
VitApi.listenPapers(papers => { /* render */ });

// OTP
await VitApi.requestPasswordOtp('you@gmail.com');
await VitApi.verifyPasswordOtp('you@gmail.com', '123456', 'newpass12');
```

Until keys are real, the site runs in **localStorage demo** mode (`VITPYQ_BACKEND === 'local'`).

---

## 6. Checklist

- [ ] Firebase project + Auth (Email + Google)  
- [ ] Firestore + Storage  
- [ ] Keys in `firebase-config.js`  
- [ ] `.firebaserc` project id  
- [ ] `firebase deploy` or GitHub Actions secrets  
- [ ] SMTP for OTP (Blaze)  
- [ ] Admin `isAdmin: true`  
- [ ] Test Google `@vitstudent.ac.in`  
- [ ] Test Gmail register  
- [ ] Confirm VIT email blocked on password register  

---

## License / note

Student project starter for VIT PYQ sharing. Replace keys only; do not commit production secrets to a public repo without restrictions.
