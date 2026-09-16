# Guia de implementação — Meta Pixel + eventos de conversão

Implementação para **duas landing pages** com campanhas Meta Ads apontando para a mesma URL ou para páginas diferentes.

---

## Objetivo

Saber:

- **Quantas pessoas converteram** (inscrição/lead)
- **Qual criativo/anúncio** gerou cada conversão
- Enviar esses dados para a Meta (atribuição correta no Ads Manager e no dashboard)

---

## Visão geral

```
Anúncio Meta (Criativo A ou B)
        ↓ clique (com fbclid na URL)
Landing Page (Projeto 1 ou 2)
        ↓ Pixel instalado
Formulário de inscrição enviado
        ↓ evento Lead ou CompleteRegistration
Meta atribui conversão ao anúncio/criativo
```

**Importante:** instale o Pixel nas **duas páginas**. Use o **mesmo Pixel ID** se forem do mesmo negócio/conta Meta.

---

## Pré-requisitos

1. Conta no [Meta Business Suite](https://business.facebook.com)
2. Acesso ao **Gerenciador de Eventos** (Events Manager)
3. Acesso ao código ou CMS das **duas landing pages**
4. (Recomendado) Domínio verificado no Business Manager

---

## Passo 1 — Criar ou localizar o Pixel

1. Acesse **Gerenciador de Eventos** → [business.facebook.com/events_manager](https://business.facebook.com/events_manager)
2. Selecione a conta de anúncios (`act_115097955921855`)
3. Clique em **Conectar dados** → **Web** → **Meta Pixel**
4. Dê um nome (ex.: `Pixel - Inscrições`)
5. Anote o **Pixel ID** (número de 15–16 dígitos)

> Use **um único Pixel** para os dois projetos, salvo se forem negócios/contas totalmente separadas.

---

## Passo 2 — Instalar o Pixel base nas duas páginas

### Opção A — Script manual (HTML / qualquer site)

Cole antes do `</head>` em **todas as páginas** dos dois projetos:

```html
<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', 'SEU_PIXEL_ID_AQUI');
fbq('track', 'PageView');
</script>
<noscript>
  <img height="1" width="1" style="display:none"
       src="https://www.facebook.com/tr?id=SEU_PIXEL_ID_AQUI&ev=PageView&noscript=1"/>
</noscript>
<!-- End Meta Pixel Code -->
```

Substitua `SEU_PIXEL_ID_AQUI` pelo Pixel ID real.

### Opção B — Google Tag Manager (GTM)

1. Crie tag **Meta Pixel** no GTM
2. Trigger: **All Pages**
3. Publique o container nos dois sites

### Opção C — WordPress / Elementor / etc.

- Plugin: **PixelYourSite**, **Meta for WordPress** ou similar
- Ou snippet no header via tema / plugin de código customizado

---

## Passo 3 — Configurar URLs dos anúncios (atribuição por criativo)

Nos anúncios Meta, use URL com parâmetros dinâmicos:

**Projeto 1:**

```
https://projeto1.com/inscricao?utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_id={{ad.id}}
```

**Projeto 2:**

```
https://projeto2.com/inscricao?utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_id={{ad.id}}
```

Parâmetros úteis da Meta:

| Parâmetro | Valor |
|-----------|--------|
| `{{campaign.name}}` | Nome da campanha |
| `{{campaign.id}}` | ID da campanha |
| `{{adset.name}}` | Nome do conjunto |
| `{{ad.name}}` | Nome do criativo/anúncio |
| `{{ad.id}}` | ID do anúncio |

A Meta adiciona automaticamente o `fbclid` no clique — **não remova** ao editar a URL.

---

## Passo 4 — Disparar evento de conversão no formulário

Escolha **um evento padrão** para inscrição:

| Evento Meta | Quando usar |
|-------------|-------------|
| `Lead` | Captura de lead (formulário, cadastro) |
| `CompleteRegistration` | Inscrição/cadastro concluído |

Recomendação: use **`Lead`** para formulário de inscrição.

### Exemplo — disparo no submit (JavaScript)

```html
<form id="form-inscricao" action="/obrigado" method="POST">
  <input type="text" name="nome" required />
  <input type="email" name="email" required />
  <button type="submit">Quero me inscrever</button>
</form>

<script>
document.getElementById('form-inscricao').addEventListener('submit', function () {
  if (typeof fbq === 'function') {
    fbq('track', 'Lead', {
      content_name: 'Inscrição Landing',
      content_category: 'formulario',
      value: 0,
      currency: 'BRL'
    });
  }
});
</script>
```

### Exemplo — página de obrigado (alternativa)

Se o form redireciona para `/obrigado`, dispare o evento **só nessa página**:

```html
<!-- Na página /obrigado -->
<script>
  fbq('track', 'Lead');
</script>
```

> Prefira disparar no **submit com sucesso** ou na **página de obrigado**, não nos dois (evita duplicar).

---

## Passo 5 — Repetir nos dois projetos

Checklist por projeto:

### Projeto 1 (Landing A)

- [ ] Pixel base no `<head>` (PageView)
- [ ] Evento `Lead` no formulário ou página de obrigado
- [ ] URL dos anúncios com UTMs dinâmicas
- [ ] Teste no Events Manager

### Projeto 2 (Landing B)

- [ ] Pixel base no `<head>` (PageView)
- [ ] Evento `Lead` no formulário ou página de obrigado
- [ ] URL dos anúncios com UTMs dinâmicas
- [ ] Teste no Events Manager

---

## Passo 6 — Testar a instalação

1. Instale a extensão **[Meta Pixel Helper](https://chrome.google.com/webstore/detail/meta-pixel-helper)** (Chrome)
2. Acesse cada landing page → deve aparecer **PageView**
3. Envie um formulário de teste → deve aparecer **Lead**
4. No **Gerenciador de Eventos** → seu Pixel → **Testar eventos**
5. Informe a URL e confirme os eventos em tempo real

### Teste de atribuição (opcional)

1. Clique em um anúncio real ou simulado (com `fbclid` na URL)
2. Complete a inscrição
3. Em 15 min–24 h, veja no Ads Manager se o evento aparece no anúncio

---

## Passo 7 — Conversions API (CAPI) — recomendado

O Pixel roda no navegador; o **CAPI** envia eventos pelo servidor e melhora a atribuição (iOS, ad blockers).

Opções:

- **n8n** recebe submit do form → envia evento para Meta CAPI
- Plugin WordPress com CAPI
- [Documentação Meta CAPI](https://developers.facebook.com/docs/marketing-api/conversions-api)

Fluxo com n8n:

```
Formulário → Webhook n8n → Salva lead + UTMs → Envia evento Lead para Meta CAPI
```

Dados úteis no CAPI:

- `event_name`: `Lead`
- `event_source_url`: URL da página
- `user_data`: e-mail (hash SHA256), telefone (hash)
- `custom_data`: `utm_content`, `ad_id` capturados do form

---

## Passo 8 — Capturar origem do criativo no formulário (opcional, mas ideal)

Para saber **"inscrição veio do criativo B"** com nome/e-mail:

```javascript
// Salvar UTMs ao carregar a página
(function () {
  const params = new URLSearchParams(window.location.search);
  const utmData = {
    utm_source: params.get('utm_source'),
    utm_campaign: params.get('utm_campaign'),
    utm_content: params.get('utm_content'),
    utm_id: params.get('utm_id'),
    fbclid: params.get('fbclid'),
  };
  sessionStorage.setItem('utm_data', JSON.stringify(utmData));
})();

// No submit, enviar junto com o form (para n8n, e-mail, etc.)
document.getElementById('form-inscricao').addEventListener('submit', function () {
  const utm = JSON.parse(sessionStorage.getItem('utm_data') || '{}');
  // Enviar utm para seu backend/webhook junto com nome e e-mail
});
```

Payload exemplo para n8n:

```json
{
  "nome": "João Silva",
  "email": "joao@email.com",
  "projeto": "landing-1",
  "criativo": "Vídeo UGC - Versão B",
  "ad_id": "120250519323180136",
  "campanha": "APENAS - KRYPTONITA",
  "fbclid": "IwAR..."
}
```

---

## Passo 9 — Configurar conversão nas campanhas Meta

1. **Gerenciador de Eventos** → Pixel → **Configurar eventos**
2. Marque `Lead` como **evento de conversão**
3. Nas campanhas de **Leads** ou **Conversão**, selecione otimização para **Lead** (evento do Pixel)
4. Aguarde ~24–48 h para dados estáveis no Ads Manager

---

## Passo 10 — Ver no dashboard de campanhas

Com Pixel + evento configurados, a Marketing API passa a retornar conversões por anúncio. No dashboard:

- Filtro **Nível: Anúncios**
- Colunas **Leads** e **CPL** por criativo
- Relatório IA com dados por criativo

Eventos que a API reconhece (já mapeados no projeto):

- Leads: `lead`, `onsite_web_lead`, `offsite_conversion.fb_pixel_lead`
- Conversões: `complete_registration`, `offsite_conversion.fb_pixel_complete_registration`

---

## Problemas comuns

| Problema | Solução |
|----------|---------|
| Pixel Helper não detecta | Script fora do `<head>`, ID errado ou bloqueador de ads |
| Lead dispara 2x | Evento no form **e** na página de obrigado — use só um |
| Conversão não aparece no anúncio | Aguardar 24 h; conferir domínio verificado; usar CAPI |
| Mesma landing, vários criativos | UTMs + `fbclid` + evento Lead no Pixel |
| Dois projetos, mesma conta | Um Pixel ID nos dois sites |

---

## Checklist final

### Meta (uma vez)

- [ ] Pixel criado no Events Manager
- [ ] Domínio verificado (recomendado)
- [ ] Evento `Lead` marcado como conversão

### Projeto 1

- [ ] Pixel + PageView
- [ ] Evento Lead no form/obrigado
- [ ] UTMs nos links dos anúnsios
- [ ] Teste com Pixel Helper

### Projeto 2

- [ ] Pixel + PageView
- [ ] Evento Lead no form/obrigado
- [ ] UTMs nos links dos anúnsios
- [ ] Teste com Pixel Helper

### Opcional (máxima atribuição)

- [ ] CAPI via n8n no submit
- [ ] Webhook com nome + criativo + campanha
- [ ] Dashboard no nível Anúncios

---

## Links úteis

- [Gerenciador de Eventos](https://business.facebook.com/events_manager)
- [Meta Pixel Helper (Chrome)](https://chrome.google.com/webstore/detail/meta-pixel-helper)
- [Parâmetros de URL dinâmicos](https://www.facebook.com/business/help/167000958898845)
- [Conversions API](https://developers.facebook.com/docs/marketing-api/conversions-api)
- [Eventos padrão Meta](https://developers.facebook.com/docs/meta-pixel/reference)

---

## Resumo

1. **Um Pixel** → instale nos **dois projetos**
2. **Evento Lead** → no submit ou página de obrigado
3. **UTMs dinâmicas** → nos links dos anúncios
4. **Teste** → Pixel Helper + Events Manager
5. **(Opcional)** CAPI + webhook n8n → dados individuais com criativo

Com isso a Meta atribui conversões por criativo e você pode cruzar com o dashboard e o n8n.
