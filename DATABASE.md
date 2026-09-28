# Data model

Supabase is the active database and authentication provider. Browser `localStorage` stores a cache; signed-in changes sync to Supabase.

## Supabase tables
- `profiles`: public profile fields, username, badge, wallet and counters.
- `user_state`: private profile details, preferences, histories and per-user chat state.
- `papers`: paper metadata; PDFs and images are stored separately.
- `global_messages` and `private_messages`: global chat and participant-only conversations. Private messages track recipient read receipts.
- `friend_requests`: pending and accepted friend relationships.
- `user_inventory` and `wallet_transactions`: purchased items and wallet audit history.
- `user_notifications`: durable recipient inbox entries, including admin rewards and private-message notices.
- `user_push_tokens`: per-user Firebase Cloud Messaging device tokens, writable only by their owner.
- `announcements`: Admin-authored public home-page notices.
- `feedbacks`, `reports`, `highlights`, `paper_likes`, and `paper_events`: feedback, moderation, highlights, likes and paper activity.

## Supabase Storage
- Bucket: `users_data`
- Papers: `papers/{userId}/{paperId}/{filename}`
- Avatars: `avatars/{userId}/profile.jpg`

## Migrations
Apply migrations in timestamp order for a new database. Existing installations can run `RUN_IN_SUPABASE_SQL_EDITOR.sql`, or apply `supabase/migrations/202609280002_chat_store_notifications.sql` after the base schema. These additive updates provide durable chat clears/unsend, friend restoration, notifications, push tokens, announcements, purchased badge inventory, and the 15-day username lock. Row-level security is defined in the migrations.

Firebase/Firestore files are legacy hosting configuration and are not loaded as the app's data backend.
