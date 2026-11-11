import { query } from '../db.js'
import { getSaoPauloClock } from '../clock.js'
import { mesesEntre } from './linhas.js'
import { buscarHotmart, buscarMeta, buscarYoutube, hotmartConfigurada, metaConfigurada, youtubeConfigurado } from './fontes.js'

/** Hotmart: janeiro a outubro ficam como na planilha (valor depositado); daí em diante vem da API (vendas do mês). */
const inicioDaHotmart = (env) => env.FINANCAS_HOTMART_DESDE || '2026-11'

const FONTES = [
  { id: 'hotmart', rotulo: 'Hotmart', tipo: 'receita', linha: 'hotmart', janela: inicioDaHotmart, configurada: hotmartConfigurada, buscar: buscarHotmart, vars: 'HOTMART_CLIENT_ID / HOTMART_CLIENT_SECRET / HOTMART_BASIC' },
  { id: 'meta', rotulo: 'Anúncios (Meta)', tipo: 'custo', linha: 'anuncios', configurada: metaConfigurada, buscar: buscarMeta, vars: 'META_ACCESS_TOKEN / META_ALLOWED_ACCOUNT_IDS' },
  { id: 'youtube', rotulo: 'YouTube', tipo: 'receita', linha: 'youtube', configurada: youtubeConfigurado, buscar: buscarYoutube, vars: 'YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN' },
]

/** Por padrão a sincronização automática só mexe no mês passado e no atual; o histórico anterior é da planilha. */
export function mesPadraoDeInicio() {
  const [ano, mes] = getSaoPauloClock().dateKey.split('-').map(Number)
  const anterior = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, '0')}`
  return anterior
}

export function estadoDasFontes(env) {
  return FONTES.map((f) => ({ id: f.id, rotulo: f.rotulo, configurada: f.configurada(env), vars: f.vars }))
}

let ultimaSincronizacao = { em: null, resultado: [] }
export const ultimaSync = () => ultimaSincronizacao

/**
 * Busca as fontes automáticas e grava mês a mês. Nunca sobrescreve o que foi digitado ou veio da planilha
 * (só atualiza linhas com origem 'auto'); para voltar uma célula ao automático, apague o valor na tela.
 */
export async function sincronizar(env, { desde, consultar = (t, p) => query(env, t, p) } = {}) {
  const ate = getSaoPauloClock().dateKey.slice(0, 7)
  const resultado = []
  for (const fonte of FONTES) {
    const inicio = desde ?? fonte.janela?.(env) ?? mesPadraoDeInicio()
    const meses = mesesEntre(inicio, ate)
    if (!fonte.configurada(env)) {
      resultado.push({ id: fonte.id, rotulo: fonte.rotulo, status: 'sem_credencial', mensagem: `Falta configurar ${fonte.vars} no .env.` })
      continue
    }
    try {
      const { porMes, ignoradas } = await fonte.buscar(env, inicio)
      for (const mes of meses) {
        await consultar(
          `insert into fin_lancamentos (mes, tipo, linha, valor, origem) values ($1, $2, $3, $4, 'auto')
           on conflict (mes, tipo, linha) do update set valor = excluded.valor, atualizado_em = now()
           where fin_lancamentos.origem = 'auto'`,
          [mes, fonte.tipo, fonte.linha, porMes[mes] ?? 0],
        )
      }
      const aviso = ignoradas && (Array.isArray(ignoradas) ? ignoradas.length : ignoradas) ? ' Algumas vendas/contas em moeda estrangeira foram ignoradas.' : ''
      resultado.push({ id: fonte.id, rotulo: fonte.rotulo, status: 'ok', mensagem: `${meses.length} mês(es) atualizados.${aviso}` })
    } catch (erro) {
      console.error(`[financas] falha ao sincronizar ${fonte.id}:`, erro.message || erro)
      resultado.push({ id: fonte.id, rotulo: fonte.rotulo, status: 'erro', mensagem: String(erro.message || erro).slice(0, 300) })
    }
  }
  ultimaSincronizacao = { em: new Date().toISOString(), resultado }
  return ultimaSincronizacao
}

/** Sincroniza ao subir e depois a cada 6 horas (FINANCAS_SYNC_ENABLED=false desliga). */
export function startFinancasSync(env, garantir) {
  if (!env.DATABASE_URL || env.FINANCAS_SYNC_ENABLED === 'false') return
  const rodar = () => garantir(env).then(() => sincronizar(env)).catch((erro) => console.error('[financas] sincronização:', erro.message || erro))
  setTimeout(rodar, 30_000).unref()
  setInterval(rodar, 6 * 60 * 60_000).unref()
}
