# VIT PYQ's 2026 — v20

Previous year questions platform for VITians (static frontend with Supabase Auth, Database, and Storage).

## Quick start
1. Unzip **all files into one folder** (keep everything in the root — no subfolders required)
2. Open `index.html` in a browser, or:
   ```bash
   npx --yes serve -l 5000 .
   ```
3. Configure the Supabase project and apply the SQL migrations before using account, chat, store, and upload features.

See **AUTH.md**, **DATABASE.md**, and **DEPLOY.md** for the active Supabase setup. Firebase Hosting may be used to serve the static frontend; Firebase Auth/Firestore files are legacy and are not loaded by the app.

## Main files
- `index.html` — UI
- `styles.css` — styles
- `app.js` — application logic
- `supabase-config.js` / `supabase-client.js` / `supabase-sync.js` — active Supabase integration
- `supabase/migrations/` — schema and row-level security migrations
- `firebase.json` — optional static Hosting configuration

## Auth summary
- VIT student Google sign-in is restricted to `@vitstudent.ac.in`.
- Password accounts are managed by Supabase Auth.
- Admin privileges are granted in Supabase; do not use local demo credentials on the live site.
