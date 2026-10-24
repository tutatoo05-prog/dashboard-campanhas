# Academy Labs · Dash de Campanhas

Painel interno da **Tuzinho Academy** que reúne, num só lugar, as campanhas de anúncios, os **cadastros (leads)** de todos os sites, as **vendas** e a **saúde** das páginas no ar.

Disponível em **https://dash.tuzinho.academy** (acesso por login, com cargos de administrador e usuário).

---

## Sumário

- [O que o dash faz](#o-que-o-dash-faz)
- [Como os dados chegam](#como-os-dados-chegam)
- [Documentação](#documentação)
- [Stack](#stack)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Rodando localmente](#rodando-localmente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Scripts](#scripts)
- [Testes](#testes)
- [Deploy](#deploy)
- [Segurança](#segurança)
- [Convenções](#convenções)

---

## O que o dash faz

| Área | O que entrega |
|---|---|
| **Dashboard / Central de Ações / Comparar** | Investimento, leads e custo por lead das contas da Meta Ads, recomendações do que fazer hoje e comparação entre períodos. |
| **Registros** | Todos os cadastros do banco, separados por **tipo** (Essentials, Workshops, Mentoria particular) e por **projeto** (slug). Filtros por projeto, origem, campanha, situação e período; selo **Novo** nas primeiras 10 horas; apagar registro; exportação em CSV; linha do tempo da pessoa. |
| **Leads** | Lista geral de leads com a origem. |
| **Compras** | Vendas aprovadas (Hotmart), com valores e campanha. |
| **Acessos** | Liberação de acesso aos cursos após a compra e o histórico de eventos. |
| **Monitoramento** | Se os sites estão no ar e rápidos, quantos cadastros chegam e se o formulário está gravando, com aviso no Telegram quando algo cai ou volta. |
| **Vídeos / Live** | Métricas da VSL, controle do player e do interruptor da Live do Essentials. |
| **Segurança** | Backup do banco, avisos de problema, sessões ativas e último deploy. |

---

## Como os dados chegam

```
 Sites e formulários ───────────── POST /api/captura ─────────────┐
 (workshops, Essentials, mentoria)                                 │
                                                                   ▼
 Hotmart ────────────── POST /api/hotmart/webhook ───▶  ┌─────────────────────┐
                                                         │  dash (Node.js)     │
 Meta Ads API ◀────────────── consulta ──────────────────│  API + front React  │
                                                         └──────────┬──────────┘
 Banco do site (Dados Essentials) ── cópia a cada 10 min ──▶        │
                                                                    ▼
                                              PostgreSQL (Supabase, São Paulo · schema dash)
                                                                    │
                                   Registros · Leads · Compras · Monitoramento · Acessos
```

- **Cadastros** chegam pela [API de captura](./docs/api.md) e vão **direto para o banco**, sem planilha nem automação no meio.
- Cada cadastro carrega um **slug** (a identificação da página, ex.: `workirezumi`) que o separa por projeto.
- O **Monitoramento** confere os endereços a cada 5 minutos e avisa no Telegram.

---

## Documentação

| Documento | Para quê |
|---|---|
| [**Integrar um novo formulário**](./docs/novo-projeto.md) | Guia passo a passo: como ligar um site/formulário novo ao dash, fazê-lo aparecer em Registros e no Monitoramento. **Comece por aqui.** |
| [**API de captura**](./docs/api.md) | Referência da API pública: endpoints, campos, regras, respostas, códigos de erro, segurança e exemplos. |
| [**Banco de dados**](./docs/banco-de-dados.md) | Tabelas, colunas, origem dos registros, classificação por projeto e consultas úteis. |
| [**Deploy**](./DEPLOY.md) | Publicação no Plesk, variáveis de ambiente de produção e migrações. |
| [Sequências de e-mail](./docs/emails-sequencias.md) | Conteúdo das réguas de e-mail. |

---

## Stack

| Camada | Tecnologia |
|---|---|
| Front-end | React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, React Router |
| Back-end | Node.js (módulos ES) com servidor HTTP próprio — sem framework — em `server/` |
| Banco | PostgreSQL (Supabase), acesso com `pg` |
| Testes | Executor nativo do Node (`node --test`) |
| Hospedagem | Plesk (Node.js), deploy automático a cada push |
| Integrações | Meta Ads, Google Ads, Hotmart, Telegram, Brevo (e-mail), Evolution (WhatsApp) |

---

## Estrutura do repositório

```
dash-campanhas/
├── src/                      Front-end (React)
│   ├── pages/                Uma tela por arquivo (RegistrosPage, MonitorPage, LeadsPage…)
│   ├── components/           Componentes por área (registros/, layout/, flash/…)
│   ├── services/             Chamadas à API (fetch)
│   ├── lib/                  Regras puras (agrupar registros, formatos, cargos…)
│   └── *.css                 Tema "Flash Sheet" (claro e escuro)
├── server/                   Back-end
│   ├── production.js         Ponto de entrada (sobe o servidor e os agendadores)
│   ├── middleware.js         Roteamento da API e controle de acesso
│   ├── capturaHandler.js     API pública de captura de leads
│   ├── registrosHandler.js   Tela Registros (leads + Hotmart, filtros, apagar, importar)
│   ├── projetos/             Catálogo de projetos (tipo/slug) e migração de esquema
│   ├── monitor/              Monitoramento (projetos.js, checagens, alertas)
│   ├── acesso/               Liberação de acesso aos cursos
│   ├── emails/               Réguas de e-mail
│   └── *.test.js             Testes
├── db/schema.sql             Esquema e migrações incrementais
├── docs/                     Documentação (API, integração, banco)
├── public/                   Arquivos estáticos
├── DEPLOY.md                 Guia de deploy
└── README.md
```

---

## Rodando localmente

**Requisitos:** Node.js 20 ou superior e npm.

```bash
# 1. Instalar dependências
npm install

# 2. Criar o arquivo de ambiente a partir do modelo e preencher
cp .env.example .env

# 3. Subir em modo desenvolvimento (front + API) em http://localhost:5173
npm run dev
```

> ⚠️ **Cuidado com o banco.** O `.env` local decide em qual banco o seu ambiente grava. **Confira o host da `DATABASE_URL`** antes de qualquer teste que escreva dados, e para testes prefira transações que terminam em `rollback`. Alterações em produção devem passar por código e deploy, ou por SQL revisado no editor do Supabase.

---

## Variáveis de ambiente

Modelo completo em [`.env.example`](./.env.example); valores de produção em [`DEPLOY.md`](./DEPLOY.md). As principais:

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | Conexão com o banco do dash. **Obrigatória.** |
| `ESSENTIALS_DATABASE_URL` | Leitura (somente leitura) do banco do site "Dados Essentials", para a cópia automática de leads. |
| `LEADS_SYNC_ENABLED`, `LEADS_SYNC_MINUTES` | Liga/desliga e intervalo (padrão 10 min) da cópia de leads do site. |
| `CAPTURA_ORIGENS` | Domínios extras autorizados a enviar cadastros pela API, separados por vírgula (`https://novo.com,https://www.novo.com`). Já valem `tuzinho.academy` e `tuzinho.app`. |
| `MONITOR_ENABLED`, `MONITOR_MINUTES` | Liga/desliga e intervalo (padrão 5 min) do Monitoramento. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Canal dos avisos de problema (site fora do ar, falhas). |
| `DEPLOY_TOKEN` | Segredo que autoriza o Plesk a disparar o deploy automático (`POST /api/deploy`). |
| `HOTMART_HOTTOK` | Autentica o webhook da Hotmart. |
| `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_ALLOWED_ACCOUNT_IDS` | Acesso às contas de anúncios da Meta. |
| `APP_URL` | Endereço público do dash (links de recuperação de senha). |
| `PORT`, `NODE_ENV` | Porta e ambiente. |

> Nunca registre valores reais em commits, chamados ou prints. Chaves expostas devem ser trocadas.

---

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Desenvolvimento (Vite + API em `http://localhost:5173`). |
| `npm run build` | Confere os tipos, gera o front em `dist/` e as bibliotecas usadas pelo servidor. |
| `npm start` | Sobe o servidor de produção (`server/production.js`). |
| `npm run typecheck` | Verificação de tipos do TypeScript. |
| `npm test` | Roda toda a suíte de testes. |
| `npm run test:acesso` | Só os testes da liberação de acesso. |

---

## Testes

```bash
npm test
```

A suíte cobre a captura de leads (validação, repetidos, formatos dos formulários, respostas), o catálogo de projetos, a montagem da tela Registros (agrupamento, importação, apagados, compras), o monitoramento e as demais regras de negócio. Antes de cada push: `npm test` e `npm run typecheck` devem passar.

---

## Deploy

O deploy é **automático a cada push** na branch `master`: o Plesk avisa o dash (`POST /api/deploy`), que instala as dependências, gera o front e reinicia o app. Leva cerca de um minuto; depois, force o recarregamento do navegador (**Ctrl+Shift+R**).

Passo a passo, variáveis de produção e a recuperação manual em [`DEPLOY.md`](./DEPLOY.md).

Regra de ouro: ao ligar um **site novo**, publique o **dash primeiro** e o site depois (veja [Integrar um novo formulário › Publicar](./docs/novo-projeto.md#8-publicar)).

---

## Segurança

- **Login** por e-mail e senha, com cargos: `admin` altera tudo; `usuário` usa apenas as telas liberadas.
- **API de captura pública**, protegida por origem permitida (CORS), limite de 40 envios por IP a cada 10 minutos, campo-isca contra robôs, limite de tamanho e validação no servidor ([detalhes](./docs/api.md#segurança)).
- **Webhooks** autenticados por segredo (Hotmart, Telegram, deploy).
- **Modo privacidade** na interface: borra nomes, e-mails, telefones e valores até ser desligado, para dividir a tela ou gravar sem expor pessoas.
- **Backup diário** criptografado do banco (tela Segurança).
- Dados pessoais de leads são tratados conforme a LGPD; os formulários devem exibir o aviso de privacidade e o consentimento de cookies/pixels.

---

## Convenções

- Interface, mensagens e documentação em **português do Brasil**.
- Mensagens de commit curtas e descritivas, em português, sem acentos.
- Regras de negócio ficam no servidor (`server/`) com teste ao lado; a tela só apresenta.
- Antes de alterar o banco: pense na migração automática (colunas `if not exists`) e documente em [`db/schema.sql`](./db/schema.sql).
