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
| `LIVE_ADMIN_EMAILS` | E-mails que podem ligar/desligar a Live e editar a agenda (separados por vírgula) |
| `LIVE_MAX_HOURS` | Teto de emergência da ligação manual em horas (padrão `6`). Não corta horário da agenda mais longo que isso |
| outras | ver `.env.example` na raiz do repo |

Token do Meta expira (~60 dias mesmo estendido) — quando o dashboard começar a dar erro de permissão nas contas, repetir o processo de gerar/estender token no Graph API Explorer e atualizar `META_ACCESS_TOKEN`.

## Migrations de banco (Supabase)

`db/schema.sql` tem `create table if not exists` (não altera tabela já existente) **e** um bloco de `alter table ... add column if not exists` logo abaixo, comentado como migração incremental. Depois de um `git pull`/deploy que mexeu em `db/schema.sql`, rodar esse bloco manualmente no **SQL Editor do Supabase** antes de restart, se a tabela já existir.

## Live do Essentials (tela `/live`)

O dash liga/desliga a página da Live em `tuzinho.academy/produtos/essentials/` criando ou apagando **um único arquivo**, `live.on`, na pasta do site principal (o `.htaccess` de lá, mantido no repositório "produtos", decide pela existência dele). Código: `server/live.js`, `server/liveHandler.js`, `server/liveScheduler.js`.

- **Estado real** = o arquivo existe. É isso que a tela mostra.
- **Estado desejado** (banco, tabelas `live_settings` e `live_log`) = ligada manualmente dentro do prazo **ou** dentro de uma janela da agenda semanal (fuso America/Sao_Paulo, calculado no Node).
- O agendador (`liveScheduler.js`, junto do processo Node) confere a cada 30 s e na inicialização, e cria/apaga o arquivo quando real ≠ desejado.
- Ligação manual sempre tem prazo (no máximo `LIVE_MAX_HOURS`, padrão 6 h, ou até o fim do horário da agenda em andamento, se for mais longo). Desligar no meio de uma janela da agenda pausa a agenda até o fim daquela janela.
- Se não conseguir escrever o arquivo, nada é gravado no banco e a tela mostra o erro.

Antes de usar pela primeira vez:

1. Rodar no SQL Editor do Supabase o trecho de `live_settings`/`live_log` do final de `db/schema.sql`.
2. Configurar `LIVE_FLAG_PATH`, `LIVE_ADMIN_EMAILS` (e, se quiser, `LIVE_MAX_HOURS`) nas variáveis do Node.js.
3. Plesk → Node.js → **Run script** → `run live:check`. Ele mostra o usuário do processo e se ele pode escrever na pasta, **sem criar nada**. Se der erro de permissão, não abra 777: ajuste o dono/grupo da pasta (mesmo usuário de sistema da assinatura) ou fale com o suporte do Plesk.
4. Rodar **só uma instância** do app: as duas convergiriam para o mesmo estado (é idempotente), mas não há motivo para duplicar.
