# Banco de dados

Este documento descreve as tabelas que sustentam a captura de leads, a tela **Registros** e o **Monitoramento**. O esquema completo e o histórico de migrações estão em [`db/schema.sql`](../db/schema.sql).

- **Banco:** PostgreSQL no Supabase, projeto **Dados Essentials** (região São Paulo), schema **`dash`**.
- **Acesso do app:** variável `DATABASE_URL` (usuário `dash_app`, dono do schema `dash`). Detalhes de conexão e portas em [`DEPLOY.md`](../DEPLOY.md).
- **Migrações:** as colunas e tabelas usadas pela captura, pelos Registros e pelo Monitoramento são criadas **automaticamente** quando o servidor sobe (`create … if not exists` / `add column if not exists`). Não é preciso rodar SQL manualmente para esses recursos.

---

## Sumário

1. [`leads`](#leads) — todos os cadastros
2. [Como o `fonte_id` mostra a origem do registro](#como-o-fonte_id-mostra-a-origem-do-registro)
3. [Tipo, vertente e slug](#tipo-vertente-e-slug)
4. [`registros_apagados`](#registros_apagados)
5. [`monitor_checagens`](#monitor_checagens)
6. [`planilhas_copia`](#planilhas_copia)
7. [Tabelas relacionadas](#tabelas-relacionadas)
8. [Consultas úteis](#consultas-úteis)

---

## `leads`

Uma linha por cadastro. É a fonte única da tela **Registros** (e da tela **Leads**).

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid | Chave primária. |
| `nome` | text | Nome informado. |
| `email` | text | Em minúsculas; pode ser vazio. |
| `telefone` | text | **Só dígitos**, com DDI quando informado (`5511988887777`). |
| `origem` | text | Nome estável do projeto (ex.: `workshop_irezumi_1`). Usado pela tela Leads e por relatórios. |
| `slug` | text | Identificação da página (ex.: `workirezumi`). **É o que separa os projetos.** Indexado. |
| `tipo` | text | `essentials`, `workshop`, `mentoria` ou `outros`. |
| `vertente` | text | No Essentials: `live` ou `membros`; vazio nos demais. |
| `campanha` | text | `utm_campaign` (nome ou ID). |
| `campaign_id` | text | ID numérico da campanha da Meta (`utm_id`), quando existe. |
| `midia` | text | `utm_medium` (ex.: `paid`). |
| `veio_de` | text | `utm_source` (ex.: `ig`, `meta`). |
| `criativo` | text | Nome do criativo (`utm_content` quando é texto). |
| `ad_id` | text | ID do anúncio (`utm_content` quando é numérico). |
| `landing_url` | text | Página onde a pessoa se cadastrou. |
| `data` | text | Data do cadastro como texto `dd/mm/aaaa` (horário de Brasília). Legado. |
| `created_at` | timestamptz | Momento do cadastro. **Use esta para ordenar e filtrar.** |
| `data_nascimento` | date | Quando o formulário pergunta. |
| `respostas` | jsonb | Respostas extras do formulário (ex.: aplicação da Mentoria). Padrão `{}`. |
| `fonte_id` | text | Identificador único da origem do registro. **Índice único.** Veja a seção abaixo. |

---

## Como o `fonte_id` mostra a origem do registro

O prefixo do `fonte_id` diz **por onde o cadastro entrou**, o que ajuda a investigar e define o que acontece ao apagar:

| Prefixo | Origem | Ao apagar na tela Registros |
|---|---|---|
| `captura:<uuid>` | Entrou direto pela API de captura (`POST /api/captura`) | Removido do banco |
| `planilha:<hash>` | Importado do histórico das planilhas do Google (importação única) | Removido do banco |
| `recuperado:n8n-<id>` | Cadastro recuperado de execuções do n8n que falharam | Removido do banco |
| *(UUID ou número, sem prefixo)* | Copiado do banco do site ("Dados Essentials", tabela `public.leads`) pela sincronização automática | **Só ocultado** na tela (a cópia o traria de volta) |

> **Sincronização com o banco do site.** `server/leadsSync.js` copia, a cada 10 minutos (`LEADS_SYNC_MINUTES`), os leads novos de `public.leads` (somente leitura, via `ESSENTIALS_DATABASE_URL`) para `dash.leads`, já classificando por tipo/slug. É idempotente: o `fonte_id` evita duplicar.

---

## Tipo, vertente e slug

A classificação vem do catálogo [`server/projetos/catalogo.js`](../server/projetos/catalogo.js):

| Slug | Tipo | Vertente |
|---|---|---|
| `essentials` | essentials | — |
| `essentials-live` | essentials | live |
| `essentials-membros` | essentials | membros |
| `workirezumi`, `workleao2`, `workcobertura`, `workprompt` | workshop | — |
| `mentoria-particular` | mentoria | — |

- Cadastros antigos (sem slug) são classificados **uma vez, ao subir o servidor**, a partir da coluna `origem`.
- Slugs fora do catálogo são classificados pelo prefixo (`work…` → workshop, `essentials…` → essentials, `mentoria…` → mentoria, o resto → outros).

**Regra de repetido (aplicada na gravação e na tela):** a mesma pessoa conta **uma vez por `slug`** — mesmo e-mail ou mesmo telefone (11 últimos dígitos). O banco **não** impede linhas repetidas (para não perder cadastros); a deduplicação é feita ao gravar pela API e, para dados antigos, ao montar a tela Registros.

---

## `registros_apagados`

Lista do que a equipe apagou pela tela Registros. Criada automaticamente na primeira vez que alguém apaga.

| Coluna | Tipo | Descrição |
|---|---|---|
| `chave` | text (PK) | `e:<email em minúsculas>` ou `t:<11 últimos dígitos do telefone>`. |
| `apagado_em` | timestamptz | Quando foi apagado. |
| `apagado_por` | text | Quem apagou. |

A tela esconde os registros que batem com uma chave e são **anteriores** a `apagado_em`. Se a pessoa se cadastrar de novo depois, o novo cadastro aparece normalmente.

---

## `lead_notas`

Anotação interna da equipe sobre um lead, feita na gaveta da tela **Leads**. Criada automaticamente pelo servidor.

| Coluna | Tipo | Descrição |
|---|---|---|
| `chave` | text | Chave primária: `e:<e-mail em minúsculas>` ou, sem e-mail, `t:<11 últimos dígitos do telefone>`. |
| `nota` | text | Texto livre (até 2.000 caracteres). |
| `situacao` | text | `novo`, `chamado`, `respondeu` ou `sem_interesse`. |
| `tags` | text[] | Etiquetas (até 12). |
| `atualizado_em` / `atualizado_por` | timestamptz / text | Última alteração e quem fez. |

---

## `monitor_checagens`

Histórico do Monitoramento: uma linha por endereço conferido a cada rodada (padrão: a cada 5 minutos). Mantém **14 dias**. Criada automaticamente.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | bigserial (PK) | |
| `projeto` | text | `id` do projeto em `server/monitor/projetos.js`. |
| `alvo` | text | Nome do endereço (ex.: `Página de captura`). |
| `url` | text | Endereço conferido. |
| `ok` | boolean | Se respondeu como esperado. |
| `status` | integer | Código HTTP (nulo se não houve resposta). |
| `ms` | integer | Tempo até a resposta, em milissegundos. |
| `erro` | text | Motivo da falha (ex.: `HTTP 503`, `sem resposta em 12s`). |
| `checado_em` | timestamptz | Quando foi conferido. Índice por `(projeto, alvo, checado_em desc)`. |

---

## `planilhas_copia`

Cópia, em JSON, de dados vindos de planilhas do Google. Hoje é usada para:

- `chave = 'registros'` — cópia antiga das planilhas de leads, fonte da **importação única** do histórico (a tela Registros já não lê daqui);
- `chave = 'importacao-leads'` — marcador de que a importação foi feita (data, quantos entraram). Depois dele, a cópia das planilhas de leads deixa de ser atualizada;
- `chave = 'hotmart-eventos'` — histórico de eventos da Hotmart anteriores ao tracking direto.

| Coluna | Tipo | Descrição |
|---|---|---|
| `chave` | text (PK) | Qual conjunto de dados. |
| `dados` | jsonb | O conteúdo. |
| `atualizado_em` | timestamptz | Última atualização. |
| `erro` | text | Último erro de atualização, se houve. |

---

## Tabelas relacionadas

| Tabela | Para que serve |
|---|---|
| `purchases` | Compras (tela **Compras**). Compras com `live`/`membros` na campanha ou origem também entram em Essentials · Live/Membros na tela Registros, e as sem evento da Hotmart viram "Vendas aprovadas". |
| `hotmart_eventos` | Eventos recebidos direto da Hotmart (venda, Pix/boleto, carrinho abandonado…). |
| `users`, `sessions`, `password_resets` | Login e cargos (admin/usuário). |
| `video_config` | Configuração do player da VSL. |

---

## Consultas úteis

> Rode no **SQL Editor** do Supabase (projeto Dados Essentials). Para consultas, prefira `select`; para apagar ou alterar, confira o `where` duas vezes.

**Últimos cadastros**

```sql
select slug, nome, email, left(fonte_id, 10) as fonte,
       to_char(created_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as quando
from dash.leads
order by created_at desc
limit 20;
```

**Cadastros por projeto nos últimos 7 dias**

```sql
select tipo, slug, count(*) as cadastros
from dash.leads
where created_at > now() - interval '7 days'
group by tipo, slug
order by cadastros desc;
```

**Cadastros que entraram pela API (não pela cópia do site)**

```sql
select slug, count(*)
from dash.leads
where fonte_id like 'captura:%'
group by slug;
```

**Achar um cadastro de teste**

```sql
select id, slug, nome, email, created_at
from dash.leads
where nome like 'ZZ Teste%'
order by created_at desc;
```

**Pessoas repetidas dentro do mesmo projeto**

```sql
select slug, right(regexp_replace(telefone, '\D', '', 'g'), 11) as telefone, count(*)
from dash.leads
group by 1, 2
having count(*) > 1
order by count(*) desc;
```

**Histórico do monitoramento de um endereço**

```sql
select to_char(checado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as quando, ok, status, ms, erro
from dash.monitor_checagens
where projeto = 'work-gratuito' and alvo = 'Cadastro (dash)'
order by checado_em desc
limit 50;
```
