import {
  TIMEZONE,
  addLog,
  applyFlag,
  computeDesired,
  getLiveConfig,
  loadSettings,
  saveSettings,
  setLastError,
  withLiveLock,
} from './live.js'

const DAY_LABELS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function describeWindow(window) {
  return `${DAY_LABELS[window.day]} ${window.start}–${window.end}`
}

/**
 * Reconcilia o arquivo da Live com o estado desejado (manual + agenda).
 * Checa a cada 30s e também na inicialização — idempotente: só mexe no
 * arquivo quando o estado real difere do desejado.
 */
export function startLiveScheduler(env) {
  const config = getLiveConfig(env)

  if (!config.flagPath) {
    console.warn(`[live] scheduler não iniciado: ${config.error}`)
    return { stop() {} }
  }

  if (!env.DATABASE_URL) {
    console.warn('[live] scheduler não iniciado: DATABASE_URL ausente')
    return { stop() {} }
  }

  // Última configuração lida com sucesso: se o banco cair, o prazo manual
  // continua sendo respeitado (a Live não fica ligada esquecida).
  let cached = null
  let lastLoggedError = null

  console.log(`[live] scheduler ativo · ${config.flagPath} (${TIMEZONE})`)

  const tick = () =>
    withLiveLock(async () => {
      const now = new Date()
      let settings
      let fromDb = false

      try {
        settings = await loadSettings(env)
        cached = settings
        fromDb = true
      } catch (error) {
        console.error('[live] falha ao ler configuração no banco:', error.message || error)
        if (!cached) {
          setLastError('Não consegui ler a configuração da Live no banco de dados.')
          return
        }
        settings = cached
      }

      const desired = computeDesired(settings, now)

      try {
        const result = await applyFlag(config.flagPath, desired.on)
        lastLoggedError = null

        if (result.changed) {
          let detail
          if (desired.on) {
            detail = desired.activeWindow && desired.sources.includes('agenda')
              ? `Janela da agenda (${describeWindow(desired.activeWindow.window)})`
              : 'Reaplicado: ligada manualmente e ainda dentro do prazo'
          } else {
            detail = settings.manualOn ? 'Prazo da ligação manual encerrado' : 'Fora da agenda / prazo encerrado'
          }
          const source = desired.on && desired.sources.includes('agenda') ? 'agenda' : 'sistema'
          console.log(`[live] ${desired.on ? 'LIGADA' : 'DESLIGADA'} automaticamente · ${detail}`)
          await addLog(env, { action: desired.on ? 'ligou' : 'desligou', source, detail })
        }
      } catch (error) {
        console.error('[live]', error.message)
        if (lastLoggedError !== error.message) {
          lastLoggedError = error.message
          await addLog(env, { action: 'erro', source: 'sistema', detail: error.message, ok: false })
        }
        return
      }

      // Faxina: limpa ligação manual vencida e pausa expirada.
      const manualExpired = settings.manualOn && (!settings.manualUntil || settings.manualUntil <= now)
      const pauseExpired = settings.pausedUntil && settings.pausedUntil <= now
      if (fromDb && (manualExpired || pauseExpired)) {
        const next = {
          ...settings,
          manualOn: manualExpired ? false : settings.manualOn,
          pausedUntil: pauseExpired ? null : settings.pausedUntil,
        }
        try {
          await saveSettings(env, next)
          cached = next
        } catch (error) {
          console.error('[live] falha ao limpar estado vencido:', error.message || error)
        }
      }
    })

  const timer = setInterval(() => {
    tick().catch((error) => {
      console.error('[live] erro no tick:', error)
    })
  }, 30_000)

  if (typeof timer.unref === 'function') timer.unref()

  // Reconcilia já na inicialização (reinício do app no Plesk).
  tick().catch((error) => {
    console.error('[live] erro na reconciliação inicial:', error)
  })

  return {
    stop() {
      clearInterval(timer)
    },
  }
}
