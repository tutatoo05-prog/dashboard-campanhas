-- Schema do dash-campanhas no Postgres (Supabase).
-- Substitui as planilhas Google Sheets lidas/escritas via n8n.
-- Rode uma vez no SQL Editor do Supabase (ou via psql) antes de trocar
-- os nós do n8n de "Google Sheets" para "Postgres".

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null unique,
  usuario text not null unique,
  senha_hash text not null,
  ativo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  nome text not null default '',
  email text not null default '',
  telefone text not null default '',
  curso text not null default '',
  campanha text not null default '',
  liberacao text not null default '',
  data text not null default '',
  valor numeric,
  created_at timestamptz not null default now()
);
create index if not exists purchases_campanha_idx on purchases (campanha);
create index if not exists purchases_curso_idx on purchases (curso);
create index if not exists purchases_created_at_idx on purchases (created_at desc);

create table if not exists sessions (
  token text primary key,
  user_id uuid not null references users (id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists sessions_expires_at_idx on sessions (expires_at);

create table if not exists password_resets (
  token text primary key,
  user_id uuid not null references users (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists password_resets_user_id_idx on password_resets (user_id);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null default '',
  email text not null default '',
  telefone text not null default '',
  origem text not null default '',
  campanha text not null default '',
  midia text not null default '',
  veio_de text not null default '',
  criativo text not null default '',
  ad_id text not null default '',
  landing_url text not null default '',
  data text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  month text not null,
  spend_target numeric,
  cpl_target numeric,
  updated_at timestamptz not null default now()
);
