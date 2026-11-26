# Tutorial: ligar o clube (Google + Discord)

Passo a passo para quem vai colocar o clube no ar. Faça na ordem. No fim de cada parte há como conferir que deu certo.
Os nomes dos botões nos painéis do Google e do Discord mudam de tempos em tempos: se um nome não bater, procure o parecido.

## Parte 0: como colocar uma variável no servidor

Toda variável abaixo vai em **Plesk → Websites e Domínios → dash.tuzinho.academy → Node.js → Custom environment variables**
(um campo "nome" e um campo "valor" por linha). Depois de salvar tudo, clique em **Restart App**. Sem reiniciar, o servidor
não enxerga as variáveis novas.

Regra de ouro: **segredo nunca vai em chat, e-mail, print nem no repositório**. Cole direto do painel do Google/Discord para o Plesk.

Para conferir o que já entrou: abra **dash.tuzinho.academy → Clube**. O cartão "Configuração" mostra, bloco a bloco, o nome de cada variável
que ainda falta (nunca os valores).

---

## Parte 1: Google, lista de membros do canal e receita

Objetivo: o servidor conseguir ler **quem são os membros do canal @tuzinhoacademy** e, de quebra, a **receita do YouTube nas Finanças**
(hoje a tela Finanças mostra "YouTube não configurado" porque essas variáveis nunca foram colocadas).

Faça logado no Google **com a conta que é dona do canal**.

### 1.1 Ativar as APIs
1. Abra <https://console.cloud.google.com> e, no seletor de projeto (topo), escolha o projeto `psychic-mason-469411-d0` (é o do `client_id` que já temos).
2. Menu → **APIs e serviços → Biblioteca**.
3. Procure **YouTube Data API v3** → **Ativar**.
4. Procure **YouTube Analytics API** → confirme que está **Ativada** (a receita das Finanças usa ela).

### 1.2 Tela de consentimento: publicar o app
Menu → **APIs e serviços → Tela de consentimento OAuth** (no painel novo chama **Google Auth Platform**, seções *Branding / Público / Acesso a dados*).

1. **Branding:** nome do app `Tuzinho Academy`, e-mail de suporte (o seu), **domínio autorizado** `tuzinho.academy`.
2. **Público (Audience):** tipo de usuário **Externo**. **Status de publicação: clique em "Publicar app" (Em produção)** e confirme.
   - Por quê: em **"Em teste"** o Google **apaga o refresh token a cada 7 dias** e a lista de membros para de atualizar sozinha, sem avisar.
   - Em produção o app aparece como "não verificado" só na hora de **você** autorizar: é normal, siga o passo 1.4.
3. **Acesso a dados (Data Access):** adicione os escopos (botão "Adicionar ou remover escopos", ou cole em "Adicionar escopos manualmente"):
   - `https://www.googleapis.com/auth/youtube.channel-memberships.creator`
   - `https://www.googleapis.com/auth/yt-analytics-monetary.readonly`

### 1.3 Credenciais: o endereço de retorno do OAuth Playground
Menu → **APIs e serviços → Credenciais → "ID do cliente OAuth 2.0"** (o cliente que já existe, tipo *Aplicativo da Web*).
Em **URIs de redirecionamento autorizados**, confira que existe (se não, adicione) e **salve**:
`https://developers.google.com/oauthplayground`

Se precisar de um novo segredo, aqui há o botão de **redefinir segredo**. (Decisão atual: seguir com o atual por enquanto. Veja a Parte 2, que usa um segredo novo para o login público.)

### 1.4 Gerar o refresh token (uma vez)
1. Abra <https://developers.google.com/oauthplayground>.
2. Clique na **engrenagem** (canto superior direito) → marque **"Use your own OAuth credentials"** → cole o **Client ID** e o **Client Secret** do cliente acima → **Close**.
3. No campo **"Input your own scopes"** (lado esquerdo, embaixo), cole **os dois escopos separados por espaço**:
   `https://www.googleapis.com/auth/youtube.channel-memberships.creator https://www.googleapis.com/auth/yt-analytics-monetary.readonly`
   e clique **Authorize APIs**.
