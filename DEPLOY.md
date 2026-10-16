# Deploy — dash-campanhas (Plesk)

Site: `dash.tuzinho.academy` · Node.js app no Plesk · repo Git: `equipeoriginalsp/dash-campanhas` (branch `master`).

## Passo a passo (toda atualização)

1. **Local**: commit e `git push origin master`.
2. **Plesk → Git Repositories** (domínio `dash.tuzinho.academy`):
   - **Pull now** — busca o commit novo do GitHub.
   - **Deploy now** — copia os arquivos pra `/dash.tuzinho.academy`.
3. **Se mudou algo em `src/` (React/front-end)** — passo obrigatório, não pule:
   - Plesk → **Node.js on dash.tuzinho.academy** → botão **"Run script"** → digitar `run build`.
   - Isso roda `npm run build` (Vite) e regenera a pasta `dist/`, que é o `Document Root` servido pro navegador.
4. **Plesk → Node.js → Restart App** — sempre, mesmo que só o backend (`server/*.js`) tenha mudado (o processo Node precisa recarregar o código e as env vars).
5. **Teste sem cache**: a resposta de `/` não tem `Cache-Control`, então o navegador pode reaproveitar uma cópia antiga da página. Ao validar em produção, force reload (Ctrl+Shift+R) ou abra em aba anônima.

## ⚠️ Armadilha mais comum

**"Pull + Deploy + Restart" sozinhos NÃO atualizam o front-end.** O Plesk só copia os arquivos-fonte; quem gera o `dist/` (bundle React que o navegador carrega) é o passo 3 (`run build`). Mudança em `server/*.js` funciona sem build (Node lê direto); mudança em `src/*.tsx`/`src/*.ts`/`src/style.css` **exige** o build, senão o site continua servindo a versão antiga sem erro nenhum — o deploy "parece" ter funcionado mas nada mudou na tela.

## Variáveis de ambiente (produção)

Configuradas em **Plesk → Node.js → Custom environment variables**:

| Variável | Pra que serve |
|---|---|
| `META_ACCESS_TOKEN` | Token do Meta Graph API (gerado via app "Dashboard Tuzinho Academy" no Meta for Developers, estendido pra longa duração) |
| `META_AD_ACCOUNT_ID` | Conta padrão ao abrir o dashboard (`act_328274720105539`, academy 01) |
| `META_ALLOWED_ACCOUNT_IDS` | Lista fixa de contas que devem aparecer no seletor, ignorando o filtro de status ativo do Meta (útil quando uma conta está pausada por pagamento pendente, por exemplo) |
| `DIGEST_ACCOUNT_IDS` | Contas incluídas no boletim automático via WhatsApp |
| `HOTMART_HOTTOK` | Autentica o webhook `/api/hotmart/webhook` (cadastrado em Hotmart → Ferramentas → Webhook) |
| `DATABASE_URL` | Conexão Postgres (Supabase) — usar porta `5432` (direta), não `6543` (pooler), pois o processo é persistente |
| `LIVE_FLAG_PATH` | Caminho absoluto do `live.on` no site principal (`.../httpdocs/public/produtos/essentials/live.on`). Ver seção "Live do Essentials" |
| `LIVE_MAX_HOURS` | Teto de emergência da ligação manual em horas (padrão `6`). Não corta horário da agenda mais longo que isso |
| `ESSENTIALS_DATABASE_URL` | Conexão **só de leitura** do projeto Supabase "Dados Essentials" (usuário `dash_leitura`, Session pooler, porta `5432`). Sem ela a cópia de leads não inicia. Ver seção "Leads do site" |
| `LEADS_SYNC_ENABLED` | `false` desliga a cópia automática de leads (padrão: ligada) |
| `LEADS_SYNC_MINUTES` | De quantos em quantos minutos copiar os leads novos (padrão `10`) |
| outras | ver `.env.example` na raiz do repo |

Token do Meta expira (~60 dias mesmo estendido) — quando o dashboard começar a dar erro de permissão nas contas, repetir o processo de gerar/estender token no Graph API Explorer e atualizar `META_ACCESS_TOKEN`.

## Migrations de banco (Supabase)

`db/schema.sql` tem `create table if not exists` (não altera tabela já existente) **e** um bloco de `alter table ... add column if not exists` logo abaixo, comentado como migração incremental. Depois de um `git pull`/deploy que mexeu em `db/schema.sql`, rodar esse bloco manualmente no **SQL Editor do Supabase** antes de restart, se a tabela já existir.

