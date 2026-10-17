import { handleAuthRequest } from './authHandler.js'
import { handleMetaRequest } from './metaHandler.js'
import { handleReportRequest } from './reportHandler.js'
import { handleDigestRequest } from './digestHandler.js'
import { handleHotmartWebhookRequest } from './hotmartWebhookHandler.js'
import { handlePurchasesRequest } from './purchasesHandler.js'
import { handleLeadsRequest } from './leadsHandler.js'
import { handleGoalsRequest } from './goalsHandler.js'
import { handleRegistrosRequest } from './registrosHandler.js'
import { handleHotmartEventsRequest } from './hotmartEvents.js'
import { handleLiveRequest } from './liveHandler.js'
import { handleUsersRequest } from './usersHandler.js'
import { handleActionsRequest } from './actionsHandler.js'
import { handleMetaWriteRequest } from './metaWrite.js'
import { handleAcessosRequest } from './acesso/handler.js'
import { handleSegurancaRequest } from './segurancaHandler.js'
import { handleFichasRequest } from './fichas.js'
import { handleSaudeRequest } from './saude.js'
import { handleDeployRequest } from './deploy.js'
import { requireAuth } from './authHandler.js'
import { canAccessApi, isAdmin } from './roles.js'
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

    if (req.url.startsWith('/api/saude')) {
      await handleSaudeRequest(req, res, env)
      return
    }

    // Chamado pelo Plesk depois de puxar o código (protegido por DEPLOY_TOKEN, ver server/deploy.js).
    if (req.url.startsWith('/api/deploy')) {
      await handleDeployRequest(req, res, env)
      return
    }

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
      req.url.startsWith('/api/eventos-hotmart') ||
      req.url.startsWith('/api/acessos') ||
      req.url.startsWith('/api/seguranca') ||
      req.url.startsWith('/api/fichas') ||
      req.url.startsWith('/api/live') ||
      req.url.startsWith('/api/actions') ||
      req.url.startsWith('/api/users')
    ) {
      const user = await requireAuth(req, res, env)
      if (!user) return

      // Cargos: "usuario" só acessa Leads (ver canAccessApi); admin acessa tudo.
      // Gerar relatório (POST) não altera dados, então não conta como escrita.
      if (!canAccessApi(user, req.method, req.url)) {
        res.statusCode = 403
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Seu cargo não tem acesso a este recurso.', code: 'FORBIDDEN' }))
        return
      }

      const isWrite = req.method !== 'GET' && req.method !== 'HEAD'
      if (
        (req.url.startsWith('/api/users') || req.url.startsWith('/api/seguranca') || (isWrite && !req.url.startsWith('/api/report'))) &&
        !isAdmin(user)
      ) {
        res.statusCode = 403
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Apenas administradores podem fazer isso.', code: 'FORBIDDEN' }))
        return
      }

      if (req.url.startsWith('/api/meta/campaigns/')) {
        await handleMetaWriteRequest(req, res, env, user)
        return
      }

      if (req.url.startsWith('/api/actions')) {
        await handleActionsRequest(req, res, env, user)
        return
      }

      if (req.url.startsWith('/api/users')) {
        await handleUsersRequest(req, res, env, user)
        return
      }

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
        await handleRegistrosRequest(req, res, env)
        return
      }

      if (req.url.startsWith('/api/eventos-hotmart')) {
        await handleHotmartEventsRequest(req, res, env)
        return
      }

      if (req.url.startsWith('/api/fichas')) {
        await handleFichasRequest(req, res, env, user)
        return
      }

      if (req.url.startsWith('/api/seguranca')) {
        await handleSegurancaRequest(req, res, env, user)
        return
      }

      if (req.url.startsWith('/api/acessos')) {
        await handleAcessosRequest(req, res, env, user)
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
