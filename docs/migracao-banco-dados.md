# Migração Sheets → Postgres (Supabase)

Substitui as planilhas Google Sheets (lidas/escritas via webhooks n8n) usadas
para login (`users`) e compras (`purchases`). O n8n continua recebendo os
mesmos gatilhos de entrada (Hotmart/checkout/formulário) — só troca o nó final
de "Google Sheets" para "Postgres".

## 1. Criar o schema

No Supabase: **SQL Editor** → colar o conteúdo de [`db/schema.sql`](../db/schema.sql) → Run.

## 2. Configurar `DATABASE_URL`

Em **Project Settings → Database → Connection string → URI**, copie a string
usando a **porta 5432** (conexão direta — não a 6543/pooler, porque o
`dash-campanhas` roda como processo Node persistente, não serverless).

Cole em `.env`:

```
DATABASE_URL=postgresql://postgres.[ref]:[senha]@aws-0-xxxx.pooler.supabase.com:5432/postgres
```

## 3. Migrar os dados existentes da planilha de compras

No Supabase: **Table Editor → purchases → Insert → Import data from CSV**.
Exporte a planilha atual como CSV e mapeie as colunas para
`nome, email, telefone, curso, campanha, liberacao, data` (os nomes das
colunas do CSV podem ter capitalização diferente — o importador do Supabase
deixa remapear).

## 4. Trocar o nó do n8n que escrevia no Sheets de compras

No workflow que hoje faz "Append row to Google Sheets" para registrar uma
compra: trocar por um nó **Postgres → Insert** apontando para a tabela
`purchases`, usando a mesma `DATABASE_URL` (ou credenciais Postgres separadas
no n8n, se preferir). Colunas: `nome, email, telefone, curso, campanha,
liberacao, data`.

## 5. Criar a primeira conta de login

O registro pelo dashboard (`/api/auth/register`) cria o usuário com
`ativo = false` (fica pendente de aprovação — mesmo comportamento de antes).
Para aprovar manualmente, no SQL Editor do Supabase:

```sql
update users set ativo = true where email = 'seu-email@exemplo.com';
```

## 6. Aposentar os webhooks antigos

Depois de validar que login e compras funcionam via banco, pode remover do
n8n os workflows "Login Dashboard" e "detalhes-compras" (ou deixá-los
desativados por segurança por um tempo). As variáveis `N8N_LOGIN_WEBHOOK_URL`
e `N8N_PURCHASES_WEBHOOK_URL` não são mais lidas pelo servidor — só
`N8N_WEBHOOK_URL` (relatório) continua em uso.
