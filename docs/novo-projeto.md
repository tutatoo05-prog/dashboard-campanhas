# Integrar um novo site ou formulário ao dash

Guia passo a passo para ligar **qualquer formulário novo** (um workshop, uma landing page, um produto) ao dash, de forma que:

- o cadastro chegue **direto no banco**, sem planilha e sem automação intermediária;
- ele apareça na tela **Registros**, no grupo e no projeto certos, já separado dos demais;
- o site entre no **Monitoramento** (no ar, rápido, formulário gravando);
- repetidos, UTMs e campanha sejam tratados automaticamente.

> **Tempo estimado:** 15 a 30 minutos, a maior parte no formulário em si.
> **Referências:** [API de captura](./api.md) · [Banco de dados](./banco-de-dados.md) · [README](../README.md)

---

## Sumário

1. [Escolher o slug](#1-escolher-o-slug)
2. [Cadastrar o projeto no catálogo](#2-cadastrar-o-projeto-no-catálogo)
3. [Liberar o domínio do site](#3-liberar-o-domínio-do-site)
4. [Montar o formulário](#4-montar-o-formulário)
5. [Testar](#5-testar)
6. [Ver no dash](#6-ver-no-dash)
7. [Colocar o site no Monitoramento](#7-colocar-o-site-no-monitoramento)
8. [Publicar](#8-publicar)
9. [Checklist final](#checklist-final)
10. [Problemas comuns](#problemas-comuns)
11. [Perguntas frequentes](#perguntas-frequentes)

---

## Como funciona (em 30 segundos)

```
 Seu formulário ── POST https://dash.tuzinho.academy/api/captura ──▶ dash ──▶ banco
   envia { slug, nome, telefone, e-mail, UTMs ... }                            │
                                                                               ▼
                                         Registros: Tipo (Workshops) · Projeto (Irezumi)
```

O que separa um projeto do outro é o **slug**: um texto curto que a página manda junto com o cadastro (por exemplo `workirezumi`). O dash usa o slug para decidir o **tipo** (Essentials, Workshops, Mentoria…) e o **projeto** dentro dele.

---

## 1. Escolher o slug

O slug identifica a página (ou a edição) no dash. Regras:

- minúsculas, sem espaço nem acento; use `-` ou números (`workgrafismo3`, `essentials-vip`);
- **comece pelo prefixo do tipo**, porque é ele que define o grupo na tela:

| Se o projeto for... | Slug começa com | Exemplo | Aparece em |
|---|---|---|---|
| Workshop / aula gratuita | `work` | `workgrafismo3` | **Workshops** · *Grafismo 3* |
| Essentials (curso) | `essentials` | `essentials-vip` | **Essentials** |
| Mentoria | `mentoria` | `mentoria-grupo` | **Mentoria particular** |
| Outro | qualquer | `parceria-x` | **Outros** |

- **todos os workshops ficam no mesmo tipo** e se separam só pelo slug — uma edição nova de workshop é um slug novo (`workirezumi2`), não um tipo novo;
- **não reutilize** o slug de outro projeto, senão os cadastros se misturam e a regra de "uma pessoa por projeto" passa a valer entre os dois;
- **uma vez em uso, não mude** o slug: os cadastros antigos ficam no nome antigo.

---

## 2. Cadastrar o projeto no catálogo

> **Este passo é opcional para funcionar** (slug fora do catálogo é classificado pelo prefixo) **mas recomendado**, porque dá um nome bonito ao projeto na tela e fixa a origem gravada.

Edite [`server/projetos/catalogo.js`](../server/projetos/catalogo.js) e acrescente uma linha em `PROJETOS`:

```js
{
  slug: 'workgrafismo3',          // o mesmo texto que o formulário envia
  tipo: 'workshop',                // essentials | workshop | mentoria | outros
  vertente: '',                    // só no Essentials: 'live' ou 'membros'
  nome: 'Grafismo 3',              // como aparece na tela Registros
  origem: 'workshop_grafismo_3',   // gravado em leads.origem — escolha uma vez e não mude
  aliases: [],                     // outros nomes que a página já usou (opcional)
},
```

| Campo | Para que serve |
|---|---|
| `slug` | Identificador que o formulário envia. |
| `tipo` | Grupo da tela Registros (Essentials, Workshops, Mentoria particular, Outros). |
| `vertente` | Subdivisão do Essentials (`live` ou `membros`). Deixe vazio nos demais. |
| `nome` | Nome do projeto dentro do grupo. |
| `origem` | Valor da coluna `origem`. A tela **Leads** e os relatórios usam este nome; por isso ele não pode mudar depois. |
| `aliases` | Nomes antigos que também devem cair neste projeto. |

**Opcional — nome amigável na tela Leads.** A tela **Leads** (diferente de Registros) mostra a `origem` crua se não houver rótulo. Para um nome bonito, acrescente em [`src/lib/leadOrigins.ts`](../src/lib/leadOrigins.ts):

```ts
workshop_grafismo_3: 'Workshop Grafismo 3',
```

Rode os testes e confira que nada quebrou:

```bash
npm test
```

---

## 3. Liberar o domínio do site

A API só aceita cadastros vindos de sites autorizados (CORS). Já estão liberados `tuzinho.academy` e `tuzinho.app` (com e sem `www`).

Se o novo site usa **outro domínio**, no Plesk vá em **Node.js → Custom environment variables** e defina (ou complete) `CAPTURA_ORIGENS`, separando por vírgula, com `https://` e **sem barra no final**:

```
CAPTURA_ORIGENS=https://novo-site.com.br,https://www.novo-site.com.br
```

Depois clique em **Restart App**. Sem isso, o navegador bloqueia o envio e o formulário mostra erro.

---

## 4. Montar o formulário

### 4.1 Campos do formulário

Mínimo para funcionar:

| Campo | Obrigatório | Observação |
|---|---|---|
| `nome` | Sim | Pelo menos 2 caracteres. |
| `telefone` | Sim | 10 a 15 dígitos. Use um seletor internacional se houver público fora do Brasil. |
| `email` | Recomendado | Se preenchido, precisa ser válido. |
| `slug` | Sim | O do passo 1. |

Além disso, inclua um **campo-isca** invisível (`website`) contra robôs, e envie os **UTMs** (campanha, anúncio) para saber de onde cada pessoa veio.

### 4.2 HTML

```html
<form id="cadastro" novalidate>
  <label>Seu nome
    <input type="text" name="nome" autocomplete="name" required />
  </label>

  <label>Seu melhor e-mail
    <input type="email" name="email" autocomplete="email" required />
  </label>

  <label>Seu WhatsApp
    <input type="tel" name="telefone" autocomplete="tel" inputmode="tel" required />
  </label>

  <!-- Campo-isca: humanos não veem. Se vier preenchido, é robô. -->
  <input type="text" name="website" tabindex="-1" autocomplete="off"
         style="position:absolute;left:-9999px;opacity:0" aria-hidden="true" />

  <button type="submit">Garantir minha vaga</button>
  <p id="erro" hidden>Não conseguimos enviar agora. Tenta de novo em alguns segundos?</p>
</form>
```

### 4.3 JavaScript

Cole este script na página (ajuste `SLUG`). Ele guarda os UTMs da primeira visita (assim a campanha não se perde se a pessoa navegar antes de se cadastrar), envia o cadastro e trata as respostas.

```html
<script>
  const SLUG = 'workgrafismo3'
  const API = 'https://dash.tuzinho.academy/api/captura'
  const CHAVES_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id', 'fbclid', 'gclid']

  // 1) Guarda os UTMs da primeira visita por 30 dias.
  function utmsDaVisita() {
    const doLink = Object.fromEntries(new URLSearchParams(location.search))
    let salvos = {}
    try { salvos = JSON.parse(localStorage.getItem('utm_salvo') || '{}') } catch {}
    const agora = Date.now()
    if (salvos.em && agora - salvos.em > 30 * 864e5) salvos = {}
    if (CHAVES_UTM.some((k) => doLink[k])) {
      salvos = { em: agora, ...Object.fromEntries(CHAVES_UTM.map((k) => [k, doLink[k] || ''])) }
      try { localStorage.setItem('utm_salvo', JSON.stringify(salvos)) } catch {}
    }
    return Object.fromEntries(CHAVES_UTM.map((k) => [k, doLink[k] || salvos[k] || '']))
  }
  utmsDaVisita() // chama já na entrada para guardar

  // 2) Envia o cadastro.
  document.getElementById('cadastro').addEventListener('submit', async (evento) => {
    evento.preventDefault()
    const form = evento.target
    const botao = form.querySelector('button[type="submit"]')
    const erro = document.getElementById('erro')
    erro.hidden = true
    botao.disabled = true

    const corpo = {
      slug: SLUG,
      nome: form.nome.value.trim(),
      email: form.email.value.trim(),
      telefone: form.telefone.value,
      website: form.website.value, // campo-isca
      landing_url: location.href,
      ...utmsDaVisita(),
    }

    try {
      const resposta = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(12000),
      })
      const dados = await resposta.json().catch(() => ({}))

      if (resposta.status === 400) { // dado inválido: mostre a mensagem da API
        erro.textContent = dados.message || 'Confira os dados e tente de novo.'
        erro.hidden = false
        return
      }
      if (!resposta.ok) throw new Error('falha ' + resposta.status)

      // Sucesso. dados.duplicate === true quando a pessoa já estava inscrita.
      mostrarSucesso({ jaInscrito: dados.duplicate === true })
      form.reset()
    } catch {
      erro.hidden = false // mantém os dados preenchidos para tentar de novo
    } finally {
      botao.disabled = false
    }
  })

  function mostrarSucesso({ jaInscrito }) {
    // Troque por o seu modal/redirecionamento (ex.: obrigado, grupo do WhatsApp).
    alert(jaInscrito ? 'Você já está inscrito!' : 'Inscrição confirmada!')
  }
</script>
```

**Boas práticas**

- **Nunca apague os dados** do formulário quando der erro: a pessoa só precisa clicar de novo.
- Dispare o evento de conversão do pixel (Lead) **só depois** de a API responder sucesso e `duplicate` ser `false`, para não contar a mesma pessoa duas vezes.
- Não bloqueie o envio por causa do pixel ou de qualquer outro script: se o dash responder, o cadastro vale.
- Mostre o botão como "enviando…" e desabilitado durante a chamada, para evitar cliques duplicados (o dash também ignora repetidos, mas o limite é de 40 envios por IP em 10 minutos).

### 4.3.1 Perguntas extras (qualificação)

Quer perguntar mais coisas (Instagram, experiência, faturamento)? Basta mandar como campos simples no mesmo corpo. O dash guarda tudo em `respostas`:

```js
const corpo = {
  slug: 'mentoria-grupo',
  nome, email, telefone,
  instagram: '@maria',
  experiencia: '2 anos',
  qualificado: true,
  desqualificado_por: [],
}
```

### 4.4 Implementação de referência

O workshop do Irezumi segue exatamente este modelo, com seletor internacional de telefone, validação e o modal de sucesso: `PRODUÇÃO/work-gratuito/app/src/modules/form.js` (envio) e `tracking.js` (UTMs). Os produtos (Essentials e Mentoria) usam `PRODUÇÃO/produtos/shared/lib/lead.js`.

---

## 5. Testar

### 5.1 Teste direto na API

```bash
curl -i -X POST https://dash.tuzinho.academy/api/captura \
  -H "Origin: https://SEU-DOMINIO.com" \
  -H "Content-Type: application/json" \
  -d '{"slug":"workgrafismo3","nome":"ZZ Teste Integracao","email":"zz-teste@example.invalid","telefone":"5511900000001"}'
```

Resultado esperado: `HTTP/1.1 200` e `{"status":"ok","ok":true,"duplicate":false}`.

Rodando de novo o mesmo comando, deve voltar `"duplicate": true` (a pessoa já está no projeto).

Teste também os erros, para ver a mensagem que o formulário vai exibir:

```bash
# nome curto -> 400 "Informe o nome."
curl -s -X POST https://dash.tuzinho.academy/api/captura -H "Content-Type: application/json" \
  -d '{"slug":"workgrafismo3","nome":"x","telefone":"5511900000001"}'
```

### 5.2 Teste pelo site

1. Abra a página numa **janela anônima** (sem dados guardados).
2. Entre com um link com UTMs, por exemplo `?utm_source=ig&utm_medium=paid&utm_campaign=teste`.
3. Preencha com um e-mail e um telefone **novos** e envie.
4. Confira o resultado em [Ver no dash](#6-ver-no-dash).

> Use sempre nomes que comecem com **"ZZ Teste"** nos testes, para achar e apagar depois.

---

## 6. Ver no dash

### Tela Registros

Menu **Registros**. O cadastro aparece:

- no **grupo** do tipo (por exemplo **Workshops**) e no **projeto** com o nome do catálogo (**Grafismo 3**);
- com o selo verde **Novo** pelas primeiras 10 horas;
- com **Origem** (Meta Ads, Instagram, orgânico…) e **Campanha** lidas dos UTMs.

Na própria tela você pode:

- **filtrar** a lista por projeto, origem, campanha, situação (comprou, abandonou…), período ou só os novos;
- **buscar** por nome, e-mail, telefone ou campanha;
- abrir a **pessoa** para ver a linha do tempo, as compras e copiar contato;
- **exportar** a lista filtrada em CSV;
- **apagar** um registro (admin) — use para limpar os testes.

Como o projeto aparece depende do que você definiu:

| Você definiu | Resultado na tela |
|---|---|
| Projeto no catálogo | Grupo do tipo + nome do catálogo. |
| Só o slug (fora do catálogo) | Grupo pelo prefixo; nome gerado a partir do slug (`workgrafismo3` → *Workgrafismo3*). |
| Slug vazio | Grupo **Outros** · *Site*. |

### Tela Leads

Aparece também na tela **Leads** (lista geral), com a `origem` do projeto.

### Compras

Quando alguém compra pela Hotmart, a venda aparece em **Compras**. Compras cuja identificação (campanha/origem do checkout) contém `live` ou `membros` entram também no projeto **Essentials · Live** / **Essentials · Membros**.

---

## 7. Colocar o site no Monitoramento

Para o dash avisar quando o site cair (e mostrar quantos cadastros chegam), acrescente o projeto em [`server/monitor/projetos.js`](../server/monitor/projetos.js):

```js
{
  id: 'grafismo',                               // identificador único
  nome: 'Workshop Grafismo',                    // título do cartão
  descricao: 'Página de captura do workshop de grafismo',
  pasta: 'PRODUÇÃO/grafismo',
  captura: true,                                // mostra "formulário gravando normalmente / N erros"
  slugsDeLeads: ['workgrafismo3'],              // conta os cadastros destes slugs (24 h, 7 dias, último)
  alvos: [
    { nome: 'Página de captura', url: 'https://tuzinho.academy/grafismo/', contem: 'data-lead-form' },
    {
      nome: 'Cadastro (dash)',
      url: 'https://dash.tuzinho.academy/api/captura',
      metodo: 'OPTIONS',
      cabecalhos: { Origin: 'https://tuzinho.academy', 'Access-Control-Request-Method': 'POST' },
      esperaStatus: 204,
    },
  ],
},
```

**Campos de cada endereço (`alvos`)**

| Campo | Para que serve |
|---|---|
| `nome` | Rótulo na tela. |
| `url` | Endereço conferido a cada 5 minutos. |
| `contem` | Texto que **tem que aparecer** no HTML. Detecta página que abre, mas está quebrada (ex.: sem o formulário). Use algo que só existe na página funcionando, como um atributo do formulário. |
| `metodo`, `cabecalhos`, `esperaStatus` | Para conferir o preflight da API (resposta `204`) em vez de uma página. |

O monitor avisa no **Telegram** quando um endereço falha **duas vezes seguidas** e quando volta. Para isso, `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` precisam estar configurados no Plesk.

> Um site sem formulário (institucional) entra igual, com `captura` e `slugsDeLeads` vazios — veja `original-sp-tattoo`.

---

## 8. Publicar

Ordem recomendada:

1. **Dash primeiro.** Commit e push no repositório do dash (catálogo, monitoramento, rótulo). O deploy é automático e leva cerca de um minuto.
2. **Domínio liberado**, se for novo (passo 3) e **Restart App**.
3. **Depois o site.** Suba o formulário novo.
4. **Teste de ponta a ponta** em janela anônima (passo 5.2) e **apague** os registros "ZZ Teste" pela tela Registros.

> Se o site subir **antes** do dash, o cadastro funciona, mas cai sem o nome bonito e sem o projeto no monitoramento.

---

## Checklist final

- [ ] Slug escolhido com o prefixo certo (`work…`, `essentials…`, `mentoria…`)
- [ ] Projeto no [`catalogo.js`](../server/projetos/catalogo.js) (nome, origem, tipo)
- [ ] Rótulo em `leadOrigins.ts` (opcional, para a tela Leads)
- [ ] Domínio em `CAPTURA_ORIGENS` (se não for `tuzinho.academy` / `tuzinho.app`) e app reiniciado
- [ ] Formulário com `nome`, `telefone`, `email`, `slug`, campo-isca `website` e UTMs
- [ ] Erro não apaga os dados do formulário
- [ ] Pixel só dispara com sucesso e `duplicate: false`
- [ ] Teste na API (`200`, repetido `duplicate: true`, erro `400`)
- [ ] Teste no site em janela anônima com UTMs
- [ ] Cadastro apareceu em **Registros**, no grupo e projeto certos
- [ ] Site no [`monitor/projetos.js`](../server/monitor/projetos.js)
- [ ] Registros "ZZ Teste" apagados
- [ ] `npm test` passando e push feito

---

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| O formulário mostra erro e no console aparece **CORS** | O domínio do site não está liberado | Passo 3: `CAPTURA_ORIGENS` + Restart App. |
| `403 Origem não permitida` | Mesmo caso | Idem. |
| `400 Informe um WhatsApp válido.` | Telefone com menos de 10 dígitos (esqueceu o DDD) | Validar e orientar a pessoa no formulário. |
| `429 Muitas tentativas` | Mais de 40 envios do mesmo IP em 10 minutos (muitos testes seguidos) | Aguardar uns minutos. |
| `503 Não foi possível gravar agora.` | Falha no banco | Veja a tela **Monitoramento** (último erro) e os logs do Plesk. O formulário mantém os dados. |
| Enviou, deu sucesso, mas **não aparece** em Registros | O e-mail ou telefone já estavam naquele projeto (`duplicate: true`) | Teste com e-mail e telefone novos. |
| Aparece em **Outros · Site** | O `slug` não foi enviado | Confira o campo `slug` no corpo da requisição. |
| Aparece no grupo errado | Prefixo do slug diferente do esperado | Ajuste o slug ou cadastre o projeto no catálogo com o `tipo` certo. |
| A origem aparece como "Sem rastreamento" | Os UTMs não chegaram | Teste abrindo a página com `?utm_source=...`; confira se o script envia `utm_*`. |
| Teste pelo site não envia nada e vai direto para o checkout/obrigado | O navegador "lembra" de um cadastro anterior feito por script próprio (ex.: valor salvo no `localStorage`) | Limpe o armazenamento do navegador ou use uma janela anônima. |
| Abrir `/api/captura` no navegador mostra "Método não permitido" | Normal: o navegador faz `GET` e a API só aceita `POST` | Nada a corrigir. |

---

## Perguntas frequentes

**Preciso de conta ou chave de API?**
Não. A rota é pública; a proteção é o domínio liberado, o limite por IP, o campo-isca e a validação.

**Posso enviar de um servidor (sem navegador)?**
Pode. A checagem de origem só vale quando há cabeçalho `Origin` (navegadores sempre enviam). Chamadas de servidor sem `Origin` passam, mas continuam sujeitas ao limite por IP e à validação.

**A pessoa pode se cadastrar em dois projetos?**
Sim. A regra de repetido vale **por projeto**: o mesmo e-mail/telefone entra uma vez em cada slug.

**E se a mesma pessoa se cadastrar de novo com outro e-mail mas o mesmo telefone?**
É tratada como a mesma pessoa (repetida). O inverso também vale.

**Onde ficam as respostas extras do formulário?**
Na coluna `respostas` (JSON) da tabela `leads`. Hoje elas não aparecem na tela Registros; estão guardadas para consulta e uso futuro.

**Como separo Live e Membros do Essentials?**
Mandando `slug: "essentials-live"` / `"essentials-membros"`, ou `product: "essentials"` com `variante: "live"` / `"membros"` (formato dos formulários do Essentials).

**Preciso me preocupar com LGPD?**
Sim: o formulário deve ter o aviso de privacidade e o aceite de cookies/pixels da página. O dash não grava o aceite; ele só recebe o cadastro. Siga o padrão dos outros projetos (banner de consentimento antes de disparar pixels).

**Como apago um cadastro de teste?**
Em **Registros**, abra a pessoa e clique em **Apagar registro** (admin). Cadastros que entraram pela API são removidos do banco; cadastros que vieram de outras fontes ficam apenas ocultos.

**Quero mudar o slug de um projeto que já tem cadastros.**
Não mude. Se precisar mesmo, acrescente o slug antigo em `aliases` do catálogo para que os cadastros antigos e os novos caiam no mesmo projeto.
