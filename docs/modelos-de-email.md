# Modelos de e-mail do sistema (em texto)

Todos os e-mails que o dash envia ao aluno/lead, só com o texto (sem o visual). Variáveis entre `{{ }}`: `nome` (primeiro nome), `curso` (ex.: Essentials), `email`, `linkSenha` e `validade` (boas-vindas novo) e `documento` (só no e-mail antigo, onde o CPF era a senha).

Onde moram no código:
- Boas-vindas: `server/acesso/templates/boas-vindas-link.html` (liberação pela API V2: link para a pessoa criar a própria senha). O `boas-vindas.html` antigo (CPF como senha) só é usado quando a API V2 não está configurada, nos produtos sem liberação na plataforma (mentoria particular, workshop) e no "acesso manual".
- Carrinho imediato: `server/acesso/templates/abandono.html` (assuntos em `server/acesso/motor.js`)
- Sequências: `server/emails/conteudo.js` (prévia gerada em `docs/emails-sequencias.md`)

Regras da fila das sequências: teto de 180 por dia (de 300 da Brevo), só entre 8h e 21h (São Paulo), Pix/boleto saem antes de conversão/onboarding, quem comprou deixa de receber os e-mails de carrinho e de pagamento.

---

## 1. Boas-vindas (compra aprovada)

Sai assim que o acesso é liberado.

- **Assunto:** 🎨 Tudo certo! Você agora é um aluno da Tuzinho Academy
- **Pré-visualização:** Seu acesso à Tuzinho Academy está liberado. Falta só criar a sua senha.
- **Etiqueta:** ✓ Acesso liberado
- **Título:** Bem-vindo, {{nome}}!
- **Texto:** Parabéns pela inscrição! Sua vaga está confirmada e seu acesso já está funcionando. Falta só um passo: criar a sua senha, pelo botão abaixo.
- **Seu e-mail de acesso:** {{email}}
- **Sua senha:** Você mesmo(a) cria, no botão abaixo.
  - O link vale por {{validade}} e só funciona uma vez. Se ele expirar, use "Esqueci minha senha" na tela de entrada da plataforma.
