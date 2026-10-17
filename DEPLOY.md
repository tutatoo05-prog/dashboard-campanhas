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

**Eventos da Hotmart (planilha "tracking essentials").** O n8n (fluxo "Essentials Webhook Unico 2026", 2º webhook da Hotmart) grava todos os eventos na aba-base `Hotmart (todos)` de uma planilha aberta por link (`1PKUyzv3isiEW-HbHH4sY2zaSJcK1yi3ejG0ETKGCFeg`; o ID e os gids estão em `server/hotmartEvents.js` e `server/registrosHandler.js`). O dash lê o CSV dessa planilha (sem chave; ela precisa continuar "qualquer pessoa com o link pode ver"):
**Fonte dos eventos: banco primeiro, planilha como histórico.** Desde que o dash recebe o webhook da Hotmart direto (tabela `hotmart_eventos`), `loadHotmartEvents` (Compras, `/api/eventos-hotmart`) e a tela Registros leem os eventos de lá: o payload de cada webhook é normalizado (`eventoDoPayload` em `server/hotmartEvents.js`) para o mesmo formato da planilha (categoria venda/pix_boleto/abandono/cancelamento/reembolso, origem/campanha/xcod/valor/pagamento) e juntado ao histórico da planilha (`juntarEventos`). Evento novo aparece em até ~5 s (cache curto), sem esperar a cópia de 5 min. Sem repetir: o evento da planilha é descartado se o banco já tem o mesmo `id` do evento, a mesma transação na mesma categoria, ou (carrinho abandonado, que não tem transação) a mesma pessoa e categoria em até 10 min. Eventos que a tela não usa (troca de plano, assinatura criada...) e e-mails de teste são ignorados. Se a leitura do banco falhar, as telas seguem só com a planilha; se o Google falhar, seguem só com o banco. O cruzamento por pessoa e as situações (`withSituations`) rodam sobre a lista já juntada. O webhook "tracking-essentials" do n8n continua gravando a planilha de propósito (histórico/reserva); pode ser desligado quando o histórico antigo não for mais necessário. Em Registros, as abas de eventos da Hotmart são recalculadas a cada leitura por cima da cópia das planilhas (`comEventosHotmart` em `server/registrosHandler.js`); leads e as demais planilhas continuam vindo da cópia.
- **Registros:** planilha "Tracking Essentials" com as abas Leads novos/repetidos/reprovados e os eventos separados em Vendas aprovadas, Boleto e Pix gerados, Carrinho abandonado, Cancelamentos e atrasos, Reembolsos e chargebacks.
- **Compras:** painel "Quem ainda pode virar venda" (`GET /api/eventos-hotmart`, só administradores). Pix/boleto gerado conta como **pendente** até 3 dias sem pagamento (depois "vencido?"); some da lista quando a mesma transação é aprovada. Carrinho abandonado vira "em aberto" até a pessoa comprar. E-mails de teste (`@teste.com`, `@exemplo.com`) são ignorados e valores em moeda estrangeira ficam sem valor em reais.
- Se a planilha trocar de aba ou o gid mudar, o erro aparece na própria tela Registros ("Não consegui ler..."). A aba antiga "Dados Academy / compradores" já dava erro 400 (aba removida).

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

## Liberação de acesso pelo dash (tela `/acessos`, substitui o fluxo "HOTMART PAGAMENTOS" do n8n)

Código em `server/acesso/`. O dash recebe os eventos da Hotmart, grava, e executa o mesmo caminho do n8n: **CPF → liberar-curso → e-mail com o acesso (Brevo) → venda no banco → WhatsApp ao aluno → aviso ao Tuzinho**, mais carrinho abandonado e parcela atrasada.

**Como não perder nada**
- O webhook grava o evento ANTES de responder. Banco fora do ar → responde 500 e a Hotmart reenvia. Evento repetido (mesmo `id`) não faz nada em dobro.
- Cada passo grava seu resultado no próprio evento. Se um falha, a tentativa seguinte refaz só ele (1, 2, 5, 10, 30 e 60 min; 7 tentativas). `liberar` é o único que trava os demais: sem acesso liberado ninguém é avisado.
- A equipe recebe WhatsApp na 3ª tentativa, ao desistir, e sempre que algo exige gente (compra sem CPF, e-mail inválido, produto sem regra).
- Tela **Acessos → Eventos da Hotmart**: etapa por etapa, com botão "Tentar de novo agora".

