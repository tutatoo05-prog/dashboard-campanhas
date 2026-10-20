import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularMetricasVideo, chaveDia, rotuloPagina, somarDias } from './videosMetrics.js'

const HOJE = '2026-10-20'

function ev(evento, visitor, extra = {}) {
  return { data_hora: '2026-10-20 10:00:00', evento, visitor_id: visitor, sessao_id: `s-${visitor}`, pagina: '/produtos/essentials/', variante: 'hero-v1_a', dispositivo: 'mobile', video: 'vsl', ...extra }
}

test('chaveDia e somarDias', () => {
  assert.equal(chaveDia('2026-10-20 13:05:08'), '2026-10-20')
  assert.equal(chaveDia('lixo'), '')
  assert.equal(somarDias('2026-10-01', -1), '2026-09-30')
})

test('rotuloPagina separa Essentials, Membros e Live', () => {
  assert.equal(rotuloPagina({ variante: 'live', pagina: '/essentials/' }), 'Live')
  assert.equal(rotuloPagina({ variante: 'membros', pagina: '/produtos/essentials/membros/' }), 'Membros')
  assert.equal(rotuloPagina({ variante: 'hero-v1_a', pagina: '/produtos/essentials/' }), 'Essentials')
})

test('conta por visitante: 814 plays da mesma pessoa viram 1 espectador', () => {
  const linhas = Array.from({ length: 814 }, () => ev('video_play', 'v1'))
  const r = calcularMetricasVideo(linhas, { hoje: HOJE })
  assert.equal(r.resumo.espectadores, 1)
  assert.equal(r.resumo.eventosDePlay, 814)
})

test('funil: quem chegou a 75% também conta em 25% e 50%; fim conta em tudo', () => {
  const linhas = [
    ev('video_play', 'a'),
    ev('video_play', 'b'), ev('video_progresso', 'b', { video_pct: '25', video_segundos: '100' }),
    ev('video_play', 'c'), ev('video_progresso', 'c', { video_pct: '75', video_segundos: '600' }),
    ev('video_play', 'd'), ev('video_fim', 'd'),
  ]
  const r = calcularMetricasVideo(linhas, { hoje: HOJE })
  const pessoas = Object.fromEntries(r.funil.map((e) => [e.chave, e.pessoas]))
  assert.deepEqual(pessoas, { play: 4, p25: 3, p50: 2, p75: 2, p95: 1, fim: 1 })
  assert.equal(r.resumo.assistiram75, 2)
  assert.equal(r.resumo.mediaSegundos, 350)
  assert.equal(r.resumo.pessoasComTempo, 2)
})

test('taxa de play: espectadores sobre visitantes da página', () => {
  const linhas = [ev('visita', 'a'), ev('visita', 'b'), ev('visita', 'c'), ev('visita', 'd'), ev('video_play', 'a')]
  const r = calcularMetricasVideo(linhas, { hoje: HOJE })
  assert.equal(r.resumo.visitantes, 4)
  assert.equal(r.resumo.taxaPlay, 25)
  assert.deepEqual(r.porPagina.map((p) => [p.rotulo, p.visitantes, p.espectadores]), [['Essentials', 4, 1]])
})

test('período: ignora eventos fora da janela e preenche os dias sem dados', () => {
  const linhas = [
    ev('video_play', 'velho', { data_hora: '2026-09-01 10:00:00' }),
    ev('video_play', 'novo', { data_hora: '2026-10-18 10:00:00' }),
  ]
  const r = calcularMetricasVideo(linhas, { hoje: HOJE, dias: 7 })
  assert.equal(r.resumo.espectadores, 1)
  assert.equal(r.porDia.length, 7)
  assert.equal(r.porDia[0].dia, '2026-10-14')
  assert.equal(r.porDia.find((d) => d.dia === '2026-10-18').espectadores, 1)
  assert.equal(calcularMetricasVideo(linhas, { hoje: HOJE, dias: 0 }).resumo.espectadores, 2)
})

test('só mede o vídeo pedido e lista os demais', () => {
  const linhas = [ev('video_play', 'a'), ev('video_play', 'b', { video: 'depo-karem' })]
  const r = calcularMetricasVideo(linhas, { hoje: HOJE, video: 'vsl' })
  assert.equal(r.resumo.espectadores, 1)
  assert.deepEqual(r.videosDisponiveis.map((v) => v.nome).sort(), ['depo-karem', 'vsl'])
})

test('conversão: cruza só quem se identificou, por e-mail', () => {
  const linhas = [
    ev('video_play', 'a', { email: 'Ana@x.com' }), ev('video_progresso', 'a', { video_pct: '95' }),
    ev('video_play', 'b', { email: 'bia@x.com' }), ev('video_progresso', 'b', { video_pct: '25' }),
    ev('video_play', 'c'),
  ]
  const r = calcularMetricasVideo(linhas, { hoje: HOJE, compradores: new Set(['ana@x.com']) })
  assert.equal(r.conversao.identificados, 2)
  assert.deepEqual(r.conversao.assistiram75, { pessoas: 1, compraram: 1 })
  assert.deepEqual(r.conversao.outros, { pessoas: 1, compraram: 0 })
})

test('sem dados: tudo zerado, sem quebrar', () => {
  const r = calcularMetricasVideo([], { hoje: HOJE })
  assert.equal(r.resumo.espectadores, 0)
  assert.equal(r.resumo.taxaPlay, 0)
  assert.equal(r.resumo.mediaSegundos, null)
})

test('período "hoje" (dias = 1) conta só os eventos do dia', () => {
  const linhas = [
    ev('video_play', 'ontem', { data_hora: '2026-10-17 10:00:00' }),
    ev('video_play', 'hoje', { data_hora: `${HOJE} 10:00:00` }),
  ]
  const r = calcularMetricasVideo(linhas, { hoje: HOJE, dias: 1 })
  assert.equal(r.resumo.espectadores, 1)
  assert.equal(r.porDia.length, 1)
})