4. Escolha a conta dona do canal. Se aparecer a lista de **canais**, escolha **Tuzinho Academy** (se o canal for "conta de marca", é aqui que ele aparece).
5. Aparece **"O Google não verificou este app"**: clique **Avançado → Acessar Tuzinho Academy (não seguro)** e **Permitir** nos dois escopos.
6. De volta ao Playground, no **Step 2** clique **"Exchange authorization code for tokens"** e copie o valor de **Refresh token**. Ele só aparece nesta tela: copie agora.

### 1.5 Colocar no servidor (Parte 0)
| Variável | Valor |
|---|---|
| `YOUTUBE_CLIENT_ID` | o Client ID |
| `YOUTUBE_CLIENT_SECRET` | o Client Secret |
| `YOUTUBE_REFRESH_TOKEN` | o refresh token do passo 1.4 (usado pelas **Finanças**) |
| `YOUTUBE_MEMBROS_REFRESH_TOKEN` | **o mesmo** refresh token (usado pelo **Clube**) |

Como o token foi gerado com os dois escopos, o mesmo valor serve nas duas variáveis. **Restart App.**

### 1.6 Conferir
- Tela **Clube**: o bloco "Membros do YouTube" fica verde. Clique **Sincronizar agora**: a linha "YouTube (membros do canal)" mostra `N ativos`.
- Tela **Finanças → Atualizar agora**: o cartão do YouTube deixa de mostrar "não configurado".
- Se der erro, veja "Problemas comuns" no fim.

---

## Parte 2: Google, login público do membro (o "Entrar com o Google")

Objetivo: o membro prova **qual canal é o dele** entrando com a conta Google. O escopo é `youtube.readonly`, que o Google classifica como
**sensível**: para o público geral o app precisa ser **verificado pelo Google** (como fazer e quanto tempo leva: seção 2.5).

### 2.1 Recomendado: um projeto separado só para o login público
A verificação do Google analisa **todos** os escopos do projeto. Se o login público ficar no mesmo projeto da receita e da lista de membros,
o Google vai pedir justificativa de escopos que só o dono usa, e a revisão demora mais. Com um projeto separado:
- o projeto **público** tem só `youtube.readonly` (revisão simples);
- o projeto **interno** (Parte 1) continua só com você como usuário;
- o login público ganha um **segredo novo**, e o segredo que circulou em chat não fica exposto a quem entra pelo site.

1. No seletor de projeto (topo) → **Novo projeto** → nome `Tuzinho Clube Login` → **Criar** (e selecione-o).
2. **APIs e serviços → Biblioteca → YouTube Data API v3 → Ativar** (neste projeto também).

### 2.2 Tela de consentimento do projeto público
1. **Branding:** nome do app **`Tuzinho Academy`** (o mesmo do site), e-mail de suporte, **logotipo** (quadrado, 120x120 px ou mais).
   - **Página inicial do app:** `https://tuzinho.academy/`
   - **Política de privacidade:** o endereço de uma página pública **no domínio tuzinho.academy** (veja 2.5, item 2).
   - **Domínios autorizados:** `tuzinho.academy`.
2. **Público:** **Externo**. Clique **Publicar app** (Em produção).
3. **Acesso a dados:** adicione **somente** `https://www.googleapis.com/auth/youtube.readonly`.

### 2.3 Credencial
**Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**, nome `Clube Login`.
- **URIs de redirecionamento autorizados:** `https://dash.tuzinho.academy/api/clube/resgate/google/callback`
  (idêntico, sem barra no final; o Clube mostra esse endereço exato no cartão "Endereços para cadastrar").
- **Criar** → copie o **Client ID** e o **Client Secret** (o segredo pode ser baixado em JSON; **não** o deixe na pasta Downloads).