## Leads do site (cópia automática e leads reais por campanha)

Os cadastros dos formulários do site caem no projeto Supabase **"Dados Essentials"** (tabela `leads`, escrita pela função `receber-lead`). O dash lê a tabela `leads` do **próprio** banco, então existe uma cópia automática. Código: `server/leadsSync.js` (a cópia), `server/leadsSyncScheduler.js` (o agendador, junto do processo Node) e `server/scripts/syncLeadsEssentials.js` (para rodar na mão: `node --env-file=.env server/scripts/syncLeadsEssentials.js [--dry]`).

- A cópia é idempotente: `leads.fonte_id` guarda o id do lead no banco do site, e só entra o que ainda não foi copiado. Roda 45 s depois de subir e a cada `LEADS_SYNC_MINUTES`.
- **Antes do primeiro deploy**: rodar no SQL Editor do Supabase **do dash** o bloco "Sincronização de leads do site" do fim de `db/schema.sql` (coluna `fonte_id` + índice único).
- Em **Plesk → Node.js → Custom environment variables**, criar `ESSENTIALS_DATABASE_URL`. Usuário de leitura no banco do site (SQL Editor do projeto "Dados Essentials"): `create role dash_leitura login password '...'; grant usage on schema public to dash_leitura; grant select on public.leads to dash_leitura; create policy dash_leitura_le_leads on public.leads for select to dash_leitura using (true);`. A URL usa `dash_leitura.<ref do projeto>` como usuário.

**Vendas (tela Compras).** A mesma cópia traz as vendas: o n8n (fluxo HOTMART PAGAMENTOS) grava cada venda aprovada na tabela `vendas` do banco do site (função `receber-venda`), e `server/salesSync.js` copia para `purchases`, que a tela Compras lê. Regras: só entra a **primeira cobrança** (`recorrencia` vazia ou 1; parcelas 2+ não são venda nova); venda que já existe (mesmo e-mail, curso e dia) não duplica; o plano `REC_Essentials` vira o curso `Essentials`; compra em moeda diferente de BRL entra **sem valor** (o valor da Hotmart vem na moeda do comprador). A origem do checkout (`src`, `sck`, `xcod`) fica em `purchases.src/xcod`; quando o anúncio manda `utm_id`, o `xcod` vem como `ad_<ID da campanha>|...`, o servidor tira o `campaign_id` dele e a tela mostra o **nome** da campanha (pelo cadastro do site com o mesmo ID). Sem isso, a origem mostrada é o rótulo da página (`live`, `essentials_live`...).

- **Antes do primeiro deploy** (se o banco for outro): rodar os blocos "Vendas copiadas do banco do site" e "ID da campanha da Meta em cada lead" do fim de `db/schema.sql`. No banco de produção atual já estão aplicados.
- O usuário `dash_leitura` do banco do site precisa também de `grant select on public.vendas to dash_leitura;` e da policy de leitura em `vendas` (já criada).
- A tabela `vendas` do banco do site ganhou `src`, `sck`, `xcod`, `recorrencia`, `assinante` e `moeda`, e a função `receber-venda` (versão 3) grava esses campos. O nó "Envia venda ao Banco (Supabase)" do fluxo HOTMART PAGAMENTOS manda `src/sck/xcod` (de `origin`), `recorrencia`, `assinante` e `moeda`.
- Os fluxos `irezume-leads` e `leads-interessados` passaram a repassar `utm_id`, `utm_term`, `utm_content`, `campaign_id`, `adset_id`, `ad_id`, `criativo`, `fbclid` e `gclid` até a tabela `leads` do banco do site.

**Leads no dashboard.** O pixel da Meta nem sempre registra o evento de Lead do formulário (ex.: a campanha CHAMADA DE QUINTA tinha 100 cadastros no site e 2 eventos no pixel). Por isso, no nível de **campanha**, `leads` = o **maior** entre os cadastros do site e os eventos do pixel (nunca a soma), e o custo por lead usa esse valor. O cruzamento é pelo **ID da campanha** (`leads.campaign_id`), na mesma janela de datas da Meta (`server/siteLeads.js`). `leadsMeta` e `leadsSite` seguem na resposta para a tela explicar a diferença. Conjuntos e anúncios continuam com o número do pixel, porque o site não grava o `utm_content`.

