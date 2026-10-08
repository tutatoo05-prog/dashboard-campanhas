import { handleAuthRequest } from './authHandler.js'
import { handleMetaRequest } from './metaHandler.js'
import { handleReportRequest } from './reportHandler.js'
import { handleDigestRequest } from './digestHandler.js'
import { handleHotmartWebhookRequest } from './hotmartWebhookHandler.js'
import { handlePurchasesRequest } from './purchasesHandler.js'
import { handleLeadsRequest } from './leadsHandler.js'
import { handleGoalsRequest } from './goalsHandler.js'
import { handleRegistrosRequest } from './registrosHandler.js'
import { handleLiveRequest } from './liveHandler.js'
import { requireAuth } from './authHandler.js'
import { applySecurityHeaders } from './security.js'

export function createApiMiddleware(env, { isProduction = false } = {}) {
  return async (req, res, next) => {
    if (!req.url?.startsWith('/api/')) {
      // Página/assets: o Vite (dev) ou o server estático (produção) cuidam
      // dos headers de segurança — aqui aplicá-los quebraria o preamble
      // inline do React Fast Refresh no dev server.
      next()
      return
    }

    applySecurityHeaders(res, { isProduction })

    if (req.url.startsWith('/api/auth')) {
      await handleAuthRequest(req, res, env)
      return
    }

    if (req.url.startsWith('/api/digest')) {
      await handleDigestRequest(req, res, env)
      return
    }

    if (req.url.startsWith('/api/hotmart')) {
      await handleHotmartWebhookRequest(req, res, env)
      return
    }

    if (
      req.url.startsWith('/api/meta') ||
      req.url.startsWith('/api/report') ||
      req.url.startsWith('/api/purchases') ||
      req.url.startsWith('/api/leads') ||
      req.url.startsWith('/api/goals') ||
      req.url.startsWith('/api/registros') ||
      req.url.startsWith('/api/live')
    ) {
      const user = await requireAuth(req, res, env)
      if (!user) return

      if (req.url.startsWith('/api/report')) {
        await handleReportRequest(req, res, env)
        return
      }

      if (req.url.startsWith('/api/purchases')) {
        await handlePurchasesRequest(req, res, env)
        return
      }

      if (req.url.startsWith('/api/leads')) {
        await handleLeadsRequest(req, res, env)
        return
      }

      if (req.url.startsWith('/api/goals')) {
        await handleGoalsRequest(req, res, env)
        return
      }

      if (req.url.startsWith('/api/registros')) {
        await handleRegistrosRequest(req, res)
        return
      }

      if (req.url.startsWith('/api/live')) {
        await handleLiveRequest(req, res, env, user)
        return
      }

      await handleMetaRequest(req, res, env)
      return
    }

    next()
  }
}
