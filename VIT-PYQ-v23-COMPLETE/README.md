# VIT PYQ's 2026 — v20

Previous year questions platform for VITians (flat static site).

## Quick start (no Firebase)
1. Unzip **all files into one folder** (keep everything in the root — no subfolders required)
2. Open `index.html` in a browser, or:
   ```bash
   npx --yes serve -l 5000 .
   ```
3. Admin login: `admin@vitstudent.ac.in` / `admin2026`

## Firebase
See **CONNECT.md** for Auth (Google), Firestore, and Storage setup.

## Main files
- `index.html` — UI
- `styles.css` — styles
- `app.js` — application logic
- `firebase-config.js` — your keys + `USE_FIREBASE` flag
- `firebase-bridge.js` / `firebase-api.js` / `firebase-sync.js` — Firebase helpers
- `firestore.rules` / `storage.rules` / `firebase.json` — deploy config

## Auth summary
- Google → `@vitstudent.ac.in` only
- Register/Login password → any other email (Gmail, Yahoo, Outlook…)
- Admin password still works for the bootstrap admin account
