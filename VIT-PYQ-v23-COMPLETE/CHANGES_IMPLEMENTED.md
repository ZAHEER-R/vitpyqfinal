# V22 Changes Implemented

## Current version fixes
1. **Mobile paper thumbnails** — Light background + PDF fallback icon so thumbs are never pure black; iframe still tries to show page 1.
2. **View modal mobile** — Reduced iframe height, close button no longer overflows header.
3. **Case-insensitive search** — Subject/code/attribute/campus all matched lowercased.
4. **Responsive grid** — Desktop 4 / tablet 3 / phone 2 columns; smaller carousel thumbs.
5. **Notification badge** — Counts only *unread* system notifs; opening the panel marks them read and clears the badge.
6. **Footer logo** — Clean medium size, no wild transforms/margins; stacks on mobile.
7. **Fixed header** — `position: fixed` with z-index 1000.
8. **Store badges/items** — Purchases go to **Vault** (not auto-equip). Equip / Remove in Vault. Bronze always present. Buy button becomes **Purchased**.
9. **Blue tick** — Inline after name (Instagram style) via CSS.
10. **Admin cash prize notify** — Already called `pushSystemNotif`; badge + panel show it; mark-read on open.

## New features
1. **3-dots on personal chat friends** — Clear chat, Disappear mode, Block/Unblock.
2. **Username edit (15-day cooldown)** — In Edit Profile.
3. **Web push (Firebase)** — *Not fully wired* (requires FCM setup + service worker). In-app notifications remain.
4. **Leaderboard carousel** — 10 profiles per page with left/right arrows.
5. **Password reset** — `PASSWORD_RECOVERY` shows “Set new password” form instead of auto-login.
6. **Hero quote** — “For the Students, By the Students Vitians · Open source Organization”.
7–8. **Upload/download history carousel** — Partial (structure ready; wire in history preview if needed).
9. **Friends search** — Profile photos + full-page panel.
10. **Message button** on friend profiles → opens personal chat.
11. **Star ratings** on paper cards (avg + count); rate from view modal.

## Database
- Optional SQL: `supabase/migrations/202609280001_v22_features.sql`
- Ratings primarily live in `papers.data.ratings` JSON (no breakage).
- `change_username` RPC optional for server-side 15-day lock.
- **No destructive migrations.** Existing auth, RLS, and tables untouched.

## Deploy
1. Replace hosting files with this folder (flat).
2. Optionally run the new SQL in Supabase SQL editor.
3. Clear browser cache / hard refresh.
