import { query } from './db.js'
import { getAdAccounts, getDashboardData, getInsights, parseAllowedAccountIds } from './metaApi.js'
import { resolveDigestAccountIds } from './digest.js'
import { evaluateRules } from './rulesEval.js'
import { getSaoPauloClock } from './clock.js'

/**
 * Avalia as regras ligadas em cada conta do boletim (DIGEST_ACCOUNT_IDS) e grava os alertas do dia.
 * Alerta = um por regra + conta + campanha + dia; quando a condição passa, o alerta é "limpo" (cleared).
 * Chamado pelo agendador (a cada 15 min) e pelo botão "Avaliar agora" da tela.
 */
export async function runRulesEvaluation(env) {
  const token = env.META_ACCESS_TOKEN
  if (!token) throw new Error('META_ACCESS_TOKEN não configurado.')

  const rules = (await query(env, 'select id, type, params from automation_rules where enabled')).rows
  const clock = getSaoPauloClock()
  const day = clock.dateKey
  const month = day.slice(0, 7)
  const summary = { accounts: 0, triggered: 0, newAlerts: 0, errors: [] }

  if (!rules.length) {
    await query(env, 'update rule_alerts set cleared = true where day = $1 and not cleared', [day])
    return summary
  }

  const catalog = await getAdAccounts(token, { allowedIds: parseAllowedAccountIds(env) })
  const accountIds = resolveDigestAccountIds(env).filter((id) => catalog.some((account) => account.id === id))
  const needsBudget = rules.some((rule) => rule.type === 'budget_used')

  for (const accountId of accountIds) {
    try {
      const data = await getDashboardData(token, accountId, 'last7')

      let monthSpend = null
      let spendTarget = null
      if (needsBudget) {
        const goal = await query(env, 'select spend_target from goals where account_id = $1 and month = $2', [accountId, month])
        spendTarget = goal.rows[0]?.spend_target != null ? Number(goal.rows[0].spend_target) : null
        if (spendTarget) {
          const monthCampaigns = await getInsights(token, accountId, 'this_month', 'campaigns')
          monthSpend = monthCampaigns.reduce((sum, item) => sum + (item.spend || 0), 0)
        }
      }

      const candidates = evaluateRules(rules, {
        accountId,
        campaigns: data.campaigns ?? [],
        dailyByCampaign: data.dailyByCampaign ?? {},
        monthSpend,
        spendTarget,
        today: day,
      })

      for (const candidate of candidates) {
        const result = await query(
          env,
          `insert into rule_alerts (rule_id, account_id, campaign_key, campaign_id, campaign_name, day, title, detail, money)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           on conflict (rule_id, account_id, campaign_key, day)
           do update set title = excluded.title, detail = excluded.detail, money = excluded.money, cleared = false
           returning (xmax = 0) as inserted`,
          [
            candidate.ruleId,
            accountId,
            candidate.campaignKey,
            candidate.campaignId,
            candidate.campaignName,
            day,
            candidate.title,
            candidate.detail,
            candidate.money,
          ],
        )
        if (result.rows[0]?.inserted) summary.newAlerts += 1
      }
      summary.triggered += candidates.length

      // O que não disparou nesta rodada deixa de aparecer na tela.
      for (const rule of rules) {
        const keys = candidates.filter((candidate) => candidate.ruleId === rule.id).map((candidate) => candidate.campaignKey)
        await query(
          env,
          `update rule_alerts set cleared = true
            where rule_id = $1 and account_id = $2 and day = $3 and not cleared and not (campaign_key = any($4::text[]))`,
          [rule.id, accountId, day, keys],
        )
      }

      summary.accounts += 1
    } catch (error) {
      summary.errors.push({ accountId, error: error.message || String(error) })
      console.error(`[regras] falha na conta ${accountId}:`, error.message || error)
    }
  }

  return summary
}