**Regras**
- **Prazo na plataforma: 365 dias para todo mundo** (cartão, Pix, Pix parcelado). A API da plataforma ainda não renova (uma 2ª chamada responde "Usuário já possui acesso ao curso") nem bloqueia, então o dash não tenta controlar o prazo lá.
- **Pix parcelado** (plano `REC_*` pago por `PIX`/`PIX_AUTOMATIC`) é só marcado à parte no dash: cada parcela paga cobre 30 dias (`pago_ate`, visível em Acessos → Alunos). A parcela seguinte (`recorrencia` > 1, ou mesmo assinante com outra transação) chama `liberar-curso` de novo e soma parcela, sem repetir e-mail nem venda.
- **Parcela atrasada** (`PURCHASE_DELAYED`): quem é de Pix parcelado vira "atrasado" e, no **2º dia de atraso** (meia-noite de São Paulo, `ACESSO_BLOQUEIO_DIA`), passa a **"Inativar na plataforma"**: aparece em destaque na tela Acessos ("O que você precisa fazer agora") com WhatsApp, e a equipe recebe um aviso por WhatsApp. Depois de inativar na plataforma, clique **"Já inativei"**.
- **Pagou de novo depois de inativado:** vira **"Reativar na plataforma"** (com aviso por WhatsApp). Depois de reativar lá, clique **"Já reativei"**. Pagou antes de inativar: o atraso é cancelado sozinho.
- Quando a Tekway tiver endpoint de bloqueio, basta preencher `TEKWAY_BLOQUEAR_URL`: o dash passa a inativar sozinho.
- Mentoria Particular e Workshop Presencial: só e-mail e aviso (não liberam curso), como no n8n.

**Migration:** rodar o bloco "Liberação de acesso dentro do dash" do fim de `db/schema.sql` (tabelas `hotmart_eventos`, `acessos`, `abandonos`).

**Variáveis (Plesk → Node.js → Variáveis).** Os valores vêm dos nós do workflow no n8n:

| Variável | De onde vem |
|---|---|
| `ACESSO_MODO` | `teste` (só grava e simula) → depois `ativo`. Vazio/`desligado` = o n8n segue sozinho |
| `HOTMART_HOTTOK` | Hotmart → Ferramentas → Webhook → Hottok (já usada pelo cancelamento) |
| `TEKWAY_LIBERAR_URL`, `TEKWAY_TOKEN` | nó "LIBERA ACESSO" (URL e cabeçalho `Authorization: Bearer …`) |
| `TEKWAY_BLOQUEAR_URL` | a combinar com a Tekway (opcional) |
| `BREVO_API_KEY`, `BREVO_REMETENTE_EMAIL` (`nao-responda@tuzinho.academy`, remetente verificado na Brevo), `BREVO_REMETENTE_NOME` | Brevo |
| `EVOLUTION_URL` | `https://evo01.tuzinho.academy` |
| `EVOLUTION_ALUNO_INSTANCIA` / `_APIKEY` | nós "MSG ACESSO" (instância `iphone-branco`) |
| `EVOLUTION_EQUIPE_INSTANCIA` / `_APIKEY` | nós "AVISA TUZINHO" (instância `tuzinho`) |
| `ACESSO_AVISO_NUMERO` | número do Tuzinho (campo "Numero Tu" dos nós "Edit Fields") |

A tela Acessos lista o que ainda falta configurar.

**Entrada em produção (sem risco de liberar duas vezes)**
1. Migration + variáveis, `ACESSO_MODO=teste`, Restart.
2. Hotmart → Webhook: **adicionar** (sem remover o do n8n) `https://dash.tuzinho.academy/api/hotmart/webhook` com os eventos de compra aprovada, atrasada, carrinho abandonado e cancelamento.
3. Acompanhar em Acessos por alguns dias: cada compra aparece como "simulado" com a decisão tomada. Conferir contra o que o n8n fez.
4. Virada: **no mesmo momento**, remover o webhook do n8n na Hotmart (ou desativar o workflow) e trocar `ACESSO_MODO=ativo` + Restart. Os dois ativos ao mesmo tempo liberariam e avisariam em dobro.
5. O n8n fica desativado (não apagado) como volta.

**Pendente com a Tekway:** endpoints de inativar e reativar acesso (e, de preferência, renovar prazo). Hoje a 2ª chamada de `liberar-curso` para o mesmo aluno responde "Usuário já possui acesso ao curso".

## Cargos (tela `/usuarios`)

