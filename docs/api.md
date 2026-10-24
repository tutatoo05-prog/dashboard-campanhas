# API de Captura de Leads

Referência da API pública que recebe os cadastros dos formulários dos sites da Tuzinho Academy e os grava no banco do dash.

- **Base:** `https://dash.tuzinho.academy`
- **Formato:** JSON (`Content-Type: application/json`), codificação UTF-8
- **Autenticação:** nenhuma (rota pública). A proteção é feita por origem permitida (CORS), limite de tentativas, campo-isca e validação — veja [Segurança](#segurança).
- **Código-fonte:** [`server/capturaHandler.js`](../server/capturaHandler.js)

> Quer ligar um site ou formulário novo? Comece pelo guia [Integrar um novo formulário](./novo-projeto.md).

---

## Sumário

1. [Visão geral](#visão-geral)
2. [`POST /api/captura`](#post-apicaptura) — gravar um cadastro
3. [`POST /api/captura/existe`](#post-apicapturaexiste) — conferir se a pessoa já se cadastrou
4. [Campos aceitos](#campos-aceitos)
5. [Como o projeto é identificado](#como-o-projeto-é-identificado)
6. [Regras de negócio](#regras-de-negócio)
7. [Respostas e códigos de status](#respostas-e-códigos-de-status)
8. [Segurança](#segurança)
9. [Exemplos](#exemplos)
10. [Outras rotas do dash](#outras-rotas-do-dash)

---

## Visão geral

```
 Site / formulário ──POST /api/captura──▶ dash (Node) ──▶ Postgres (Supabase, São Paulo)
   (qualquer origem                         valida,            tabela dash.leads
    liberada)                               classifica,              │
                                            remove repetidos         ▼
                                                              Tela Registros, Leads,
                                                              Monitoramento
```

O cadastro é gravado **direto no banco**, sem planilha e sem automação intermediária. Se o banco estiver fora do ar, a API responde `503` e o formulário deve avisar a pessoa e manter os dados preenchidos.

---

## `POST /api/captura`

Grava um cadastro (lead).

### Requisição

```http
POST /api/captura HTTP/1.1
Host: dash.tuzinho.academy
Content-Type: application/json
Origin: https://tuzinho.academy

{
  "slug": "workirezumi",
  "nome": "Maria da Silva",
  "email": "maria@exemplo.com",
  "telefone": "5511988887777",
  "utm_source": "ig",
  "utm_medium": "paid",
  "utm_campaign": "120252783384070136",
  "landing_url": "https://tuzinho.academy/lancamento/?utm_source=ig"
}
```

Campos obrigatórios: **`nome`** e **`telefone`** (e o `slug` para o cadastro cair no projeto certo). Os demais são opcionais. A lista completa está em [Campos aceitos](#campos-aceitos).

### Resposta de sucesso (`200`)

Cadastro novo:

```json
{ "status": "ok", "ok": true, "duplicate": false }
```

Pessoa que já estava no projeto (nada é gravado de novo):

```json
{ "status": "duplicado", "ok": true, "duplicate": true }
```

> `status` é o campo atual. `ok` e `duplicate` existem por compatibilidade com os formulários dos produtos (Essentials e Mentoria), que leem `duplicate`.

Outros `200` possíveis:

| Corpo | Quando |
|---|---|
| `{ "status": "ignorado" }` | O corpo tem `tipo` diferente de `"lead"` (por exemplo eventos de navegação). Nada é gravado. |
| `{ "status": "ok" }` | O campo-isca `website` veio preenchido (robô). Responde sucesso para não dar pista, mas **não grava**. |

Os erros estão em [Respostas e códigos de status](#respostas-e-códigos-de-status).

---

## `POST /api/captura/existe`

Confere se uma pessoa já se cadastrou **em um projeto**. Útil para avisar "você já está inscrito" antes de enviar (a aplicação da Mentoria usa isso).

### Requisição

```json
{
  "slug": "mentoria-particular",
  "email": "joao@exemplo.com",
  "whatsapp": "5511977776666"
}
```

Aceita o mesmo identificador de projeto de `/api/captura` (`slug`, ou `product` + `variante`). O telefone pode vir em `whatsapp` ou `telefone`.

### Resposta (`200`)

```json
{ "exists": true }
```

A pessoa é considerada existente se o **e-mail** (sem diferenciar maiúsculas) **ou** o **telefone** (comparando os 11 últimos dígitos) já constam no projeto. Telefones com menos de 10 dígitos não são usados na comparação.

Se o banco falhar: `503` com `{ "status": "error", "message": "Não foi possível conferir agora." }`. Nesse caso, trate como "não sei" e deixe a pessoa enviar.

---

## Campos aceitos

### Identificação do projeto

| Campo | Tipo | Descrição |
|---|---|---|
| `slug` | string | **Recomendado.** Identificação da página, por exemplo `workirezumi`. Veja [Como o projeto é identificado](#como-o-projeto-é-identificado). |
| `product` / `produto` | string | Formato dos formulários do Essentials e da Mentoria. Usado quando não há `slug`. |
| `variante` | string | Só com `product: "essentials"`: `live` ou `membros` definem a vertente. Qualquer outro valor (inclusive variantes de teste A/B) fica em Essentials geral. |
| `evento` | string | Nome antigo do `slug`. Aceito para páginas que ainda não foram atualizadas. |

### Dados da pessoa

| Campo | Tipo | Obrigatório | Regras |
|---|---|---|---|
| `nome` | string | **Sim** | Mínimo 2 caracteres, máximo 120. Também aceita `name`. |
| `telefone` | string | **Sim** | Entre 10 e 15 dígitos depois de remover tudo que não for número (aceita `+55 (11) 98888-7777`). Também aceita `phone` e `whatsapp`. |
| `email` | string | Não | Se vier, precisa ter formato válido. É gravado em minúsculas, máximo 160. |
| `data_nascimento` | string | Não | `AAAA-MM-DD`, `DD/MM/AAAA` ou `DD-MM-AAAA`. Data impossível ou fora de 1900 até hoje é descartada (não gera erro). |

### Origem do tráfego (rastreamento)

Podem vir soltos no corpo, dentro de `atribuicao`, dentro de `utm`, ou ser lidos da URL (`landing_url`/`source_url`). Vale a primeira fonte preenchida, nesta ordem: corpo → `atribuicao` → `utm` → URL.

| Campo | Vira no banco | Observação |
|---|---|---|
| `utm_source` | `veio_de` | Ex.: `ig`, `fb`, `meta`. |
| `utm_medium` | `midia` | Ex.: `paid`. |
| `utm_campaign` | `campanha` | Nome ou ID da campanha. |
| `utm_id` ou `campaign_id` | `campaign_id` | Só é gravado se for numérico com 8 ou mais dígitos. |
| `utm_content` | `ad_id` **ou** `criativo` | Se for numérico (8+ dígitos) é o ID do anúncio; se for texto, é o nome do criativo. |
| `ad_id` / `criativo` | `ad_id` / `criativo` | Têm prioridade sobre `utm_content`. |
| `landing_url` ou `source_url` | `landing_url` | Página onde a pessoa se cadastrou (até 2.000 caracteres). |

### Respostas extras

Qualquer outro campo **simples** do corpo (texto, número, booleano ou lista) é guardado como está em `respostas` (JSON). É assim que a aplicação da Mentoria grava `instagram`, `experiencia`, `faturamento`, `qualificado` etc.

- Objetos aninhados e campos vazios são ignorados.
- Textos são cortados em 1.000 caracteres; listas em 20 itens de 200 caracteres.
- Se as respostas passarem de 8.000 caracteres no total, são descartadas.
- Não entram em `respostas` os campos de contato e de controle: `nome`, `email`, `telefone`, `whatsapp`, `utm`, `atribuicao`, `website`, `user_agent`, `landing_url`, `source_url`, `slug`, `evento`, `product`, `produto`, `tipo`, `data_nascimento`, `submitted_at`, `visitor_id`.

### Controle

| Campo | Descrição |
|---|---|
| `website` | **Campo-isca (honeypot).** Deve ficar vazio e escondido no formulário. Preenchido = robô. |
| `tipo` | Se existir e for diferente de `"lead"`, o corpo é ignorado (veja [`200` ignorado](#resposta-de-sucesso-200)). |

---

## Como o projeto é identificado

Cada cadastro pertence a **um projeto**, definido por um **slug**. O dash descobre o projeto nesta ordem:

1. `slug` (se vier preenchido);
2. `product` (+ `variante`, no caso do Essentials);
3. `evento` (nome antigo).

O slug é comparado com o catálogo em [`server/projetos/catalogo.js`](../server/projetos/catalogo.js). Cada projeto tem um **tipo** e, no Essentials, uma **vertente**:

| Slug | Tipo | Vertente | Origem gravada (`origem`) |
|---|---|---|---|
| `essentials` | essentials | — | `essentials` |
| `essentials-live` | essentials | live | `essentials_live` |
| `essentials-membros` | essentials | membros | `essentials_membros` |
| `workirezumi` | workshop | — | `workshop_irezumi_1` |
| `workleao2` | workshop | — | `workshop_leao_2` |
| `workcobertura` | workshop | — | `cobertura_cicatrizacao_09_09` |
| `workprompt` | workshop | — | `prompt` |
| `mentoria-particular` | mentoria | — | `mentoria_particular` |

**Slug fora do catálogo também funciona.** O dash o classifica pelo prefixo:

| Prefixo do slug | Tipo |
|---|---|
| `work…` | workshop |
| `essentials…` (com `live` ou `membro` no nome, define a vertente) | essentials |
| `mentoria…` | mentoria |
| qualquer outro | outros |

Slug vazio ou ausente vira o projeto `site`, do tipo **outros** — assim ninguém é misturado a outro projeto sem querer.

Para dar um nome bonito ao projeto na tela e escolher a origem, cadastre-o no catálogo ([guia](./novo-projeto.md#2-cadastrar-o-projeto-no-catálogo)).

---

## Regras de negócio

**Repetidos.** Uma pessoa conta **uma vez por projeto**. Duas inscrições são a mesma pessoa se tiverem o mesmo e-mail (sem diferenciar maiúsculas) **ou** o mesmo telefone (11 últimos dígitos). A mesma pessoa em projetos diferentes é gravada em cada um.

**Normalização.** Telefone é gravado só com dígitos; e-mail em minúsculas; a data de cadastro é gravada em UTC e também como texto em horário de Brasília (`dd/mm/aaaa`).

**Identificador interno.** Cada cadastro recebe `fonte_id = "captura:<uuid>"`, que marca que ele entrou direto pelo dash.

**Banco primeiro.** A gravação acontece antes de qualquer outro passo. Em caso de falha de conexão, o dash tenta **mais uma vez** antes de responder `503`.

**Migração automática.** Ao subir, o dash cria as colunas necessárias na tabela `leads` e classifica os cadastros antigos. Não é preciso rodar SQL (veja [Banco de dados](./banco-de-dados.md)).

---

## Respostas e códigos de status

Todas as respostas de erro têm o formato:

```json
{ "status": "error", "message": "Texto explicando o problema." }
```

| HTTP | `message` | Causa | O que o formulário deve fazer |
|---|---|---|---|
| `200` | — | Gravado, repetido, ignorado ou robô | Mostrar sucesso (ou "você já está inscrito" se `duplicate: true`). |
| `400` | `Corpo inválido.` | JSON malformado | Corrigir o envio (erro de programação). |
| `400` | `Informe o nome.` | `nome` ausente ou com menos de 2 caracteres | Pedir o nome. |
| `400` | `Informe um WhatsApp válido.` | Telefone com menos de 10 ou mais de 15 dígitos | Pedir o telefone de novo. |
| `400` | `E-mail inválido.` | E-mail preenchido com formato errado | Pedir o e-mail de novo. |
| `403` | `Origem não permitida.` | O site que enviou não está na lista de origens liberadas | Liberar o domínio (veja [Segurança](#segurança)). |
| `404` | `Rota não encontrada.` | Caminho diferente de `/api/captura` ou `/api/captura/existe` | Corrigir a URL. |
| `405` | `Método não permitido.` | Usou `GET` (ou outro) em vez de `POST` | Usar `POST`. Abrir a URL no navegador mostra esta mensagem, e isso é normal. |
| `429` | `Muitas tentativas. Aguarde alguns minutos.` | Mais de 40 envios do mesmo IP em 10 minutos | Pedir para tentar de novo mais tarde. |
| `503` | `Não foi possível gravar agora.` | Falha no banco (mesmo após a segunda tentativa) | Mostrar "não conseguimos enviar agora, tente de novo" e **manter os dados** na tela. |

### Preflight (CORS)

Requisições `OPTIONS` respondem `204` com os cabeçalhos de CORS (quando a origem é permitida) e sem corpo:

```
Access-Control-Allow-Origin: <origem do site>
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

---

## Segurança

| Mecanismo | Como funciona |
|---|---|
| **Origem permitida (CORS)** | Só os sites da lista abaixo podem chamar a API pelo navegador. Navegadores sempre enviam `Origin` em chamadas entre sites; origem fora da lista recebe `403`. |
| **Limite de tentativas** | 40 envios por IP a cada 10 minutos (`429` depois disso). O IP vem de `X-Forwarded-For`. |
| **Campo-isca** | `website` preenchido responde sucesso e não grava. |
| **Tamanho do corpo** | Máximo de 32 KB por requisição. |
| **Validação** | Nome, telefone e e-mail são validados no servidor, independentemente do formulário. |
| **Eventos não são leads** | Corpo com `tipo` diferente de `lead` é ignorado. |

**Origens permitidas por padrão:**

- `https://tuzinho.academy` e `https://www.tuzinho.academy`
- `https://tuzinho.app` e `https://www.tuzinho.app`

**Liberar outro domínio:** defina a variável de ambiente `CAPTURA_ORIGENS` no Plesk (Node.js → Custom environment variables), com as origens separadas por vírgula, **incluindo o protocolo e sem barra final**:

```
CAPTURA_ORIGENS=https://novo-site.com.br,https://www.novo-site.com.br
```

Reinicie o app depois de alterar.

> A API é pública por natureza (formulários de site não têm login). Por isso ela só **grava** cadastros e nunca devolve dados de outras pessoas. A única informação que revela é se um e-mail/telefone já se cadastrou (`/existe`), com limite de tentativas.

---

## Exemplos

### cURL

```bash
curl -i -X POST https://dash.tuzinho.academy/api/captura \
  -H "Origin: https://tuzinho.academy" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "workirezumi",
    "nome": "Maria da Silva",
    "email": "maria@exemplo.com",
    "telefone": "5511988887777"
  }'
```

> O `Origin` precisa ser de um domínio liberado. Sem ele (como no `curl` puro) a chamada passa, mas é só para teste: navegadores sempre o enviam.

### JavaScript (navegador)

```js
async function enviarCadastro(dados) {
  const resposta = await fetch('https://dash.tuzinho.academy/api/captura', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: 'workirezumi', ...dados }),
  })
  const corpo = await resposta.json().catch(() => ({}))

  if (!resposta.ok) throw new Error(corpo.message || 'Não foi possível enviar.')
  return { duplicado: corpo.duplicate === true }
}
```

### Conferir se já existe

```js
const { exists } = await fetch('https://dash.tuzinho.academy/api/captura/existe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ slug: 'mentoria-particular', email, whatsapp }),
}).then((r) => r.json())
```

### Formato do Essentials (produto + variante)

```json
{
  "product": "essentials",
  "variante": "live",
  "nome": "Maria da Silva",
  "email": "maria@exemplo.com",
  "telefone": "+5511988887777",
  "data_nascimento": "1990-05-17",
  "tipo": "lead",
  "atribuicao": { "utm_source": "ig", "utm_medium": "paid" },
  "source_url": "https://tuzinho.app/essentials/"
}
```

Resultado: projeto `essentials-live` (tipo Essentials, vertente Live).

---

## Outras rotas do dash

Estas rotas **exigem login** (cookie de sessão) e não são usadas por sites externos. Estão aqui só como referência.

| Rota | Quem acessa | Para que serve |
|---|---|---|
| `GET /api/registros` | admin | Lista de Registros (leads por projeto + eventos da Hotmart). |
| `DELETE /api/registros` | admin | Apaga uma pessoa dos registros. Corpo: `{ "contatos": [{ "email", "telefone" }] }`. |
| `GET` / `POST /api/registros/importacao` | admin | Mostra / executa a importação única do histórico das planilhas. |
| `GET /api/monitor` | admin | Resumo do monitoramento (endereços, cadastros, erros do formulário). |
| `POST /api/monitor/verificar` | admin | Confere todos os endereços agora. |
| `GET /api/leads` | login | Lista de leads (tela Leads), com projeto, UTMs, criativo e respostas do formulário. |
| `GET /api/leads/notas` | login | Anotações internas da equipe (situação do contato, etiquetas, nota). |
| `PUT /api/leads/notas` | admin | Salva a anotação de uma pessoa: `{ chave, nota, situacao, tags }` (`chave` = `e:<e-mail>` ou `t:<11 últimos dígitos>`). |
| `GET /api/saude` | pública | Diagnóstico rápido (banco, DNS, memória). |

Rotas públicas de integração:

| Rota | Para que serve |
|---|---|
| `POST /api/hotmart/webhook` | Recebe os eventos da Hotmart. Protegida pelo cabeçalho `X-Hotmart-Hottok`. |
| `GET /api/player-config` | Configuração do player de vídeo da VSL. |
| `POST /api/deploy` | Disparado pelo Plesk após cada push. Protegido por `DEPLOY_TOKEN`. |
