-- Run this in the Supabase SQL Editor

-- Create Users Table
create table users (
  id uuid default gen_random_uuid() primary key,
  first_name text not null,
  last_name text not null,
  email text not null unique,
  phone text not null,
  password text not null,
  points int default 0,
  level text default 'Silver',
  profile_pic text default '',
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Create Papers Table
create table papers (
  id uuid default gen_random_uuid() primary key,
  subject text not null,
  course_code text not null,
  exam_year text not null,
  exam_name text not null,
  category text not null,
  file_path text not null,
  uploader_id uuid references users(id) not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Storage Instructions:
-- 1. Go to Storage in Supabase Dashboard.
-- 2. Create a new bucket named 'papers'.
-- 3. Set the bucket to Public.
