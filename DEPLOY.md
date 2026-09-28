# Deploy guide — VIT PYQ v23

## 1) Supabase SQL (existing project)

1. Open https://supabase.com/dashboard → your project
2. **SQL Editor** → New query
3. Paste contents of `RUN_IN_SUPABASE_SQL_EDITOR.sql`
4. Click **Run**. This script includes the current additive migration for username persistence, friend restoration, notifications, chat clears/unsend, inventory, and announcements; it is safe to rerun.

The optional ratings migration is `supabase/migrations/202609280001_v22_features.sql`. Do not rerun the initial schema migration against an existing database.

## 2) Background push setup

1. Firebase Console → Project settings → Cloud Messaging → create a Web Push certificate. Put its public key in `firebase-config.js` as `FIREBASE_VAPID_KEY`.
2. Create a Firebase service account with Firebase Cloud Messaging API access. In Supabase project secrets, set `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, and `FCM_PRIVATE_KEY` (the private key is server-only; never put it in the website).
3. Deploy the sender from the project root: `npx supabase functions deploy send-push --project-ref lbtciciychdyizmmmfyo`.
4. Users must enable device notifications in their profile. On iPhone/iPad, browser push requires a supported iOS version and the website added to the Home Screen.

## 3) Firebase Hosting deploy (terminal)

```bash
# Open the project root (the folder containing firebase.json)
cd VIT-PYQ-v23-COMPLETE

# Login once (browser)
npx firebase login

# Confirm project (should be vit-pyq-v2)
npx firebase use vit-pyq-v2

# Deploy hosting only
npx firebase deploy --only hosting --project vit-pyq-v2 --config firebase.json

# Firestore/Storage rules are legacy; Supabase handles app data and uploads.
```

Or with global CLI:

```bash
npm i -g firebase-tools
firebase login
npx firebase deploy --only hosting --project vit-pyq-v2 --config firebase.json
```

After deploy, hard-refresh the site (Ctrl+Shift+R).