- **De onde vem o ID:** do `utm_id` do cadastro, se o anúncio mandar (veja abaixo). Nos cadastros sem ele, o servidor "congela" o ID a partir do nome (`utm_campaign` = nome atual da campanha), uma vez por minuto no máximo, sempre que o dashboard ou os alertas carregam as campanhas. Depois de congelado, **renomear a campanha na Meta não perde os leads antigos.** Nome repetido em duas campanhas é ignorado (ambíguo).
- **Para não depender do nome nunca:** nos parâmetros de URL do anúncio (Gerenciador de Anúncios → Anúncio → Rastreamento → Parâmetros de URL) acrescentar `utm_id={{campaign.id}}`. O site já guarda o `utm_id` que vier. Sem isso, um cadastro que chega com o nome antigo **depois** de a campanha ser renomeada (UTM com texto fixo em vez de `{{campaign.name}}`) fica sem campanha.
- Enquanto um lead não tem ID, ele ainda é cruzado pelo nome.
- **Antes do deploy** (se o banco for outro): rodar o bloco "ID da campanha da Meta em cada lead" do fim de `db/schema.sql` (coluna `campaign_id` + índice). No banco de produção atual já está aplicado.
- Cadastros com `utm_campaign` vazio ou com `{{campaign.name}}` (macro não preenchida) não entram em nenhuma campanha.
- Campanhas de outra conta de anúncios só ganham ID quando essa conta é carregada no dashboard.
- Série diária: campanha com cadastros no site usa só o site; sem cadastros no site, usa o pixel.
- Se a consulta ao banco falhar, o dashboard continua com o número do pixel (só registra um aviso no log).

## Live do Essentials (tela `/live`)

O dash liga/desliga a página da Live em `tuzinho.academy/produtos/essentials/` criando ou apagando **um único arquivo**, `live.on`, na pasta do site principal (o `.htaccess` de lá, mantido no repositório "produtos", decide pela existência dele). Código: `server/live.js`, `server/liveHandler.js`, `server/liveScheduler.js`.

- **Estado real** = o arquivo existe. É isso que a tela mostra.
- **Estado desejado** (banco, tabelas `live_settings` e `live_log`) = ligada manualmente dentro do prazo **ou** dentro de uma janela da agenda semanal (fuso America/Sao_Paulo, calculado no Node).
- O agendador (`liveScheduler.js`, junto do processo Node) confere a cada 30 s e na inicialização, e cria/apaga o arquivo quando real ≠ desejado.
- Ligação manual sempre tem prazo (no máximo `LIVE_MAX_HOURS`, padrão 6 h, ou até o fim do horário da agenda em andamento, se for mais longo). Desligar no meio de uma janela da agenda pausa a agenda até o fim daquela janela.
- Se não conseguir escrever o arquivo, nada é gravado no banco e a tela mostra o erro.

Antes de usar pela primeira vez:

1. Rodar no SQL Editor do Supabase o trecho de `live_settings`/`live_log` do final de `db/schema.sql`.
2. Configurar `LIVE_FLAG_PATH` (e, se quiser, `LIVE_MAX_HOURS`) nas variáveis do Node.js. Quem pode habilitar/desabilitar é quem tem cargo **admin** (ver "Cargos").
3. Plesk → Node.js → **Run script** → `run live:check`. Ele mostra o usuário do processo e se ele pode escrever na pasta, **sem criar nada**. Se der erro de permissão, não abra 777: ajuste o dono/grupo da pasta (mesmo usuário de sistema da assinatura) ou fale com o suporte do Plesk.
4. Rodar **só uma instância** do app: as duas convergiriam para o mesmo estado (é idempotente), mas não há motivo para duplicar.

## Cargos (tela `/usuarios`)

Coluna `users.cargo`: **admin** tem acesso a tudo, inclusive alterações (metas, Live, cargos de outros usuários); **usuario** usa todas as telas e pode gerar relatório, mas não altera nada. A regra fica no `server/middleware.js`: qualquer requisição que não seja GET (exceto `/api/report`) e toda a rota `/api/users` exigem admin, e respondem 403 para os demais. O cargo é lido a cada requisição, então a mudança vale na hora, sem novo login. Cadastro novo entra como `usuario`. O sistema não deixa remover o último admin ativo.
