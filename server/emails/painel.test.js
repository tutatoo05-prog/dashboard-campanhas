import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CATALOGO, itensDaFila, itensDiretos, montarPainelEmails, resumirEmails } from './painel.js'

const AGORA = new Date('2026-10-21T15:00:00Z')
const hora = (h) => new Date(AGORA.getTime() - h * 3_600_000).toISOString()

const filaLinhas = [
  { id: 1, passo: 'pix_90min', cenario: 'pagamento', email: 'a@x.com', nome: 'A', curso: 'Essentials', estado: 'enviado', erro: null, enviar_em: hora(3), enviado_em: hora(2), comprou_depois: true },
  { id: 2, passo: 'pix_90min', cenario: 'pagamento', email: 'b@x.com', nome: 'B', curso: 'Essentials', estado: 'enviado', erro: null, enviar_em: hora(30), enviado_em: hora(29), comprou_depois: false },
  { id: 3, passo: 'carrinho_24h', cenario: 'carrinho', email: 'c@x.com', nome: 'C', curso: 'Essentials', estado: 'cancelado', erro: 'comprou', enviar_em: hora(1), enviado_em: null, comprou_depois: null },
  { id: 4, passo: 'onboarding_d1', cenario: 'onboarding', email: 'd@x.com', nome: 'D', curso: 'Essentials', estado: 'pendente', erro: null, enviar_em: new Date(AGORA.getTime() + 3_600_000).toISOString(), enviado_em: null, comprou_depois: null },
  { id: 5, passo: 'carrinho_72h', cenario: 'carrinho', email: 'e@x.com', nome: 'E', curso: 'Essentials', estado: 'falhou', erro: 'Brevo fora', enviar_em: hora(5), enviado_em: null, comprou_depois: null },
]
const eventos = [
  { id: 10, nome: 'F', email: 'f@x.com', curso: 'Essentials', simulado: false, recebido_em: hora(4), bv: { ok: true, em: hora(4) }, ap: null, abandono: null },
  { id: 11, nome: 'G', email: 'g@x.com', curso: 'Essentials', simulado: false, recebido_em: hora(6), bv: null, ap: { ok: true, em: hora(6) }, abandono: 'carrinho' },
  { id: 12, nome: 'H', email: 'h@x.com', curso: 'Workshop', simulado: false, recebido_em: hora(7), bv: null, ap: { ok: true, pulado: 'curso sem e-mail de apoio' }, abandono: 'carrinho' },
  { id: 13, nome: 'I', email: 'i@x.com', curso: 'Essentials', simulado: true, recebido_em: hora(8), bv: { ok: true, em: hora(8), simulado: true }, ap: null, abandono: null },
]

test('e-mails diretos: lê os passos, ignora os pulados e marca simulados', () => {
  const itens = itensDiretos(eventos)
  assert.deepEqual(itens.map((i) => [i.tipo, i.estado]), [['boas_vindas', 'enviado'], ['apoio_carrinho', 'enviado'], ['boas_vindas', 'simulado']])
})

test('resumo: conta por tipo e estado, taxa de compra depois do envio e envios de hoje', () => {
  const itens = [...itensDaFila(filaLinhas), ...itensDiretos(eventos)]
  const r = resumirEmails(itens, { agora: AGORA, dias: 7, env: { EMAIL_SEQUENCIAS_MODO: 'ativo' } })
  const pix = r.porTipo.find((t) => t.tipo === 'pix_90min')
  assert.deepEqual([pix.enviados, pix.comprouDepois, pix.taxaCompra], [2, 1, 50])
  assert.equal(r.porTipo.find((t) => t.tipo === 'carrinho_24h').cancelados, 1)
  assert.equal(r.porTipo.find((t) => t.tipo === 'onboarding_d1').pendentes, 1)
  assert.equal(r.porTipo.find((t) => t.tipo === 'carrinho_72h').falhas, 1)
  assert.equal(r.porTipo.find((t) => t.tipo === 'boas_vindas').simulados, 1)
  assert.equal(r.total.enviados, 4) // 2 pix + boas-vindas + apoio
  assert.equal(r.modo, 'ativo')
  assert.equal(r.porDia.length, 7)
  assert.equal(r.hoje.tetoBrevo, 300)
  assert.ok(r.hoje.total >= 2)
})

test('todo e-mail do catálogo aparece nos gráficos, mesmo sem nenhum envio', () => {
  const r = resumirEmails([], { agora: AGORA })
  assert.equal(r.porTipo.length, CATALOGO.length)
  assert.ok(r.porTipo.every((t) => t.enviados === 0 && t.taxaCompra === null))
})

test('painel: junta fila e diretos, mais recente primeiro, com o rótulo legível', async () => {
  const consultar = async (texto) => ({ rows: texto.includes('from emails_fila') ? filaLinhas : eventos })
  const p = await montarPainelEmails(consultar, { agora: AGORA, dias: 30 })
  assert.equal(p.lista.length, filaLinhas.length + 3)
  const tempos = p.lista.map((i) => new Date(i.quando).getTime())
  assert.deepEqual(tempos, [...tempos].sort((a, b) => b - a))
  assert.equal(p.lista.find((i) => i.tipo === 'pix_90min').rotulo, 'Pix gerado · 1h30')
})

test('painel: sem a tabela da fila (sequências nunca ligadas) ainda mostra os e-mails diretos', async () => {
  const consultar = async (texto) => {
    if (texto.includes('from emails_fila')) throw Object.assign(new Error('não existe'), { code: '42P01' })
    return { rows: eventos }
  }
  const p = await montarPainelEmails(consultar, { agora: AGORA })
  assert.equal(p.lista.length, 3)
  assert.equal(p.total.enviados, 2)
})
