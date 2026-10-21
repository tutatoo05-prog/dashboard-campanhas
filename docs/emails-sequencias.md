# E-mails de sequência: textos para revisão

Gerado por `node server/scripts/previaEmails.js`. Os textos moram em `server/emails/conteudo.js`; edite lá (ou me diga o que mudar).

Prévia visual: abra os arquivos de `preview-email/sequencias/` no navegador.

Regras da fila: teto de 180 por dia (de 300 da Brevo), só entre 8h e 21h (São Paulo), Pix/boleto saem antes de conversão/onboarding, quem comprou deixa de receber os e-mails de carrinho e de pagamento.

## Carrinho abandonado (depois do e-mail imediato que já existe)

### carrinho_24h — sai 1 dia(s) depois do evento de carrinho abandonado
- **Assunto:** Ana, ficou alguma dúvida sobre a Tuzinho Academy?
- **Título:** Ana, posso te ajudar a terminar?
- **Texto:**
  - Você começou a compra do Essentials e não concluiu. Acontece: às vezes é o pagamento, às vezes bate uma dúvida na hora.
  - Se o que travou foi a forma de pagamento, dá para escolher outra na própria página (Pix, cartão ou boleto parcelado, conforme a oferta). Se foi dúvida sobre o conteúdo, nosso suporte responde.
- **Botão:** Voltar para minha compra

### carrinho_72h — sai 3 dia(s) depois do evento de carrinho abandonado
- **Assunto:** Seu Essentials ainda está esperando por você
- **Título:** Ana, é a última vez que te lembro
- **Texto:**
  - Não quero encher sua caixa de entrada: este é o último e-mail sobre o Essentials.
  - Se ainda faz sentido para você, o link abaixo leva direto à compra. Se não, tudo bem, e você não vai receber mais lembretes sobre isso.
- **Botão:** Ir para o checkout

## Pix/boleto gerado e pagamento expirado

### pix_90min — sai 1.5 h depois do evento (Pix/boleto gerado ou expirado)
- **Assunto:** Seu Pix do Essentials está esperando pagamento
- **Título:** Ana, seu Pix ainda não foi pago
- **Texto:**
  - Você gerou o Pix do Essentials, mas o pagamento ainda não apareceu para nós. Pix tem prazo para expirar, então vale pagar logo.
  - Assim que o pagamento é confirmado, seu acesso é liberado automaticamente e você recebe um e-mail com o login.
- **Botão:** Abrir meu pagamento

### pix_18h — sai 18 h depois do evento (Pix/boleto gerado ou expirado)
- **Assunto:** Seu Pix do Essentials pode expirar em breve
- **Título:** Ana, não deixe seu Pix expirar
- **Texto:**
  - O Pix do Essentials continua em aberto e pode expirar em breve. Se expirar, é só gerar outro na página de compra, sem perder nada.
  - Teve algum problema para pagar? É só falar com o suporte.
- **Botão:** Pagar agora

### boleto_24h — sai 1 dia(s) depois do evento (Pix/boleto gerado ou expirado)
- **Assunto:** Seu boleto do Essentials ainda não foi pago
- **Título:** Ana, falta pagar o seu boleto
- **Texto:**
  - Você gerou o boleto do Essentials, mas o pagamento ainda não foi identificado. Boleto pode levar até 2 dias úteis para compensar depois de pago, então, se você já pagou, é só aguardar.
  - Se ainda não pagou, o botão abaixo abre o boleto de novo.
- **Botão:** Abrir meu boleto

### boleto_72h — sai 3 dia(s) depois do evento (Pix/boleto gerado ou expirado)
- **Assunto:** Precisa de ajuda com o boleto do Essentials?
- **Título:** Ana, seu boleto segue em aberto
- **Texto:**
  - O boleto do Essentials continua sem pagamento. Se venceu ou se você prefere outra forma de pagar, dá para fazer uma nova compra pela página e escolher Pix ou cartão.
  - Qualquer dúvida, fale com o suporte.
- **Botão:** Fazer uma nova compra

### expirou_1h — sai 1 h depois do evento (Pix/boleto gerado ou expirado)
- **Assunto:** Seu pagamento do Essentials expirou
- **Título:** Ana, seu pagamento expirou
- **Texto:**
  - O prazo do seu pagamento do Essentials acabou e a compra não foi concluída.
  - Sem problema: é só gerar um novo na página de compra, e dá para escolher outra forma de pagamento.
- **Botão:** Gerar novo pagamento

## Onboarding (depois da compra aprovada)

### onboarding_d1 — sai 1 dia(s) depois da liberação do acesso
- **Assunto:** Ana, por onde começar na Tuzinho Academy
- **Título:** Ana, vamos começar?
- **Texto:**
  - Seu acesso ao Essentials já está liberado. O melhor jeito de aproveitar é separar um tempo hoje para assistir à primeira aula e anotar o que você já quer aplicar no estúdio.
  - Para entrar, use o login e a senha do e-mail de boas-vindas. Se não encontrar o e-mail, use "Esqueci minha senha" na página de login.
- **Botão:** Entrar na plataforma

### onboarding_d3 — sai 3 dia(s) depois da liberação do acesso
- **Assunto:** Ana, você já assistiu à primeira aula?
- **Título:** Ana, como está indo?
- **Texto:**
  - Faz 3 dias que o Essentials está liberado para você. Quem assiste às primeiras aulas logo na primeira semana costuma ter muito mais resultado depois.
  - Se tiver qualquer dificuldade para entrar ou para achar o conteúdo, o suporte resolve rápido.
- **Botão:** Continuar de onde parei

### onboarding_d7 — sai 7 dia(s) depois da liberação do acesso
- **Assunto:** Ana, uma semana de Tuzinho Academy
- **Título:** Ana, tudo certo por aí?
- **Texto:**
  - Já se passou uma semana desde que você entrou no Essentials. Se alguma coisa travou, seja o acesso, uma aula ou uma dúvida, fale com a gente antes de decidir qualquer coisa: a maioria dos problemas se resolve em minutos.
  - E se está tudo indo bem, continue no seu ritmo. Estamos torcendo por você.
- **Botão:** Falar com o suporte
