import { query } from '../db.js'
import { CAIXA_INICIAL, lancamentosDaPlanilha } from './historico.js'

let pronto = null

/**
 * Cria as tabelas de Finanças (se não existirem) e, só na primeira vez, carrega a planilha "Lucro Academy 2026".
 * Idempotente. Espelho em db/financas.sql para quem preferir rodar na mão.
 */
export function garantirEsquemaFinancas(env, consultar = (texto, params) => query(env, texto, params)) {
  if (!pronto) {
    pronto = executar(consultar).catch((erro) => {
      pronto = null
      throw erro
    })
  }
  return pronto
}

export function reiniciarEsquemaFinancas() {
  pronto = null
}

async function executar(consultar) {
  await consultar(`create table if not exists fin_lancamentos (
    mes text not null,
    tipo text not null check (tipo in ('receita', 'custo')),
    linha text not null,
    valor numeric not null default 0,
    origem text not null default 'manual',
    atualizado_em timestamptz not null default now(),
    primary key (mes, tipo, linha)
  )`)
  await consultar(`create table if not exists fin_config (
    chave text primary key,
    valor text not null,
    atualizado_em timestamptz not null default now()
  )`)

  const { rows } = await consultar('select count(*)::int as total from fin_lancamentos')
  if (rows[0].total > 0) return
  const lista = lancamentosDaPlanilha()
  const valores = []
  const params = []
  lista.forEach((item, i) => {
    params.push(item.mes, item.tipo, item.linha, item.valor)
    valores.push(`($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4}, 'planilha')`)
  })
  await consultar(`insert into fin_lancamentos (mes, tipo, linha, valor, origem) values ${valores.join(',')} on conflict do nothing`, params)
  await consultar("insert into fin_config (chave, valor) values ('caixa', $1) on conflict do nothing", [String(CAIXA_INICIAL)])
}
