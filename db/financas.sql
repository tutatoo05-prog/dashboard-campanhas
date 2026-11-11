-- Finanças (server/financas). O servidor já cria isto sozinho ao abrir a tela; este arquivo é só a cópia para rodar na mão.
create table if not exists fin_lancamentos (
  mes text not null,                       -- 'AAAA-MM'
  tipo text not null check (tipo in ('receita', 'custo')),
  linha text not null,                     -- hotmart, asaas, principia, stripe, pix_ted, facebook, youtube | anuncios, operacao
  valor numeric not null default 0,
  origem text not null default 'manual',   -- auto (sincronização) | manual (digitado) | planilha (carga inicial)
  atualizado_em timestamptz not null default now(),
  primary key (mes, tipo, linha)
);

create table if not exists fin_config (
  chave text primary key,                  -- caixa
  valor text not null,
  atualizado_em timestamptz not null default now()
);
