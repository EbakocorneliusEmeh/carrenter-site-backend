create extension if not exists pgcrypto;

do $$
begin
  create type user_role as enum ('CUSTOMER', 'DEALER', 'ADMIN');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type dealer_status as enum ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUSPENDED');
exception
  when duplicate_object then null;
end $$;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  phone text not null unique,
  password_hash text not null,
  role user_role not null default 'CUSTOMER',
  is_verified boolean not null default false,
  refresh_token text,
  password_reset_token_hash text,
  password_reset_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  full_name text not null,
  address text,
  profile_photo text,
  driver_license_front_image text,
  driver_license_back_image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists dealer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  business_name text not null,
  status dealer_status not null default 'PENDING_APPROVAL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_users_email on users(email);
create index if not exists idx_users_phone on users(phone);
create index if not exists idx_users_password_reset_token_hash on users(password_reset_token_hash);
