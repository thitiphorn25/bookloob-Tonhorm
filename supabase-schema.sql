-- BookLoop database setup for Supabase
-- Run the entire script in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  author text not null,
  isbn text,
  category text not null,
  condition text not null,
  listing_type text not null check (listing_type in ('ขาย','ส่งต่อฟรี')),
  price numeric(10,2) not null default 0 check (price >= 0),
  description text,
  image_url text not null,
  seller_name text not null,
  seller_phone text,
  seller_line text,
  seller_email text not null,
  status text not null default 'available' check (status in ('available','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint free_listing_zero_price check (listing_type <> 'ส่งต่อฟรี' or price = 0)
);

create index if not exists listings_status_created_idx on public.listings(status, created_at desc);
create index if not exists listings_title_idx on public.listings using gin (to_tsvector('simple', title));
create index if not exists listings_seller_idx on public.listings(seller_id);

alter table public.listings enable row level security;

drop policy if exists "Anyone can view available listings" on public.listings;
create policy "Anyone can view available listings" on public.listings
for select using (status = 'available' or auth.uid() = seller_id);

drop policy if exists "Authenticated users can create own listings" on public.listings;
create policy "Authenticated users can create own listings" on public.listings
for insert to authenticated with check (auth.uid() = seller_id);

drop policy if exists "Owners can update own listings" on public.listings;
create policy "Owners can update own listings" on public.listings
for update to authenticated using (auth.uid() = seller_id) with check (auth.uid() = seller_id);

drop policy if exists "Owners can delete own listings" on public.listings;
create policy "Owners can delete own listings" on public.listings
for delete to authenticated using (auth.uid() = seller_id);

-- Public book-cover bucket. Upload is restricted to each user's own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('book-covers', 'book-covers', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Anyone can view book covers" on storage.objects;
create policy "Anyone can view book covers" on storage.objects
for select using (bucket_id = 'book-covers');

drop policy if exists "Users upload covers to own folder" on storage.objects;
create policy "Users upload covers to own folder" on storage.objects
for insert to authenticated with check (bucket_id = 'book-covers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update covers in own folder" on storage.objects;
create policy "Users update covers in own folder" on storage.objects
for update to authenticated using (bucket_id = 'book-covers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete covers in own folder" on storage.objects;
create policy "Users delete covers in own folder" on storage.objects
for delete to authenticated using (bucket_id = 'book-covers' and (storage.foldername(name))[1] = auth.uid()::text);
