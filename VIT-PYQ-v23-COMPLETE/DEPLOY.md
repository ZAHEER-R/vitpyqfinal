# Deploy guide — VIT PYQ v22

## 1) Supabase SQL (existing project)

1. Open https://supabase.com/dashboard → your project
2. **SQL Editor** → New query
3. Paste contents of `RUN_IN_SUPABASE_SQL_EDITOR.sql`
4. Click **Run**
5. Should complete without errors (safe / idempotent)

Do **not** run the full `202609260001_vitpyq.sql` again if the DB already exists — only the v22 file above.

## 2) Firebase Hosting deploy (terminal)

```bash
# Unzip the project and enter the folder
cd VIT-PYQ-v22-complete

# Login once (browser)
npx firebase login

# Confirm project (should be vit-pyq-v2)
npx firebase use vit-pyq-v2

# Deploy hosting only (recommended)
npx firebase deploy --only hosting

# Optional: also deploy rules
npx firebase deploy --only hosting,firestore:rules,storage
```

Or with global CLI:

```bash
npm i -g firebase-tools
firebase login
firebase use vit-pyq-v2
firebase deploy --only hosting
```

After deploy, hard-refresh the site (Ctrl+Shift+R).
