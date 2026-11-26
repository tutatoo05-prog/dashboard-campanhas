import * as repoPadrao from './repo.js'
import * as youtubePadrao from './youtube.js'
import * as discordPadrao from './discord.js'
import { cargoDe, cursosEssentials, discordConfigurado, youtubeMembrosConfigurado } from './config.js'

// Sincronização do clube: lê as fontes (Essentials = tabela acessos; YouTube = API de membros), atualiza clube_membros,
// tira do Discord o cargo de quem saiu e grava a fotografia do dia. Roda a cada poucas horas (startClubeSync) e no botão
// "Sincronizar agora" da tela.
//
// TRAVA DE SEGURANÇA: se uma fonte devolve lista VAZIA mas havia gente ativa, não cancelamos ninguém (um erro de API ou
// uma leitura vazia não pode tirar o cargo de todos os membros). Fica registrado como aviso.

const msg = (erro) => String(erro?.message ?? erro).slice(0, 300)

async function sincronizarFonte(env, plataforma, ler, repo) {
  const lista = await ler()
  const ativosAntes = (await repo.chavesAtivas(env, plataforma)).size
  if (lista.length === 0 && ativosAntes > 0) {
    return { aviso: `A fonte devolveu 0 membros, mas há ${ativosAntes} ativos: nada foi cancelado (confira a fonte).`, ativos: ativosAntes, novos: 0, cancelados: 0 }
  }
  const resultado = await repo.aplicarLista(env, plataforma, lista)
  await repo.gravarSnapshot(env, plataforma, resultado)
  return resultado
}

/** Roda tudo e devolve o resultado de cada parte (nunca lança: cada fonte falha sozinha). */
export async function sincronizarClube(env, deps = {}) {
  const repo = deps.repo ?? repoPadrao
  const youtube = deps.youtube ?? youtubePadrao
  const discord = deps.discord ?? discordPadrao
  const resultado = {}

  try {
    resultado.essentials = await sincronizarFonte(env, 'essentials', () => repo.lerEssentials(env, cursosEssentials(env)), repo)
  } catch (erro) {
    resultado.essentials = { erro: msg(erro) }
  }

  if (youtubeMembrosConfigurado(env)) {
    try {
      resultado.youtube = await sincronizarFonte(env, 'youtube', () => youtube.listarMembrosYoutube(env), repo)
    } catch (erro) {
      resultado.youtube = { erro: msg(erro) }
    }
  } else {
    resultado.youtube = { pulado: 'não configurado' }
  }

  if (discordConfigurado(env)) {
    try {
      const pendentes = await repo.pendentesDeRevogar(env)
      let tirados = 0
      const falhas = []
      for (const p of pendentes) {
        const cargo = cargoDe(env, p.plataforma)
        if (!cargo) continue
        try {
          await discord.tirarCargo(env, p.discord_id, cargo)
          await repo.marcarCargoRevogado(env, p.id)
          tirados += 1
        } catch (erro) {
          falhas.push(msg(erro))
        }
      }
      resultado.discord = { pendentes: pendentes.length, cargosRemovidos: tirados, ...(falhas.length ? { erro: falhas[0], falhas: falhas.length } : {}) }
    } catch (erro) {
      resultado.discord = { erro: msg(erro) }
    }
  } else {
    resultado.discord = { pulado: 'não configurado' }
  }

  for (const [fonte, valor] of Object.entries(resultado)) {
    try {
      await repo.gravarEstado(env, fonte, valor)
    } catch (erro) {
      if (!repo.ehFaltaDeTabela?.(erro)) console.error('[clube] não consegui gravar o estado:', msg(erro))
    }
  }
  return resultado
}

const SEIS_HORAS_MS = 6 * 60 * 60_000
let rodando = false

/** Agendador: primeira rodada 2 minutos depois de subir e depois a cada CLUBE_SYNC_HORAS (padrão 6). Sem banco, não liga. */
export function startClubeSync(env) {
  if (!env.DATABASE_URL) return
  const intervalo = Math.max(1, Number(env.CLUBE_SYNC_HORAS) || 6) * 60 * 60_000 || SEIS_HORAS_MS
  const rodar = async () => {
    if (rodando) return
    rodando = true
    try {
      const r = await sincronizarClube(env)
      const erros = Object.entries(r).filter(([, v]) => v?.erro).map(([k, v]) => `${k}: ${v.erro}`)
      if (erros.length) console.warn('[clube] sincronização com erro:', erros.join(' | '))
    } catch (erro) {
      if (!repoPadrao.ehFaltaDeTabela(erro)) console.error('[clube] sincronização falhou:', msg(erro))
    } finally {
      rodando = false
    }
  }
  setTimeout(() => void rodar(), 2 * 60_000).unref()
  setInterval(() => void rodar(), intervalo).unref()
}
