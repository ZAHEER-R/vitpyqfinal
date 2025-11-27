# Supabase Setup Instructions

To permanently connect your project to Supabase, follow these steps:

## 1. Create a Supabase Project
1. Go to [Supabase](https://supabase.com/) and sign in.
2. Create a new project.
3. Wait for the database to be provisioned.

## 2. Get Credentials
1. Go to **Project Settings** -> **API**.
2. Copy the **Project URL** (`SUPABASE_URL`).
3. Copy the **anon public** key (`SUPABASE_KEY`).
4. Open `server/.env` in your editor and paste these values:
   ```env
   SUPABASE_URL=your_project_url
   SUPABASE_KEY=your_anon_key
   ```

## 3. Create Database Tables
1. Go to the **SQL Editor** in the Supabase dashboard.
2. Copy the content of `server/db_schema.sql` and paste it into the SQL Editor.
3. Click **Run**.

## 4. Set Up Storage
1. Go to **Storage** in the Supabase dashboard.
2. Create a new bucket named `papers`.
3. **Important:** Toggle "Public bucket" to ON.
4. Save the bucket.

## 5. Restart Server
1. Stop your current server (Ctrl+C).
2. Run `npm start` or `node server.js` in the `server` directory.

Your project is now connected to Supabase! All uploads will be stored in the cloud, and data will be persisted permanently.
