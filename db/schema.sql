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
  cargo text not null default 'usuario' check (cargo in ('admin', 'usuario')),
  created_at timestamptz not null default now()
);

-- Migração incremental (cargos): admin altera tudo; usuario só usa, sem alterar.
-- Depois de rodar, promova o primeiro admin à mão:
--   update users set cargo = 'admin' where email = '...';
alter table users add column if not exists cargo text not null default 'usuario' check (cargo in ('admin', 'usuario'));

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
  status text not null default 'ativo',
  subscriber_code text,
  canceled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists purchases_campanha_idx on purchases (campanha);
create index if not exists purchases_curso_idx on purchases (curso);
create index if not exists purchases_created_at_idx on purchases (created_at desc);
create index if not exists purchases_email_idx on purchases (email);
create index if not exists purchases_subscriber_code_idx on purchases (subscriber_code);

-- Migração incremental: se a tabela já existia antes destas colunas, rode
-- este bloco manualmente no SQL Editor do Supabase (create table acima não
-- altera tabelas existentes).
alter table purchases add column if not exists status text not null default 'ativo';
alter table purchases add column if not exists subscriber_code text;
alter table purchases add column if not exists canceled_at timestamptz;

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
-- Exigido pelo "on conflict (account_id, month)" de server/goalsHandler.js.
create unique index if not exists goals_account_month_idx on goals (account_id, month);

-- Interruptor da Live do Essentials (ver server/live.js). Linha única (id = 1):
-- ligação manual com prazo obrigatório + agenda semanal em America/Sao_Paulo.
-- schedule: [{ "day": 0-6 (0 = domingo), "start": "HH:MM", "end": "HH:MM" }]
create table if not exists live_settings (
  id smallint primary key default 1 check (id = 1),
  manual_on boolean not null default false,
  manual_since timestamptz,
  manual_until timestamptz,
  manual_by text,
  paused_until timestamptz,
  schedule jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
insert into live_settings (id) values (1) on conflict (id) do nothing;

create table if not exists live_log (
  id bigserial primary key,
  action text not null,
  source text not null,
  user_email text,
  detail text not null default '',
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists live_log_created_at_idx on live_log (created_at desc);