### 2.4 Variáveis (Parte 0)
| Variável | Valor |
|---|---|
| `CLUBE_GOOGLE_CLIENT_ID` | Client ID do projeto `Tuzinho Clube Login` |
| `CLUBE_GOOGLE_CLIENT_SECRET` | Client Secret dele |

Sem essas duas, o servidor usa o par `YOUTUBE_CLIENT_ID/SECRET` (funciona, mas misturaria os projetos). **Restart App.**
O bloco "Resgate com a conta Google" do Clube fica verde.

### 2.5 Verificação do Google: como ficaria
**O que acontece enquanto o app não está verificado (mas está "Em produção")**
- Quem entra vê a tela **"O Google não verificou este app"** e precisa clicar **Avançado → Acessar Tuzinho Academy (não seguro)**.
- O Google limita o app a **100 usuários** (contados desde o início, e **não zera**). Cada pessoa que autoriza conta, **inclusive quem não é membro**.
  Veja o contador em **Público (Audience) → "User cap"**.
- Funciona de verdade: o token não vence em 7 dias (isso é só do modo "Em teste").

**Plano para entrar no ar já e verificar em paralelo**
1. **Hoje:** faça as Partes 1 a 3. Publique o app público ("Em produção", sem verificação) e **mande o link `https://dash.tuzinho.academy/discord` só para os membros**
   (post na comunidade do canal, mensagem de boas-vindas), para os 100 lugares não serem gastos por curiosos. Avise na mensagem que o Google mostra um aviso
   e como passar por ele ("Avançado → Acessar..."): isso é esperado até a verificação sair.
