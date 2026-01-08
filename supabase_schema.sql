-- supabase_schema.sql
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- 1) Page views
create table if not exists telemetry_pv (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cid text not null,
  ip_hash text,
  ua text,
  device text,
  path text,
  ref text,
  country text,
  region text,
  city text
);

-- 2) Searches (privacy: prefix+len+hash only)
create table if not exists telemetry_search (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cid text not null,
  ip_hash text,
  device text,
  path text,

  q_prefix text,
  q_len int,
  q_hash text,
  lang text,

  hit_count int,
  hit_id text,
  is_zero boolean,

  country text,
  region text,
  city text
);

-- 3) Zero-hit queue (your backlog)
create table if not exists telemetry_zero (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cid text not null,
  ip_hash text,
  device text,
  path text,

  q_prefix text,
  q_len int,
  q_hash text,
  lang text,

  country text,
  region text,
  city text
);

-- 4) LLM drafts (optional; pending review)
create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cid text not null,
  ip_hash text,
  device text,
  path text,

  q_prefix text,
  q_len int,
  q_hash text,
  lang text,

  provider text,
  model text,
  output jsonb,
  status text default 'pending_review',

  country text,
  region text,
  city text
);

-- 5) User suggestions (pending review)
create table if not exists suggestions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cid text not null,
  ip_hash text,
  device text,
  path text,

  q_prefix text,
  q_len int,
  q_hash text,
  lang text,

  suggestion text,
  status text default 'pending_review',

  country text,
  region text,
  city text
);

-- SECURITY: enable RLS (service_role bypasses RLS; public can't read/write)
alter table telemetry_pv enable row level security;
alter table telemetry_search enable row level security;
alter table telemetry_zero enable row level security;
alter table drafts enable row level security;
alter table suggestions enable row level security;

-- Do NOT create anon policies. With RLS enabled and no policies,
-- only service_role (used in Vercel functions) can write.
