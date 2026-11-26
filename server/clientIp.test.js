import test from 'node:test'
import assert from 'node:assert/strict'
import { getClientIp, ipInterno } from './security.js'

const req = (xff, remote = '127.0.0.1') => ({ headers: xff === undefined ? {} : { 'x-forwarded-for': xff }, socket: { remoteAddress: remote } })

test('IP inventado no começo do X-Forwarded-For não vale: vale o que o proxy acrescentou no fim', () => {
  assert.equal(getClientIp(req('1.2.3.4, 200.150.10.20')), '200.150.10.20')
  assert.equal(getClientIp(req('9.9.9.9, 8.8.8.8, 200.150.10.20')), '200.150.10.20')
})

test('pula os proxies internos que vêm depois do IP do visitante', () => {
  assert.equal(getClientIp(req('1.2.3.4, 200.150.10.20, 127.0.0.1')), '200.150.10.20')
  assert.equal(getClientIp(req('1.2.3.4, 200.150.10.20, 10.0.0.5, 192.168.1.2')), '200.150.10.20')
})

test('sem cabeçalho usa o endereço da conexão; só endereços internos usa o último da lista (dev/testes)', () => {
  assert.equal(getClientIp(req(undefined, '201.1.1.1')), '201.1.1.1')
  assert.equal(getClientIp(req('10.1.2.3')), '10.1.2.3')
})

test('ipInterno reconhece as faixas privadas e de loopback', () => {
  for (const ip of ['10.0.0.1', '127.0.0.1', '172.16.0.1', '172.31.255.1', '192.168.0.9', '169.254.1.1', '::1', '::ffff:127.0.0.1', 'fd00::1', 'fe80::1']) assert.equal(ipInterno(ip), true, ip)
  for (const ip of ['8.8.8.8', '172.32.0.1', '200.150.10.20', '2800:3f0::1']) assert.equal(ipInterno(ip), false, ip)
})