Coluna `users.cargo`: **admin** tem acesso a tudo, inclusive alterações (metas, Live, cargos de outros usuários); **usuario** usa todas as telas e pode gerar relatório, mas não altera nada. A regra fica no `server/middleware.js`: qualquer requisição que não seja GET (exceto `/api/report`) e toda a rota `/api/users` exigem admin, e respondem 403 para os demais. O cargo é lido a cada requisição, então a mudança vale na hora, sem novo login. Cadastro novo entra como `usuario`. O sistema não deixa remover o último admin ativo.

**Conferir as chaves antes de ligar (não toca em aluno nenhum):** tela **Acessos → Conferir conexões**. Roda com as variáveis reais do servidor: mostra o que falta, se a chave da Brevo e o remetente valem e se as instâncias do WhatsApp estão conectadas; com um e-mail preenchido, manda também 1 e-mail e 1 WhatsApp de teste. (O "Run script" do Plesk NÃO carrega as variáveis do app, por isso `npm run acesso:verificar` só serve na máquina local com `--env-file=.env`.)

**Alunos que já estavam na plataforma:** `node --env-file=.env server/scripts/importarAlunosAtivos.js db/alunos-plataforma-AAAA-MM-DD.json [--dry]` copia para Acessos → Alunos só os "Ativado" da lista exportada da plataforma (a lista tem número, nome, curso, status e validade, sem e-mail; o e-mail é ligado pelo nome quando ele aponta para uma única compra ou cadastro do site). O arquivo fica fora do git (`db/alunos-*.json`). Rodar de novo não duplica. Migration: bloco "Alunos que já estavam na plataforma de cursos" de `db/schema.sql`.

## Tipo da campanha (ficha automática)
O dash descobre sozinho **para que cada campanha serve** (captação de leads, live/vídeo, venda, reconhecimento, engajamento, conversas) lendo da Meta o objetivo, a meta de otimização e o destino dos conjuntos, o evento do pixel e o link dos anúncios (`src/lib/campaignType.js`; leitura em `server/metaApi.js`, guardada por 10 minutos). Cada tipo tem o resultado certo: live/vídeo, engajamento, venda, reconhecimento e conversas **não são cobrados por lead** e ficam fora do custo por lead da conta, das médias e dos alertas (inclusive os do servidor).
- Só quando não entende (tipo "não identificado"), a Central de Ações pergunta "Para que serve a campanha X?" com os tipos para escolher. Admin também pode corrigir qualquer tipo no painel lateral da campanha ("mudar"); "Voltar ao automático" desfaz.
- Campanha com data final já vencida aparece como **Concluída** e some das listas de ativas e das ações.
- **Migration:** bloco "Ficha da campanha" de `db/schema.sql` (tabela `campaign_profiles`, só guarda o que o usuário confirmou). Sem ela o painel funciona, só não salva a escolha.
- Domínios que contam como "página sua" (anúncio de tráfego para eles = captação): `DOMINIOS_PROPRIOS` em `src/lib/campaignType.js`.

## Cópia das planilhas no banco (Registros e Compras rápidos)
Ler as 16 abas das planilhas do Google ao vivo levava até ~14 s a cada abertura de **Registros** e dos "Eventos da Hotmart" em **Compras**. Agora o servidor copia as planilhas para a tabela `planilhas_copia` a cada **5 minutos** (`server/planilhasSync.js`) e as telas leem de lá (menos de 1 s). O botão **Atualizar** de Registros copia na hora. Se a cópia falhar, a última cópia boa continua valendo (o erro fica registrado na própria tabela).
- **Migration:** bloco "Cópia das planilhas do Google no banco" de `db/schema.sql`. Sem a tabela, as telas continuam lendo o Google ao vivo (como antes).
- Variáveis (opcionais): `PLANILHAS_SYNC_ENABLED=false` desliga a cópia; `PLANILHAS_SYNC_MINUTES` muda o intervalo (padrão 5).
- As "situações" dos eventos (Pix pendente/vencido, carrinho em aberto) são calculadas na hora de ler, então não ficam velhas.

## Se as telas ficarem "carregando" (chamadas para fora)
Abrir uma tela dispara dezenas de conexões para a Meta e para o Google de uma vez; o Node resolve nomes (DNS) numa fila de poucas threads, e com a fila cheia as conexões estouram o limite de 10 s ("Connect Timeout") e **todas** as telas ficam carregando. Por isso (`server/limitador.js`): no máximo 5 chamadas à Meta e 3 downloads de planilha ao mesmo tempo, limite de 30 s e uma nova tentativa quando a falha é de rede; se a Meta falhar, a tela segue com a última leitura boa (até 30 min). O servidor também sobe com `UV_THREADPOOL_SIZE=16`; se ainda assim travar, coloque essa variável também no Plesk (Node.js → variáveis). A primeira cópia das planilhas só roda 45 s depois do Restart.

