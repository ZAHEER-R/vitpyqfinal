# Authentication and admin setup

## Supabase Auth
- Email/password accounts are created and authenticated by Supabase Auth; passwords are never stored in app tables.
- VIT student accounts use Google sign-in. The admin email is allowed to use email/password.
- Enable the required providers and configure redirect URLs in Supabase Dashboard → Authentication.
- Confirm the admin email before granting admin privileges.

## Grant admin privileges
1. Apply `supabase/migrations/202609260001_vitpyq.sql` in the Supabase SQL Editor.
2. Create and confirm `admin@vitstudent.ac.in` through the app's registration form or Supabase Auth dashboard. Set its password in the Auth flow; do not add the password to SQL.
3. Run `supabase/bootstrap-admin.sql` in the SQL Editor.
4. Log out and log back in so the app reloads the admin profile.

## Existing database update
- For an existing project, run `supabase/migrations/202609260002_private_friend_profiles.sql` once in the Supabase SQL Editor. Profiles stay discoverable with a Private label; private upload/download history is hidden from non-friends, while accepted friends can open the profile.
- The migration updates signup usernames to use the requested/email name without an ID suffix. A short numeric suffix is added only when that username is already taken.

Use a unique, strong password for the live admin account. The old local demo admin password is not a Supabase Auth account credential.

## Background web push (optional)
- Set `FIREBASE_VAPID_KEY` in `firebase-config.js` to the public Web Push certificate from Firebase Project Settings → Cloud Messaging.
- Run `RUN_IN_SUPABASE_SQL_EDITOR.sql` to create owner-protected `user_push_tokens` storage.
- Set `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, and `FCM_PRIVATE_KEY` as Supabase Edge Function secrets. Keep the private key out of browser files.
- Deploy `supabase/functions/send-push/index.ts` with `npx supabase functions deploy send-push --project-ref lbtciciychdyizmmmfyo`.
- Users must enable device notifications in Profile. Push delivery while the site is closed requires browser permission, HTTPS, Firebase Cloud Messaging configuration, and a supported browser/device.
