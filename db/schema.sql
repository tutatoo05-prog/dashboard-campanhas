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

-- ───────────────────────────────────────────────────────────────────────────────
-- Sincronização de leads do site (server/scripts/syncLeadsEssentials.js).
-- fonte_id = id do lead no banco "Dados Essentials"; evita copiar duas vezes.
-- ───────────────────────────────────────────────────────────────────────────────
alter table leads add column if not exists fonte_id text;
create unique index if not exists leads_fonte_id_idx on leads (fonte_id);

-- ID da campanha da Meta em cada lead (cruza por ID em vez de por nome, então renomear a campanha
-- não perde histórico). Vem do utm_id do cadastro e, nos que não têm, é preenchido pelo servidor
-- a partir do nome da campanha (server/siteLeads.js). Cadastros antigos ficam com null até serem resolvidos.
alter table leads add column if not exists campaign_id text;
create index if not exists leads_campaign_id_idx on leads (campaign_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- Vendas copiadas do banco do site (server/salesSync.js) e origem do checkout da Hotmart.
-- fonte_id = "venda:<id>" da tabela vendas do banco do site (evita copiar duas vezes).
-- src/xcod = origin.src e origin.xcod da Hotmart; campaign_id sai do "ad_<ID>" do xcod.
-- ───────────────────────────────────────────────────────────────────────────────
alter table purchases add column if not exists fonte_id text;
alter table purchases add column if not exists transacao text;
alter table purchases add column if not exists pagamento_tipo text;
alter table purchases add column if not exists src text;
alter table purchases add column if not exists xcod text;
alter table purchases add column if not exists campaign_id text;
alter table purchases add column if not exists recorrencia integer;
create unique index if not exists purchases_fonte_id_idx on purchases (fonte_id);
create index if not exists purchases_campaign_id_idx on purchases (campaign_id);
-- Vendas importadas da planilha da Hotmart guardavam o "Origem" (src) em campanha.
update purchases set src = nullif(btrim(campanha), '') where src is null and fonte_id is null;

-- ───────────────────────────────────────────────────────────────────────────────
-- Liberação de acesso dentro do dash (substitui o fluxo "HOTMART PAGAMENTOS" do n8n).
-- server/acesso/*. Modo por ACESSO_MODO: desligado (padrão) | teste (só grava e simula) | ativo.
--
-- hotmart_eventos: um registro por evento do webhook da Hotmart (event_id é único, então a Hotmart
--   reenviando o mesmo evento não faz nada em dobro). "passos" guarda o resultado de cada etapa
--   (liberar, e-mail, WhatsApp...) para uma nova tentativa só refazer o que falhou.
-- acessos: um registro por aluno e curso, com até quando o acesso vale (cruza as parcelas pagas).
-- ───────────────────────────────────────────────────────────────────────────────
create table if not exists hotmart_eventos (
  id bigserial primary key,
  event_id text not null unique,
  evento text not null,
  transacao text,
  email text,
  nome text,
  curso text,
  payload jsonb not null,
  estado text not null default 'novo',          -- novo | processando | ok | erro | falhou | atencao | ignorado
  decisao text,                                  -- liberar | renovar | sem_liberacao | abandono | atraso | ...
  passos jsonb not null default '{}'::jsonb,
  tentativas integer not null default 0,
  proxima_tentativa timestamptz not null default now(),
  erro text,
  simulado boolean not null default false,       -- processado em modo teste
  recebido_em timestamptz not null default now(),
  iniciado_em timestamptz,
  processado_em timestamptz
);
create index if not exists hotmart_eventos_fila_idx on hotmart_eventos (estado, proxima_tentativa);
create index if not exists hotmart_eventos_email_idx on hotmart_eventos (lower(email));
create index if not exists hotmart_eventos_recebido_idx on hotmart_eventos (recebido_em desc);

create table if not exists acessos (
  id bigserial primary key,
  email text not null,
  curso text not null,
  nome text,
  telefone text,
  documento text,
  plano text,
  pagamento_tipo text,
  subscriber_code text,
  dias_regra integer,
  liberado_ate timestamptz,
  status text not null default 'ativo',          -- ativo | atrasado | bloqueado
  parcelas_pagas integer not null default 0,
  ultima_transacao text,
  ultima_liberacao_em timestamptz,
  atraso_desde timestamptz,
  bloquear_em timestamptz,
  bloqueado_em timestamptz,
  bloqueio_tentativas integer not null default 0,
  bloqueio_proxima timestamptz,
  bloqueio_erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (email, curso)
);
create index if not exists acessos_assinante_idx on acessos (subscriber_code);
create index if not exists acessos_bloqueio_idx on acessos (status, bloquear_em);

-- Quem abandonou o carrinho / atrasou o pagamento e recebeu (ou não) o e-mail de apoio
-- (era a planilha "Abandono de carrinho").
create table if not exists abandonos (
  id bigserial primary key,
  email text not null,
  tipo text not null,                            -- carrinho | atraso
  nome text,
  telefone text,
  curso text,
  ocorrido_em timestamptz,
  msg_apoio text not null default 'pendente',    -- pendente | enviado
  enviado_em timestamptz,
  evento_id bigint,
  atualizado_em timestamptz not null default now(),
  unique (email, tipo)
);

-- ───────────────────────────────────────────────────────────────────────────────
-- Alunos que já estavam na plataforma de cursos (lista exportada de lá, só os ativos).
-- plataforma_id = número do aluno na lista da plataforma; origem = 'plataforma' (importado) ou 'dash'.
-- Quem não tem e-mail conhecido fica com email nulo (o e-mail entra quando comprar de novo).
-- server/scripts/importarAlunosAtivos.js
-- ───────────────────────────────────────────────────────────────────────────────
alter table acessos alter column email drop not null;
alter table acessos add column if not exists plataforma_id text;
alter table acessos add column if not exists origem text not null default 'dash';
create unique index if not exists acessos_plataforma_id_idx on acessos (plataforma_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- Controle de atraso do Pix parcelado (a plataforma dá 365 dias a todos; o dash só marca quem atrasou
-- para a equipe inativar na mão enquanto a API da plataforma não bloqueia).
-- parcelado = aluno de Pix parcelado · pago_ate = até quando as parcelas pagas cobrem (30 dias cada).
-- status: ativo | atrasado | bloqueio_pendente (inativar na plataforma) | bloqueado (já inativado) | reativar_pendente
-- ───────────────────────────────────────────────────────────────────────────────
alter table acessos add column if not exists parcelado boolean not null default false;
alter table acessos add column if not exists pago_ate timestamptz;

-- ───────────────────────────────────────────────────────────────────────────────
-- Ficha da campanha: o que o usuário confirmou ou corrigiu sobre "para que a campanha serve".
-- O dash descobre o tipo sozinho (src/lib/campaignType.js); só o que estiver aqui sobrepõe o automático.
-- tipo: captacao | live | engajamento | venda | reconhecimento | conversas · meta_custo = custo por resultado desejado (R$)
-- ───────────────────────────────────────────────────────────────────────────────
create table if not exists campaign_profiles (
  account_id text not null,
  campaign_id text not null,
  tipo text,
  meta_custo numeric,
  atualizado_por text,
  atualizado_em timestamptz not null default now(),
  primary key (account_id, campaign_id)
);

-- ───────────────────────────────────────────────────────────────────────────────
-- Cópia das planilhas do Google no banco (server/planilhasSync.js). Registros e Compras leem daqui em
-- milésimos em vez de baixar 16 abas (~14 s) a cada abertura. O agendador atualiza a cada 5 minutos.
-- chave: registros | hotmart-eventos · dados: o JSON pronto · erro: última falha de atualização (a cópia boa fica)
-- ───────────────────────────────────────────────────────────────────────────────
create table if not exists planilhas_copia (
  chave text primary key,
  dados jsonb not null,
  atualizado_em timestamptz not null default now(),
  erro text
);

-- ───────────────────────────────────────────────────────────────────────────────
-- Minha conta: foto/adesivo de cada pessoa. 'sticker:rose' (adesivo) ou 'data:image/...' (foto reduzida) ou nulo (inicial do nome).
-- ───────────────────────────────────────────────────────────────────────────────
alter table users add column if not exists avatar text;

-- ───────────────────────────────────────────────────────────────────────────────
-- Central de vídeos: configuração do player da VSL (server/playerConfig.js, tela Vídeos → "Controle do player").
-- O player (projeto produtos, pages/player) lê isso por /api/player-config; sem a tabela ele segue com o padrão.
-- video: id do vídeo (vsl) · config: opções validadas pelo servidor · atualizado_por: e-mail de quem salvou.
-- Rode este bloco uma vez no SQL Editor do Supabase (schema dash).
-- ───────────────────────────────────────────────────────────────────────────────
create table if not exists video_config (
  video text primary key,
  config jsonb not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

-- ───────────────────────────────────────────────────────────────────────────────
-- Cadastros recusados: o fluxo de aprovação do n8n (Telegram/WhatsApp) grava recusado_em. Nulo = não recusado.
-- ativo = false e recusado_em nulo = pendente; ativo = false e recusado_em preenchido = recusado.
-- (Já aplicado no banco de produção em 20/10/2026, migração dash_users_recusado_em.)
-- ───────────────────────────────────────────────────────────────────────────────
alter table users add column if not exists recusado_em timestamptz;

-- Data de nascimento do lead (campo novo dos formularios do site; chega em respostas.data_nascimento).
-- Tipo date: sem hora, sem fuso. Fica null enquanto o formulario nao perguntar ou a pessoa nao responder.
alter table leads add column if not exists data_nascimento date;