## Painel lento e "deslogando" ao atualizar (DNS e login)
**Causa encontrada:** o servidor resolve nomes (DNS) sem guardar o resultado. Com o DNS do servidor lento (medido aqui: 3 a 8 s por consulta), toda conexão nova (banco, Meta, Google) esperava isso, a leitura da sessão no banco estourava os 8 s da tela e o painel mandava a pessoa para o login — a sessão em si nunca foi apagada.
**O que mudou:**
- `server/dnsCache.js`: o endereço de cada serviço fica guardado (5 min valendo direto; depois disso usa o velho na hora e atualiza em segundo plano, até 24 h; se o DNS falhar, vale o último conhecido). Ao subir, o servidor já abre as primeiras conexões ("[aquecimento]" no log).
- Login: só vai para a tela de login quando o servidor responde "não está logado". Servidor lento ou fora do ar vira "O servidor demorou para responder. Você continua logado." com botão **Tentar de novo** (4 tentativas automáticas antes). A conferência do login fica 30 s em memória (menos consultas ao banco por tela).
- Banco: limite de 15 s para abrir conexão (antes esperava para sempre).
- **Diagnóstico:** abra `https://dash.tuzinho.academy/api/saude` (sem login, sem dados de ninguém): mostra em milissegundos o banco, o DNS de cada serviço, a fila de conexões, o atraso do servidor e a memória. No log do app aparecem `[lento]` (chamada que passou de 3 s) e `[travada]` (servidor parado por mais de 1 s).

## Limite de conexões do banco (15 no total)
O pooler do Supabase em **modo sessão (porta 5432)** aceita no máximo **15 conexões somando TODOS os processos** (o app, o app antigo ainda fechando num deploy, scripts rodando na sua máquina com o `.env` de produção...). Com 10 conexões por processo, dois processos já estouravam (`EMAXCONNSESSION: max clients reached`) e as telas ficavam sem banco. Agora cada processo usa no máximo **6** (`DB_POOL_MAX` muda), tenta de novo quando não há vaga, e mantém 2–3 conexões abertas (a cada 2 minutos), porque abrir uma nova custa ~1 s (o banco está no Canadá e o servidor no Brasil, ≈150 ms por ida e volta).
- **Não rode** `node server/production.js` nem scripts pesados na sua máquina com o `.env` de produção enquanto usa o painel: cada um ocupa vagas do mesmo limite.
- **Ganho grande, se um dia valer a pena:** trocar a porta da `DATABASE_URL` para **6543** (modo transação, sem esse limite de 15) — o código do dash não usa transações longas nem recursos de sessão. Ou recriar o banco do dash na região São Paulo (sa-east-1): cada consulta cairia de ≈150 ms para ≈10 ms.
- `https://dash.tuzinho.academy/api/saude` mostra `filaDoBanco` (total/ociosas/esperando/máximo).

## Avisos de problema no Telegram (vigia)
Quando algo falha, a equipe é avisada no **Telegram** (grátis, instantâneo, sem arriscar o número do WhatsApp). Sem Telegram configurado, os avisos de problema continuam indo pelo WhatsApp da equipe (`ACESSO_AVISO_NUMERO`); o aviso de "nova venda" continua só no WhatsApp.
- **Variáveis (Plesk → Node.js):** `TELEGRAM_BOT_TOKEN` (do @BotFather) e `TELEGRAM_CHAT_ID` (seu id, ou o de um grupo com o bot). Nunca coloque o token no código nem em arquivos do repositório; se ele aparecer em algum chat ou print, gere outro no @BotFather (`/revoke`) e atualize no Plesk.
- **O que avisa** (`server/vigia.js`, a cada 10 min, só com `ACESSO_MODO=ativo`; `VIGIA_ENABLED=false` desliga, `VIGIA_MINUTES` muda o intervalo): evento da Hotmart parado há mais de 15 min; evento que falhou/precisa de atenção nas últimas 24 h (aluno possivelmente sem acesso); webhook que **nunca** recebeu nada; webhook que parou de chegar há mais de 36 h (depois de ter 5+ eventos na semana). Cada aviso repete no máximo de tempos em tempos (1 h a 24 h) para não virar spam.
- Além do vigia, as falhas da liberação (3ª tentativa, desistência, caso que precisa de atenção, falha ao bloquear) também vão para o Telegram (`avisarProblema` em `server/acesso/integracoes.js`).
- **Testar:** menu **Admin → Segurança** → botão **Testar aviso de problema**.

