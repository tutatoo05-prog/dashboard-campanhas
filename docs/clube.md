# Clube de membros e Discord

Tela **Clube** (só admin, menu Operação) e página pública **`/discord`** (resgate do membro). Código em `server/clube/`, banco em `db/clube.sql`.

## O que já está pronto no código

| Parte | Onde | Estado |
|---|---|---|
| Tabelas `clube_membros`, `clube_snapshots`, `clube_estado` (RLS ligado) | `db/clube.sql` | Pronto e testado em Postgres real. **Ainda não rodado na produção.** |
| Membros da Essentials (vem da tabela `acessos`: ativo e vigente, um por e-mail) | `server/clube/repo.js` | Pronto, funciona sem nenhuma credencial nova |
| Lista de membros do canal (`members.list`, todas as páginas) | `server/clube/youtube.js` | Pronto, testado com Google simulado. Falta a autorização |
| Sincronização a cada 6 h (+ botão "Sincronizar agora"), com **trava**: fonte vazia nunca cancela ninguém | `server/clube/sync.js` | Pronto, ligada no `production.js` |
| Resgate: Essentials por e-mail com link de confirmação; YouTube por login Google; depois login Discord, entrada no servidor e cargo | `server/clube/resgate.js`, `discord.js` | Pronto, testado com Google/Discord/Brevo simulados |
| Remoção do cargo quando o membro sai | `server/clube/sync.js` | Pronto |
| Painel (o que falta configurar, números, evolução, lista com busca) e página `/discord` | `src/pages/ClubePage.tsx`, `DiscordPage.tsx` | Pronto, conferido no navegador |

Nada disso liga sozinho: sem as variáveis abaixo, o painel mostra exatamente quais faltam, o resgate responde "indisponível" e a sincronização pula a parte sem credencial.

## O que falta para ligar (passo a passo)

### 1. Banco
Rode `db/clube.sql` no SQL Editor do Supabase (schema `dash`). É idempotente. Ele já passa o dono das tabelas para `dash_app` antes de ligar o RLS (o dash conecta como `dash_app`; sem isso o app seria bloqueado).

### 2. Google (membros do canal @tuzinhoacademy)
1. No Google Cloud, **redefina o `client_secret`** (o antigo circulou em chat) e use o novo só no `.env`.
2. Ative as APIs **YouTube Data API v3** e **YouTube Analytics API** no projeto.
3. Tela de consentimento OAuth em **"Em produção"** (em "Teste" o refresh token vence em 7 dias e a lista para de atualizar sozinha).
4. Cadastre em "URIs de redirecionamento": `https://dash.tuzinho.academy/api/clube/resgate/google/callback` (o painel mostra o endereço exato).
5. Gere um **refresh token novo, com a conta dona do canal**, com o escopo `https://www.googleapis.com/auth/youtube.channel-memberships.creator` (OAuth Playground, "usar suas próprias credenciais"). Ele vai em `YOUTUBE_MEMBROS_REFRESH_TOKEN`. O `YOUTUBE_REFRESH_TOKEN` das Finanças é outro (só receita) e continua como está.
6. `YOUTUBE_CLIENT_ID` e `YOUTUBE_CLIENT_SECRET` são os mesmos das Finanças. Hoje as 3 variáveis das Finanças também **não estão no servidor** (por isso a tela Finanças mostra "YouTube não configurado").

### 3. Discord
1. Developer Portal → New Application. Anote **Client ID** e **Client Secret** (OAuth2).
2. OAuth2 → Redirects: `https://dash.tuzinho.academy/api/clube/resgate/discord/callback`.
3. Bot → crie o bot, copie o **token**. Não precisa ligar "intents" privilegiadas.
4. Convide o bot ao servidor com a permissão **Gerenciar cargos** (e "Criar convite").
5. No servidor, arraste o cargo do bot para **cima** dos cargos de membro. Sem isso o Discord recusa dar o cargo (o erro aparece como "cargo do bot está acima dele?").
6. Crie os cargos (um para membros do YouTube, outro para a Essentials) e copie os IDs (modo desenvolvedor → botão direito no cargo → copiar ID).
7. Variáveis: `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_ROLE_YOUTUBE`, `DISCORD_ROLE_ESSENTIALS`.

### 4. E-mail do resgate
Já usa a Brevo (`BREVO_API_KEY`, `BREVO_REMETENTE_EMAIL`) e o `TELWAY_V2_TOKEN` como segredo dos links, que já existem em produção. Opcional: `CLUBE_SEGREDO` próprio.

### 5. Verificação do app do Google (membros do YouTube pelo login Google)
O login do membro usa o escopo `youtube.readonly`, que o Google classifica como **sensível**: para o público geral o app precisa passar pela **verificação do Google** (leva dias ou semanas). Até lá, só contas cadastradas como "usuários de teste" conseguem entrar. Alternativa se a verificação for um problema: o próprio Discord já lê a conexão do YouTube, mas isso obriga o membro a conectar a conta (justamente o que queremos evitar).

### 6. Teste de ponta a ponta (depois de configurar)
1. Tela Clube → "Sincronizar agora": os 3 blocos devem ficar sem erro.
2. Abra `/discord` numa janela anônima e teste o caminho da Essentials com um e-mail de aluno de verdade (use a sua conta de teste).
3. Confira no Discord se a pessoa entrou e recebeu o cargo; na tela Clube, o membro aparece como "no Discord".
4. Bloqueie o acesso de teste em `acessos`, sincronize, e confira que o cargo saiu.

## Decisões de segurança (não mudar sem pensar)

- **A API do YouTube não devolve e-mail de membro** (só o ID do canal). Por isso o membro do YouTube prova quem é entrando com o Google, e não digitando e-mail.
- **E-mail digitado nunca basta**: só o link enviado ao próprio e-mail libera o passo seguinte. A resposta de "pedir link" é sempre a mesma, exista ou não o e-mail (não revela quem é membro).
- Os links e o "state" dos logins são tokens assinados (HMAC), de validade curta (20 e 10 minutos), com propósito próprio, e carregam **só o id do membro** (nada pessoal na URL; a página `/discord` ainda apaga o `?t=` do endereço).
- Limites: 30 acessos por IP a cada 15 min; 5 pedidos de link por IP a cada 15 min; 3 por e-mail por hora.
- Um membro = um Discord: refazer o resgate com outra conta tira o cargo da anterior.
- **Trava de sincronização**: se uma fonte devolver lista vazia mas houver membros ativos, ninguém é cancelado nem perde cargo (um erro de API não pode derrubar todo mundo).
- Tokens, segredos e e-mails não vão para o log. Os tokens do Discord e do Google do membro são usados uma vez e **não são guardados**.

## Ainda não existe (decisões para depois)

- **Receita do clube.** A receita do YouTube já entra em Finanças (precisa só das 3 variáveis no servidor). Receita *só de membros* não é separada pela API; daria para estimar por nível × membros se você me passar os preços.
- **Cargos por nível do YouTube** (hoje há um cargo só para todos os membros do canal). O nível já é guardado em `clube_membros.nivel`; falta decidir o mapa nível → cargo.
- Aviso por Telegram/WhatsApp quando a sincronização falhar por vários dias.
- Rotina que remove do servidor quem não é mais membro (hoje só o cargo é removido).
