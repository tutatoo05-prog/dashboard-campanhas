import {
  getAdAccounts,
  getDashboardData,
  normalizeAccountId,
  parseAllowedAccountIds,
  resolveAccountId,
} from './metaApi.js'
import { isKnownPeriod, validateCustomRange } from '../src/lib/period.js'

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function readQuery(req) {
  const url = new URL(req.url, 'http://localhost')
  return Object.fromEntries(url.searchParams.entries())
}

function getDefaultAccountId(env) {
  return normalizeAccountId(env.META_AD_ACCOUNT_ID)
}


function findAccountAccess(accounts, accountId) {
  if (!accountId) {
    return { ok: true, accountId: resolveAccountId(accounts, null) }
  }

  const normalized = normalizeAccountId(accountId)
  const hasAccess = accounts.some((account) => account.id === normalized)

  if (!hasAccess) {
    return {
      ok: false,
      accountId: null,
      requestedAccountId: normalized,
    }
  }

  return { ok: true, accountId: normalized }
}

function permissionErrorPayload(requestedAccountId, accounts) {
  return {
    error: `Sem permissão para a conta ${requestedAccountId}.`,
    requestedAccountId,
    accessibleAccounts: accounts,
    hint:
      'No Business Manager, abra a conta academy 01 → Atribuir pessoas/Parceiros → inclua o app. Depois gere um novo token no Meta for Developers.',
  }
}

export async function handleMetaRequest(req, res, env) {
  const token = env.META_ACCESS_TOKEN

  if (!token) {
    return sendJson(res, 503, {
      error: 'META_ACCESS_TOKEN não configurado no arquivo .env',
    })
  }

  const { pathname } = new URL(req.url, 'http://localhost')
  const defaultAccountId = getDefaultAccountId(env)
  const allowedIds = parseAllowedAccountIds(env)

  try {
    if (pathname === '/api/meta/config') {
      const accounts = await getAdAccounts(token, { allowedIds })
      const access = findAccountAccess(accounts, defaultAccountId)

      return sendJson(res, 200, {
        defaultAccountId,
        hasToken: Boolean(token),
        hasAccessToDefault: access.ok,
        accessibleAccounts: accounts,
      })
    }

    if (pathname === '/api/meta/permissions') {
      const accounts = await getAdAccounts(token, { allowedIds })
      const access = findAccountAccess(accounts, defaultAccountId)

      return sendJson(res, 200, {
        defaultAccountId,
        hasAccessToDefault: access.ok,
        accessibleAccounts: accounts,
        message: access.ok
          ? 'Token com acesso à conta configurada no .env.'
          : `Token NÃO tem acesso à conta ${defaultAccountId}. Contas disponíveis: ${accounts.map((a) => `${a.name} (${a.id})`).join(', ') || 'nenhuma'}.`,
      })
    }

    if (pathname === '/api/meta/adaccounts') {
      const accounts = await getAdAccounts(token, { allowedIds })
      const access = findAccountAccess(accounts, defaultAccountId)

      return sendJson(res, 200, {
        accounts,
        defaultAccountId,
        hasAccessToDefault: access.ok,
        permissionWarning: access.ok
          ? null
          : permissionErrorPayload(defaultAccountId, accounts),
      })
    }

    if (pathname === '/api/meta/insights') {
      const query = readQuery(req)
      const period = query.period ?? 'last7'
      const since = query.since || null
      const until = query.until || null
      const accounts = await getAdAccounts(token, { allowedIds })
      const requestedId = normalizeAccountId(query.accountId ?? defaultAccountId)
      const access = findAccountAccess(accounts, requestedId)

      if (!access.ok) {
        return sendJson(res, 403, permissionErrorPayload(requestedId, accounts))
      }

      if (!access.accountId) {
        return sendJson(res, 404, { error: 'Nenhuma conta de anúncios disponível.' })
      }

      if (!isKnownPeriod(period)) {
        return sendJson(res, 400, { error: `Período inválido: ${period}` })
      }

      if (period === 'custom') {
        const validated = validateCustomRange(since, until)
        if (!validated.ok) {
          return sendJson(res, 400, { error: validated.error })
        }
      }

      const rangeOptions = period === 'custom' ? { since, until } : {}
      const data = await getDashboardData(token, access.accountId, period, rangeOptions)
      const account = accounts.find((item) => item.id === access.accountId)

      return sendJson(res, 200, {
        account,
        period,
        ...(period === 'custom' ? { since, until } : {}),
        source: 'meta',
        ...data,
      })
    }

    return sendJson(res, 404, { error: 'Rota não encontrada.' })
  } catch (error) {
    return sendJson(res, 500, {
      error: 'Erro ao consultar a API Meta.',
    })
  }
}
