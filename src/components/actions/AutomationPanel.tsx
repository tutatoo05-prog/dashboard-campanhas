import { useState } from 'react'
import {
  createRule,
  deleteRule,
  runRules,
  saveNotificationSettings,
  updateRule,
  type ActionsState,
  type AutomationRule,
  type NotificationSettings,
  type RuleType,
} from '@/services/actionsService.ts'
import { RULE_DEFAULTS, RULE_LABELS, describeRule } from '@/lib/ruleText.ts'

interface AutomationPanelProps {
  state: ActionsState
  /** Recarrega o estado depois de qualquer mudança. */
  onChanged: () => void
}

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" disabled={disabled} onClick={onChange} />
  )
}

/** Regras automáticas e avisos fora do painel (e-mail diário e WhatsApp). */
export function AutomationPanel({ state, onChanged }: AutomationPanelProps) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [adding, setAdding] = useState(false)
  const [type, setType] = useState<RuleType>('cpl_above_avg')
  const [params, setParams] = useState<AutomationRule['params']>(RULE_DEFAULTS.cpl_above_avg)

  async function run<T>(task: () => Promise<T>, okText?: string): Promise<T | null> {
    setBusy(true)
    setMessage(null)
    try {
      const result = await task()
      if (okText) setMessage({ tone: 'ok', text: okText })
      onChanged()
      return result
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível concluir.' })
      return null
    } finally {
      setBusy(false)
    }
  }

  function changeType(next: RuleType) {
    setType(next)
    setParams(RULE_DEFAULTS[next])
  }

  async function save(patch: Partial<NotificationSettings>) {
    await run(() => saveNotificationSettings(patch))
  }

  const { settings, delivery } = state

  return (
    <section className="surface-card automation" aria-label="Regras e avisos">
      <div className="automation-head">
        <div>
          <p className="section-label">Automático</p>
          <h3 className="section-title mt-1">Regras e avisos</h3>
          <p className="small-note">As regras são avaliadas a cada 15 minutos no servidor. Quando uma dispara, vira uma ação na lista acima.</p>
        </div>
        <button
          type="button"
          className="chip-btn"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const result = await runRules()
              const errors = result.errors.length ? ` · ${result.errors.length} conta(s) com erro` : ''
              setMessage({
                tone: result.errors.length ? 'error' : 'ok',
                text: `Avaliei ${result.accounts} conta(s): ${result.triggered} alerta(s), ${result.newAlerts} novo(s)${errors}.`,
              })
            })
          }
        >
          <i className="fa-solid fa-rotate" /> Avaliar agora
        </button>
      </div>

      <ul className="rule-list">
        {state.rules.map((rule) => (
          <li key={rule.id} className={`rule-row ${rule.enabled ? '' : 'rule-off'}`}>
            <Switch
              checked={rule.enabled}
              disabled={busy}
              label={`${rule.enabled ? 'Desligar' : 'Ligar'} regra: ${RULE_LABELS[rule.type]}`}
              onChange={() => run(() => updateRule(rule.id, { enabled: !rule.enabled }))}
            />
            <span className="rule-text">{describeRule(rule)}</span>
            <button
              type="button"
              className="rule-delete"
              aria-label={`Apagar regra: ${RULE_LABELS[rule.type]}`}
              disabled={busy}
              onClick={() => {
                if (window.confirm('Apagar esta regra? Os alertas dela também somem.')) void run(() => deleteRule(rule.id))
              }}
            >
              <i className="fa-solid fa-trash" />
            </button>
          </li>
        ))}
        {!state.rules.length && <li className="small-note">Nenhuma regra ainda.</li>}
      </ul>

      {adding ? (
        <form
          className="rule-form"
          onSubmit={(event) => {
            event.preventDefault()
            void run(async () => {
              await createRule(type, params)
              setAdding(false)
            }, 'Regra criada.')
          }}
        >
          <select className="plan-select" value={type} onChange={(event) => changeType(event.target.value as RuleType)} aria-label="Tipo de regra">
            {(Object.keys(RULE_LABELS) as RuleType[]).map((value) => (
              <option key={value} value={value}>
                {RULE_LABELS[value]}
              </option>
            ))}
          </select>

          {type === 'cpl_above_avg' && (
            <>
              <label className="rule-field">
                acima da média em
                <input type="number" min={5} max={300} value={params.pct ?? ''} onChange={(event) => setParams({ ...params, pct: Number(event.target.value) })} />%
              </label>
              <label className="rule-field">
                por
                <input type="number" min={1} max={7} value={params.days ?? ''} onChange={(event) => setParams({ ...params, days: Number(event.target.value) })} />
                dias seguidos
              </label>
            </>
          )}
          {type === 'spend_no_leads' && (
            <label className="rule-field">
              gastou R$
              <input type="number" min={5} max={100000} value={params.amount ?? ''} onChange={(event) => setParams({ ...params, amount: Number(event.target.value) })} />
              sem lead
            </label>
          )}
          {type === 'budget_used' && (
            <label className="rule-field">
              verba usada acima de
              <input type="number" min={10} max={200} value={params.pct ?? ''} onChange={(event) => setParams({ ...params, pct: Number(event.target.value) })} />% da meta
            </label>
          )}

          <button type="submit" className="btn-gold" disabled={busy}>
            Criar regra
          </button>
          <button type="button" className="chip-btn" onClick={() => setAdding(false)}>
            Cancelar
          </button>
        </form>
      ) : (
        <button type="button" className="chip-btn rule-add" onClick={() => setAdding(true)}>
          <i className="fa-solid fa-plus" /> Nova regra
        </button>
      )}

      <div className="notify-box">
        <p className="section-label">Avisos fora do painel</p>
        <div className="rule-row">
          <Switch
            checked={settings.emailDaily}
            disabled={busy}
            label="Resumo diário por e-mail"
            onChange={() => save({ emailDaily: !settings.emailDaily })}
          />
          <span className="rule-text">
            Resumo diário por e-mail para os administradores, às
            <select
              className="plan-select hour-select"
              value={settings.emailHour}
              disabled={busy}
              aria-label="Hora do resumo por e-mail"
              onChange={(event) => save({ emailHour: Number(event.target.value) })}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, '0')}h
                </option>
              ))}
            </select>
            (horário de São Paulo)
          </span>
        </div>
        <div className="rule-row">
          <Switch
            checked={settings.whatsappUrgent}
            disabled={busy}
            label="Alertas urgentes no WhatsApp"
            onChange={() => save({ whatsappUrgent: !settings.whatsappUrgent })}
          />
          <span className="rule-text">Avisar no WhatsApp quando uma regra disparar</span>
        </div>
        {!delivery.webhookConfigured && (settings.emailDaily || settings.whatsappUrgent) && (
          <p className="notify-warning" role="alert">
            <i className="fa-solid fa-triangle-exclamation" /> Os avisos só saem depois que o servidor tiver a variável{' '}
            <code>N8N_ALERT_WEBHOOK_URL</code> apontando para o workflow do n8n.
          </p>
        )}
      </div>

      {message && (
        <p className={message.tone === 'ok' ? 'automation-ok' : 'automation-error'} role={message.tone === 'ok' ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}
    </section>
  )
}