## Backup diário do banco (fora do Supabase)
O plano grátis do Supabase **não faz backup**. Por isso `server/backup.js` exporta todas as tabelas do dash (menos sessões, redefinições de senha e a cópia das planilhas, que se refazem sozinhas) todo dia depois das 3 h (São Paulo), em JSON compactado e **criptografado** (AES-256-GCM, porque há e-mails, telefones e CPFs), e guarda em dois lugares: a pasta `backups/` do servidor (últimos 14 dias) e o chat do Telegram da equipe (histórico completo).
- **Variáveis:** `BACKUP_PASSPHRASE` (**obrigatória**, 12+ caracteres, guarde também no seu gerenciador de senhas: sem ela o backup não abre), `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` (para o envio ao Telegram). Opcionais: `BACKUP_HORA` (padrão 3), `BACKUP_DIR`, `BACKUP_DIAS` (padrão 14), `BACKUP_ENABLED=false`. Sem `BACKUP_PASSPHRASE` o backup fica desligado e o log avisa.
- **Fazer agora:** menu **Admin → Segurança** → botão **Fazer backup agora**. Se o backup diário falhar, a equipe é avisada.
- **Restaurar** (no seu computador, apontando `DATABASE_URL` para o banco de destino e `BACKUP_PASSPHRASE` para a senha do backup): `node --env-file=.env server/scripts/restaurarBackup.js dash-AAAA-MM-DD.bkp --confirmar` (só restaura em tabelas vazias; `--limpar` apaga as tabelas antes). Baixe o arquivo `.bkp` do Telegram ou da pasta `backups/`. Tudo roda numa transação: se der erro, nada é restaurado.
- **Google Drive (opcional):** o backup também pode ir para uma pasta do seu Drive. Instale o recebedor de scripts/backup-drive.gs no Google Apps Script (instruções no próprio arquivo: cole o código, crie a propriedade SEGREDO, implante como "App da Web" e copie a URL), e no Plesk crie BACKUP_DRIVE_URL (a URL /exec) e BACKUP_DRIVE_TOKEN (o mesmo SEGREDO). O arquivo vai criptografado e o script guarda os últimos 30. Se o Drive falhar, o backup continua no servidor e no Telegram.

## Deploy automático (sem os 4 passos manuais)
O Plesk puxa e publica sozinho a cada `git push`:
1. Plesk → **Websites e Domínios** → dash.tuzinho.academy → **Git** → ícone de ajustes do repositório (**Repository settings**).
2. **Deployment mode: Automatic**, diretório `/dash.tuzinho.academy`, **Enable post deployment actions** marcado, e na caixa **Post deployment actions** esta linha única (usa o Node que o próprio Plesk instala em /opt/plesk/node; o final reinicia o app, como o botão Restart App; o ambiente das ações do Plesk tem o PATH quase vazio: nem nodenv nem comandos como sort existem, por isso a linha usa só recursos do shell):
   `for d in /opt/plesk/node/*/bin; do PATH="$d:$PATH"; done; export PATH="$PATH:/usr/local/bin:/usr/bin:/bin"; command -v npm && npm install && npm run build && mkdir -p tmp && touch tmp/restart.txt`
3. Copie a **Webhook URL** dessa mesma tela. No GitHub: repositório → **Settings → Webhooks → Add webhook**; *Payload URL*: a URL do Plesk; *Content type*: `application/json`; evento: **Just the push event**. Só desative a verificação de SSL se o GitHub reclamar do certificado.
4. Teste: depois do próximo push, o commit aparece sozinho em Git → *Latest commits* e a entrega do webhook fica verde (200) em *Recent Deliveries*; `/api/saude` mostra o servidor ligado há poucos minutos.
- O deploy **não roda os testes**: rode `npm test` antes de pedir o push. Se o build quebrar, o app anterior continua no ar até o próximo build bem-sucedido.
- `scripts/deploy-plesk.sh` é a mesma sequência em arquivo, para rodar à mão se precisar.
- Para desligar: **Deployment mode: Manual**.
