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

-- ───────────────────────────────────────────────────────────────────────────────
-- Central de Ações v2 (adiar, atribuir, histórico, regras e avisos).
-- Rode este bloco no SQL Editor do Supabase antes de usar os recursos novos da tela /acoes.
-- Tudo é "if not exists": pode rodar de novo sem problema.
-- ───────────────────────────────────────────────────────────────────────────────

-- Ações adiadas ("lembrar amanhã / em 48h / na segunda"): somem da lista até a data.
create table if not exists action_snoozes (
  account_id text not null,
  action_id text not null,
  until timestamptz not null,
  by_email text,
  created_at timestamptz not null default now(),
  primary key (account_id, action_id)
);

-- Responsável por cada ação.
create table if not exists action_assignments (
  account_id text not null,
  action_id text not null,
  user_id uuid references users (id) on delete set null,
  user_name text not null default '',
  user_email text not null default '',
  assigned_by text,
  updated_at timestamptz not null default now(),
  primary key (account_id, action_id)
);

-- Ações marcadas como feitas, com uma "foto" dos números na hora (snapshot) para mostrar o resultado depois.
-- snapshot: { spend, leads, cpl, ctr, periodDays, moneyAtStake }. Uma linha por ação por dia (day = AAAA-MM-DD).
create table if not exists action_history (
  id bigserial primary key,
  account_id text not null,
  action_id text not null,
  campaign_id text,
  title text not null default '',
  kind text not null default '',
  done_by text,
  day text not null,
  done_at timestamptz not null default now(),
  snapshot jsonb not null default '{}'::jsonb,
  unique (account_id, action_id, day)
);
create index if not exists action_history_account_idx on action_history (account_id, done_at desc);

-- Regras automáticas. type: cpl_above_avg {pct, days} · spend_no_leads {amount} · budget_used {pct}
create table if not exists automation_rules (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('cpl_above_avg', 'spend_no_leads', 'budget_used')),
  params jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_by text,
  created_at timestamptz not null default now()
);

-- Regras de partida (só se a tabela estiver vazia). A de verba nasce desligada.
insert into automation_rules (type, params, enabled)
select * from (values
  ('cpl_above_avg', '{"pct": 30, "days": 2}'::jsonb, true),
  ('spend_no_leads', '{"amount": 50}'::jsonb, true),
  ('budget_used', '{"pct": 90}'::jsonb, false)
) as seed (type, params, enabled)
where not exists (select 1 from automation_rules);

-- Alertas gerados pelas regras (um por regra, conta, campanha e dia). cleared = a condição passou.
create table if not exists rule_alerts (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references automation_rules (id) on delete cascade,
  account_id text not null,
  campaign_key text not null default '',
  campaign_id text,
  campaign_name text,
  day text not null,
  title text not null,
  detail text not null default '',
  money numeric,
  cleared boolean not null default false,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (rule_id, account_id, campaign_key, day)
);
create index if not exists rule_alerts_day_idx on rule_alerts (day, account_id);

-- Avisos fora do painel (linha única). Entrega via webhook n8n (N8N_ALERT_WEBHOOK_URL).
create table if not exists notification_settings (
  id smallint primary key default 1 check (id = 1),
  email_daily boolean not null default false,
  email_hour smallint not null default 8 check (email_hour between 0 and 23),
  email_last_day text,
  whatsapp_urgent boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into notification_settings (id) values (1) on conflict (id) do nothing;

-- Registro de tudo que o painel alterou na Meta (pausar, reativar, mudar orçamento).
create table if not exists meta_action_log (
  id bigserial primary key,
  user_email text,
  account_id text,
  campaign_id text,
  campaign_name text,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists meta_action_log_created_at_idx on meta_action_log (created_at desc);
