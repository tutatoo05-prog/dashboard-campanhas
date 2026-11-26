# Retenção por segundo da VSL

Tela: **Vídeos → Retenção por segundo** (só admin). Dados: tabelas `video_retencao` e `video_versoes` (bloco no fim de `db/schema.sql`, rodar uma vez no SQL Editor do Supabase, schema `dash`).

## Como o player envia os segundos

`POST /api/video-track` é **público** (sem login) e nunca derruba a página: erro de banco responde 204. Proteções:

- **Origem:** só os sites da Tuzinho (mesma lista do `/api/captura`: `tuzinho.academy`, `tuzinho.app` e o que estiver em `CAPTURA_ORIGENS`). Outra origem leva 403.
- **Limites:** 600 envios por minuto por IP e 600 por hora por sessão (429 depois disso).
- **Versão cadastrada:** o player só grava em versão que existe no painel (a `v1` já vale). Versão desconhecida é ignorada em silêncio (204). **Cadastre a versão nova em Vídeos → Retenção por segundo → "Cadastrar versão" antes de subir o player com ela.**

Corpo JSON:

```json
{ "video": "vsl", "versao": "v1.1", "sessao": "<visitor_id ou sessao_id>", "segundos": [12, 13, 14, 15, 16] }
```

- `video`: um id de `VIDEOS_CONHECIDOS` (`server/playerConfig.js`): `vsl`, `vsl-vertical`, `vsl-mentoria`.
- `versao`: rótulo da edição do vídeo (`v1`, `v1.1`, `v1.2-gancho`; começa por letra ou número, até 20 caracteres). Sem ele vale `v1`. **Ao trocar o arquivo por uma edição nova, mude este rótulo no player.**
- `sessao`: 8 a 64 caracteres (`[A-Za-z0-9_-]`). Use o `visitor_id` que o player já tem (só mede quem aceitou cookies, como o resto).
- `segundos`: até 30 por envio, só números inteiros (`null`, `"7"`, `true` são recusados). Repetir um segundo conta como replay (gera os picos).

Trecho para o player (projeto produtos, `pages/player`): junta o segundo atual a cada `timeupdate` enquanto toca e manda a cada 5 s.

```js
const fila = []
let ultimo = -1
video.addEventListener('timeupdate', () => {
  const s = Math.floor(video.currentTime)
  if (!video.paused && s !== ultimo) { fila.push(s); ultimo = s }
})
function enviar() {
  if (!fila.length) return
  const corpo = JSON.stringify({ video: VIDEO_ID, versao: VERSAO, sessao: VISITOR_ID, segundos: fila.splice(0, 30) })
  navigator.sendBeacon(`${DASH}/api/video-track`, corpo) // string = text/plain: sem pré-voo de CORS
}
setInterval(enviar, 5000)
addEventListener('pagehide', enviar)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') enviar() })
```

## Como ler

- Base 100% = pessoas que passaram dos 3 primeiros segundos.
- Linha normal: pessoas naquele segundo ÷ base (só desce).
- "Mostrar picos de replay": visualizações ÷ base (passa da linha normal onde as pessoas voltaram o vídeo).
- "Copiar comparação para a IA": Markdown com o que mudou (anotação de cada versão), maiores quedas, picos e a retenção a 10/25/50/75/90/100% do vídeo.

## Volume

Uma linha por sessão e segundo (`vezes` conta os replays), não por evento. Uma VSL de 23 min com 1.000 espectadores chega a no máximo ~1,4 milhão de linhas. Se pesar, apague as antigas (`delete from video_retencao where atualizado_em < now() - interval '180 days'`).
