-- Run this in Supabase SQL Editor.
-- Firebase Auth is used by the app, so Storage cannot use auth.uid().
-- Keep the buckets public for reads and restrict accepted uploads by path/type.

insert into storage.buckets (id, name, public)
values ('papers', 'papers', true), ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public can view paper files" on storage.objects;
create policy "Public can view paper files"
on storage.objects for select to public
using (bucket_id = 'papers');

drop policy if exists "Public can upload PDF papers" on storage.objects;
create policy "Public can upload PDF papers"
on storage.objects for insert to public
with check (
  bucket_id = 'papers'
  and lower(storage.extension(name)) = 'pdf'
  and octet_length(name) < 512
);

drop policy if exists "Public can view avatars" on storage.objects;
create policy "Public can view avatars"
on storage.objects for select to public
using (bucket_id = 'avatars');

drop policy if exists "Public can upload avatars" on storage.objects;
create policy "Public can upload avatars"
on storage.objects for insert to public
with check (
  bucket_id = 'avatars'
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'gif', 'webp')
  and octet_length(name) < 512
);