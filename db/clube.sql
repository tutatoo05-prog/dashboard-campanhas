-- Clube de membros (YouTube + Essentials) e entrada automática no Discord. Código em server/clube/.
-- Rode este arquivo UMA vez no SQL Editor do Supabase (schema dash). É idempotente: pode rodar de novo sem erro.
-- Sem estas tabelas o resto do dash segue normal; a tela Clube avisa "falta rodar db/clube.sql".
--
-- clube_membros: uma linha por membro e plataforma.
--   youtube     → chave = id do canal do membro (UC...). A API do YouTube NÃO entrega e-mail de membro.
--   essentials  → chave = e-mail em minúsculas (vem da tabela acessos).
--   discord_id  → preenchido quando a pessoa faz o resgate (entra no servidor e ganha o cargo).
create table if not exists clube_membros (
  id bigserial primary key,
  plataforma text not null check (plataforma in ('youtube', 'essentials')),
  chave text not null,
  nome text,
  email text,
  nivel text,
  status text not null default 'ativo' check (status in ('ativo', 'cancelado')),
  desde timestamptz,
  discord_id text,
  discord_nome text,
  discord_vinculado_em timestamptz,
  cargo_aplicado boolean not null default false,
  dados jsonb not null default '{}'::jsonb,
  sincronizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  cancelado_em timestamptz,
  unique (plataforma, chave)
);
create index if not exists clube_membros_status_idx on clube_membros (plataforma, status);
create index if not exists clube_membros_discord_idx on clube_membros (discord_id) where discord_id is not null;

-- Fotografia diária: quantos ativos, quantos entraram e quantos saíram (a tela Clube desenha a evolução).
create table if not exists clube_snapshots (
  dia date not null,
  plataforma text not null,
  ativos integer not null,
  novos integer not null default 0,
  cancelados integer not null default 0,
  primary key (dia, plataforma)
);

-- Resultado da última sincronização de cada fonte (youtube, essentials, discord).
create table if not exists clube_estado (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now()
);

-- O dash conecta como dash_app e as outras tabelas do schema pertencem a ele (dono ignora o RLS). Se estas nascerem com outro
-- dono (ex.: rodando como postgres), passam para dash_app ANTES de ligar o RLS; senão o app seria bloqueado.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'dash_app') then
    alter table clube_membros owner to dash_app;
    alter table clube_snapshots owner to dash_app;
    alter table clube_estado owner to dash_app;
  end if;
end $$;

alter table clube_membros enable row level security;
alter table clube_snapshots enable row level security;
alter table clube_estado enable row level security;