- **Botão:** Criar minha senha → ({{linkSenha}}, gerado na hora pela API V2 da plataforma)
  - Logo abaixo: Já criou a senha? Entrar na plataforma (https://tuzinho.academy/login)
- **Seus 3 primeiros passos:**
  1. **Crie sua senha** pelo botão acima e entre na plataforma.
  2. **Complete o seu perfil** para personalizar a experiência.
  3. **Comece pelo Módulo 1** e vá no seu ritmo.
- **Não perca nenhuma aula:** Adicione o remetente **Tuzinho Academy** aos seus contatos e marque este e-mail como importante. Assim, nada cai no spam.
  - Em breve nossos e-mails passarão a ser enviados por **comunicacao@tuzinho.academy**. Quando isso acontecer, adicione esse endereço também.
- **Rodapé:** Dúvidas? Fale com a gente: tutatoo05@gmail.com · © 2023 - 2026 Tuzinho Academy

---

## 2. Carrinho abandonado: e-mail imediato

Sai na hora em que o carrinho é abandonado (só para os cursos com e-mail de apoio).

- **Assunto:** {{curso}} está te esperando 🚀
- **Pré-visualização:** {{nome}}, você esqueceu o {{curso}} no carrinho. Finalize agora e garanta seu acesso.
- **Etiqueta:** Carrinho reservado
- **Título:** Ei, {{nome}}… você esqueceu algo importante
- **Subtítulo:** Seu acesso ao curso ainda está aguardando. Finalize agora e continue sua evolução na tattoo.
- **Texto:**
  - Olá, {{nome}} 👋
  - Notamos que você começou a compra do {{curso}}, mas não concluiu. Sem problema — ainda dá tempo de garantir sua vaga.
- **Caixa do curso:** Curso no carrinho: {{curso}} · Origem: Tuzinho Academy · Status: Aguardando pagamento
- **Por que finalizar agora:**
  - ✓ Acesso imediato após a confirmação do pagamento
  - ✓ Conteúdo prático para aplicar no estúdio
  - ✓ Sua vaga ainda está reservada por tempo limitado
- **Botão:** Finalizar minha compra → (checkout Hotmart)
- **Observação:** Se o botão não funcionar, copie e cole este link no navegador: Finalizar compra
- **Ajuda:** Teve algum problema no pagamento? Fale com o Suporte.
- **Rodapé:** Tuzinho Academy · Formação prática para tatuadores que querem evoluir com segurança. · Você recebeu este e-mail porque iniciou uma compra em tuzinho.academy.

---

## 3. Sequências automáticas

Estrutura comum de todos: etiqueta no topo, título, 2 parágrafos, botão e, no rodapé do cartão, "Precisa de ajuda? Fale com o suporte". Rodapé: "Você recebeu este e-mail por causa de uma compra ou cadastro em tuzinho.academy. Para não receber mais mensagens como esta, fale com o suporte."

### 3.1 Carrinho abandonado (depois do e-mail imediato)

#### carrinho_24h — 1 dia depois do abandono
- **Assunto:** {{nome}}, ficou alguma dúvida sobre a Tuzinho Academy?
- **Etiqueta:** Sua compra ficou pela metade
- **Título:** {{nome}}, posso te ajudar a terminar?
- **Texto:**
  - Você começou a compra do {{curso}} e não concluiu. Acontece: às vezes é o pagamento, às vezes bate uma dúvida na hora.
  - Se o que travou foi a forma de pagamento, dá para escolher outra na própria página (Pix, cartão ou boleto parcelado, conforme a oferta). Se foi dúvida sobre o conteúdo, nosso suporte responde.
- **Botão:** Voltar para minha compra

#### carrinho_72h — 3 dias depois do abandono
- **Assunto:** Seu {{curso}} ainda está esperando por você
- **Etiqueta:** Última mensagem sobre isso
- **Título:** {{nome}}, é a última vez que te lembro
- **Texto:**
  - Não quero encher sua caixa de entrada: este é o último e-mail sobre o {{curso}}.
  - Se ainda faz sentido para você, o link abaixo leva direto à compra. Se não, tudo bem, e você não vai receber mais lembretes sobre isso.
- **Botão:** Ir para o checkout

### 3.2 Pix/boleto gerado e pagamento expirado

#### pix_90min — 1h30 depois de gerar o Pix
- **Assunto:** Seu Pix do {{curso}} está esperando pagamento
- **Etiqueta:** Pix gerado
- **Título:** {{nome}}, seu Pix ainda não foi pago
- **Texto:**
  - Você gerou o Pix do {{curso}}, mas o pagamento ainda não apareceu para nós. Pix tem prazo para expirar, então vale pagar logo.
  - Assim que o pagamento é confirmado, seu acesso é liberado automaticamente e você recebe um e-mail com o login.
- **Pix copia e cola:** código do Pix (quando disponível)
- **Botão:** Abrir meu pagamento

#### pix_18h — 18h depois de gerar o Pix
- **Assunto:** Seu Pix do {{curso}} pode expirar em breve
- **Etiqueta:** Pix em aberto
- **Título:** {{nome}}, não deixe seu Pix expirar
- **Texto:**
  - O Pix do {{curso}} continua em aberto e pode expirar em breve. Se expirar, é só gerar outro na página de compra, sem perder nada.
  - Teve algum problema para pagar? É só falar com o suporte.
- **Pix copia e cola:** código do Pix (quando disponível)
- **Botão:** Pagar agora

#### boleto_24h — 1 dia depois de gerar o boleto
- **Assunto:** Seu boleto do {{curso}} ainda não foi pago
- **Etiqueta:** Boleto gerado
- **Título:** {{nome}}, falta pagar o seu boleto
- **Texto:**
  - Você gerou o boleto do {{curso}}, mas o pagamento ainda não foi identificado. Boleto pode levar até 2 dias úteis para compensar depois de pago, então, se você já pagou, é só aguardar.
  - Se ainda não pagou, o botão abaixo abre o boleto de novo.
- **Botão:** Abrir meu boleto

#### boleto_72h — 3 dias depois de gerar o boleto
- **Assunto:** Precisa de ajuda com o boleto do {{curso}}?
- **Etiqueta:** Boleto em aberto
- **Título:** {{nome}}, seu boleto segue em aberto
- **Texto:**
  - O boleto do {{curso}} continua sem pagamento. Se venceu ou se você prefere outra forma de pagar, dá para fazer uma nova compra pela página e escolher Pix ou cartão.
  - Qualquer dúvida, fale com o suporte.
- **Botão:** Fazer uma nova compra

#### expirou_1h — 1h depois de o pagamento expirar
- **Assunto:** Seu pagamento do {{curso}} expirou
- **Etiqueta:** Pagamento expirado
- **Título:** {{nome}}, seu pagamento expirou
- **Texto:**
  - O prazo do seu pagamento do {{curso}} acabou e a compra não foi concluída.
  - Sem problema: é só gerar um novo na página de compra, e dá para escolher outra forma de pagamento.
- **Botão:** Gerar novo pagamento

### 3.3 Onboarding (depois da compra aprovada)

#### onboarding_d1 — 1 dia depois da liberação do acesso
- **Assunto:** {{nome}}, por onde começar na Tuzinho Academy
- **Etiqueta:** Seu primeiro passo
- **Título:** {{nome}}, vamos começar?
- **Texto:**
  - Seu acesso ao {{curso}} já está liberado. O melhor jeito de aproveitar é separar um tempo hoje para assistir à primeira aula e anotar o que você já quer aplicar no estúdio.
  - Para entrar, crie a sua senha pelo link do e-mail de boas-vindas. Se o link expirou ou você não encontrar o e-mail, use "Esqueci minha senha" na página de login.
- **Botão:** Entrar na plataforma

#### onboarding_d3 — 3 dias depois da liberação do acesso
- **Assunto:** {{nome}}, você já assistiu à primeira aula?
- **Etiqueta:** Seu acesso está ativo
- **Título:** {{nome}}, como está indo?
- **Texto:**
  - Faz 3 dias que o {{curso}} está liberado para você. Quem assiste às primeiras aulas logo na primeira semana costuma ter muito mais resultado depois.
  - Se tiver qualquer dificuldade para entrar ou para achar o conteúdo, o suporte resolve rápido.
- **Botão:** Continuar de onde parei

#### onboarding_d7 — 7 dias depois da liberação do acesso
- **Assunto:** {{nome}}, uma semana de Tuzinho Academy
- **Etiqueta:** Uma semana juntos
- **Título:** {{nome}}, tudo certo por aí?
- **Texto:**
  - Já se passou uma semana desde que você entrou no {{curso}}. Se alguma coisa travou, seja o acesso, uma aula ou uma dúvida, fale com a gente antes de decidir qualquer coisa: a maioria dos problemas se resolve em minutos.
  - E se está tudo indo bem, continue no seu ritmo. Estamos torcendo por você.
- **Botão:** Falar com o suporte

---

## 4. Outros e-mails

- **Resumo diário (administradores):** assunto `Resumo Academy Labs · DD/MM`. O corpo é o boletim com os números de ontem, montado na hora (sem texto fixo), e o n8n é quem envia.
- **Teste da Brevo (interno):** assunto "Teste da liberação de acesso — Tuzinho Academy", corpo "Se você recebeu este e-mail, a Brevo está enviando certo. ✅". Só dispara no teste de verificação.