2. **No mesmo dia, peça a verificação.** Tenha pronto:
   1. **Domínio verificado:** `tuzinho.academy` confirmado no **Google Search Console** (Google Search Console → Adicionar propriedade → Domínio → registro DNS TXT).
   2. **Página de política de privacidade pública** em `tuzinho.academy` (por exemplo `https://tuzinho.academy/privacidade`). Precisa dizer: quais dados lemos (o ID do **seu** canal do YouTube,
      só para confirmar que você é membro), que **não guardamos o token do Google**, que não compartilhamos, como pedir exclusão (e-mail de contato), e citar
      que o app usa **YouTube API Services** e linkar os **Termos de Serviço do YouTube** (https://www.youtube.com/t/terms) e a **Política de Privacidade do Google** (https://policies.google.com/privacy).
   3. **Página inicial do app** acessível, com o nome do app e uma explicação do que ele faz.
   4. **Vídeo de demonstração** (YouTube, "não listado"), curto (1 a 3 min), mostrando: a página `/discord`, o clique em "Entrar com o Google", **a tela de consentimento inteira** (com o endereço do navegador visível, que mostra o ID do cliente),
      o resultado (entrou no Discord com o cargo) e uma frase dizendo para que o escopo é usado.
   5. **Justificativa do escopo** (cole em inglês, os revisores leem em inglês):
      > Tuzinho Academy offers a paid channel membership on YouTube and a private community on Discord. We use the `youtube.readonly` scope only to call `channels.list?mine=true` and read the **ID of the signed-in user's own YouTube channel**. We compare that ID with the list of active members of our channel to confirm the person is a paying member and then grant their role on our Discord server. We do not read videos, playlists, subscriptions, comments or any other data, we do not store the Google access token (it is used once and discarded), we do not share data with third parties, and users can ask for deletion at the contact e-mail in our privacy policy.
   6. Em **Google Auth Platform → Centro de verificação (Verification Center) → Enviar para verificação.** As respostas do Google chegam por e-mail ao contato cadastrado: **responda rápido** (cada ida e volta costuma levar de 1 a 3 dias úteis).
3. **Prazo:** para escopo sensível (sem avaliação de segurança de terceiros) costuma levar **de alguns dias a algumas semanas**, dependendo de quantas rodadas de ajuste o Google pedir. Não dá para garantir uma data.
4. **Depois de verificado:** some o aviso e o limite de 100. Nada muda no código.

**Plano B enquanto isso (me peça, leva cerca de 1 hora):** um segundo botão na página, "Já conectei o YouTube no Discord", que entra pelo **Discord** (escopo `connections`) e
lê a conexão do YouTube que a pessoa já tem lá, sem passar pelo Google. Serve para quem não quer passar pelo aviso, e para quando os 100 lugares acabarem. A limitação: a pessoa precisa ter
conectado o YouTube no Discord antes (Configurações → Conexões).

**Plano C (sempre disponível):** a equipe dá o cargo à mão no Discord para quem tiver dificuldade.

---

## Parte 3: Discord

### 3.1 Criar o app
1. Abra <https://discord.com/developers/applications> (logado na conta dona do servidor) → **New Application** → nome `Tuzinho Academy Clube` → aceite os termos → **Create**.
2. Em **General Information**, copie o **Application ID**: é o `DISCORD_CLIENT_ID`.

### 3.2 Segredo e endereço de retorno (OAuth2)
1. Menu **OAuth2** → em **Client Secret** clique **Reset Secret** → confirme → copie (aparece **uma vez**): é o `DISCORD_CLIENT_SECRET`.
2. Em **Redirects** → **Add Redirect** → `https://dash.tuzinho.academy/api/clube/resgate/discord/callback` → **Save Changes**.
   (Idêntico ao que o Clube mostra no cartão "Endereços para cadastrar".)

### 3.3 Criar o bot
1. Menu **Bot** → **Reset Token** → confirme → copie (aparece **uma vez**): é o `DISCORD_BOT_TOKEN`.
2. Em **Privileged Gateway Intents**, deixe os três **desligados** (não precisamos de nenhum).
3. Desmarque **Public Bot** (assim só você consegue convidar o bot) e deixe **Requires OAuth2 Code Grant** **desligado**.

### 3.4 Convidar o bot para o servidor
1. Menu **OAuth2 → URL Generator**.
2. Em **Scopes** marque só **`bot`**.
3. Em **Bot Permissions** marque **Manage Roles** (Gerenciar cargos) e **Create Instant Invite** (Criar convite instantâneo). Nada mais.
4. Copie a **Generated URL** no fim da página, abra no navegador, escolha o seu servidor e **Authorize**. (Você precisa ter a permissão "Gerenciar servidor" nele.)

### 3.5 Criar os cargos e ajustar a hierarquia (a parte que mais dá erro)
No Discord (app ou site), no seu servidor: **Configurações do servidor → Cargos**.
1. **Criar cargo** `Membro YouTube`. **Criar cargo** `Membro Essentials`. (Cores e permissões como preferir; o resgate só dá o cargo, não mexe em permissões.)
2. O bot ganhou um cargo próprio com o mesmo nome do app (`Tuzinho Academy Clube`). **Arraste esse cargo para CIMA** de `Membro YouTube` e `Membro Essentials` na lista.
   O Discord só deixa um bot dar cargos que estejam **abaixo** do cargo mais alto dele. Se ficar abaixo, o resgate falha com "Missing Permissions" (código 50013).
3. Deixe os canais da comunidade visíveis **só** para esses dois cargos (nas permissões do canal ou categoria: **@everyone** sem "Ver canal"; cada cargo de membro com "Ver canal").

### 3.6 Pegar os IDs
1. **Configurações do Discord (sua conta) → Avançado → Modo desenvolvedor: ligado.**
2. Clique com o botão direito no **ícone do servidor** → **Copiar ID do servidor**: é o `DISCORD_GUILD_ID`.
3. **Configurações do servidor → Cargos**, botão direito em `Membro YouTube` → **Copiar ID do cargo**: é o `DISCORD_ROLE_YOUTUBE`. Idem `Membro Essentials` → `DISCORD_ROLE_ESSENTIALS`.

### 3.7 Variáveis (Parte 0)
| Variável | Valor |
|---|---|
| `DISCORD_CLIENT_ID` | Application ID (3.1) |
| `DISCORD_CLIENT_SECRET` | Client Secret (3.2) |
| `DISCORD_BOT_TOKEN` | token do bot (3.3) |
| `DISCORD_GUILD_ID` | ID do servidor (3.6) |
| `DISCORD_ROLE_YOUTUBE` | ID do cargo `Membro YouTube` |
| `DISCORD_ROLE_ESSENTIALS` | ID do cargo `Membro Essentials` |

**Restart App.** O bloco "Discord" do Clube fica verde.

---

## Parte 4: teste de ponta a ponta

Faça com **você mesmo**, em janela anônima, antes de divulgar.

**Essentials**
1. Confirme que o seu e-mail tem um acesso ativo em **Acessos** (curso Essentials) e que ele aparece na tela **Clube** (clique **Sincronizar agora**).
2. Abra `https://dash.tuzinho.academy/discord` → "Sou aluno da Essentials" → digite o e-mail → "Receber o link no e-mail".
3. Abra o e-mail (olhe o spam) → **Continuar** → **Entrar no Discord** → autorize.
4. Resultado: aparece "Pronto!", você está no servidor com o cargo `Membro Essentials`, e no Clube o membro aparece como **no Discord**.

**YouTube**
1. Entre em `/discord` → **Entrar com o Google** com uma conta que seja **membro do canal** (se o app ainda não está verificado, esta conta precisa passar pelo aviso).
2. Autorize o Discord. Resultado: cargo `Membro YouTube`.
3. Teste também com uma conta Google **que não é membro**: a página deve dizer que não encontrou assinatura ativa.

**Saída do clube**
1. Bloqueie o acesso de teste em **Acessos** (ou use alguém que deixou de ser membro) → **Clube → Sincronizar agora**.
2. Resultado: o membro vira "Saiu" e o cargo some no Discord (o cartão "Discord (cargos)" mostra `1 cargo(s) removido(s)`).

---

## Problemas comuns

| Sintoma | Causa | O que fazer |
|---|---|---|
| Clube mostra `Google recusou o token dos membros (invalid_grant)` | O refresh token venceu ou foi gerado com outro cliente/escopo | App do Google em **Em produção** (Parte 1.2) e gere o token de novo (1.4), com o **mesmo** Client ID/Secret das variáveis |
| `YouTube recusou a lista de membros (...insufficient...)` ou `forbidden` | Token sem o escopo de membros, ou o canal não tem membros ativados | Refaça o 1.4 com os **dois** escopos; confirme no YouTube Studio que as assinaturas do canal estão ativas |
| `redirect_uri_mismatch` ao entrar com o Google | O endereço de retorno não está cadastrado exatamente igual | Credenciais → cliente → URIs de redirecionamento: copie do cartão do Clube, sem espaço nem barra no final. Pode levar alguns minutos para valer |
| Página mostra "Você cancelou" | A pessoa clicou em Cancelar/Negar | Tente de novo |
| Página mostra "Não encontramos uma assinatura ativa" | Não é membro agora, ou entrou há pouco (a lista atualiza a cada 6 h) | Aguarde a próxima sincronização, ou clique **Sincronizar agora** no Clube |
| Discord: `Missing Permissions` / "O cargo do bot está acima dele?" | O cargo do bot está abaixo dos cargos de membro | Parte 3.5, passo 2 |
| Discord recusa o login: `invalid redirect_uri` | O retorno não está cadastrado no app do Discord | Parte 3.2, passo 2 |
| O e-mail do resgate não chega | Brevo sem chave/remetente, ou caiu no spam | Confira `BREVO_API_KEY` e `BREVO_REMETENTE_EMAIL` (o bloco "Resgate por e-mail" do Clube); olhe o spam |
| Variável colocada mas o Clube continua mostrando que falta | Não reiniciou | Plesk → Node.js → **Restart App** |
