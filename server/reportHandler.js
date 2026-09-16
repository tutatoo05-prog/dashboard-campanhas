import { readRequestBody } from './readBody.js'

const DEFAULT_WEBHOOK_URL =
  'https://n8n.tuzinho.app/webhook/relatorio-campanhas'

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function extractReportContent(data) {
  if (!data) return null

  if (typeof data === 'string') return data

  const candidates = [
    data.report,
    data.html,
    data.content,
    data.text,
    data.message,
    data.output,
    data.result,
  ]

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }

  if (Array.isArray(data) && data.length) {
    return extractReportContent(data[0])
  }

  return null
}

function looksLikeHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

function isWorkflowStartedResponse(text, parsed) {
  const candidates = []

  if (text?.trim()) candidates.push(text.trim())

  if (parsed && typeof parsed === 'object') {
    for (const key of ['message', 'status', 'text', 'output']) {
      if (typeof parsed[key] === 'string') candidates.push(parsed[key])
    }
  }

  return candidates.some((value) =>
    /workflow was started|workflow has been started|execução iniciada|fluxo iniciado/i.test(
      value,
    ),
  )
}

export async function handleReportRequest(req, res, env) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Método não permitido.' })
  }

  const webhookUrl = env.N8N_WEBHOOK_URL || DEFAULT_WEBHOOK_URL

  try {
    const rawBody = await readRequestBody(req)
    const incoming = rawBody ? JSON.parse(rawBody) : {}
    const payload = { ...incoming, type: 'dash' }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, text/html',
      },
      body: JSON.stringify(payload),
    })

    const contentType = response.headers.get('content-type') ?? ''
    const responseText = await response.text()

    if (!response.ok) {
      return sendJson(res, response.status, {
        error: `Webhook n8n retornou erro (${response.status}).`,
        details: responseText.slice(0, 500),
      })
    }

    let parsed = null

    if (contentType.includes('application/json') && responseText) {
      try {
        parsed = JSON.parse(responseText)
      } catch {
        parsed = null
      }
    }

    if (isWorkflowStartedResponse(responseText, parsed)) {
      return sendJson(res, 200, {
        success: true,
        format: 'confirmation',
        message: 'Relatório solicitado com sucesso.',
      })
    }

    const reportContent = extractReportContent(parsed) ?? responseText.trim()

    if (!reportContent) {
      return sendJson(res, 200, {
        success: true,
        format: 'confirmation',
        message: 'Relatório solicitado com sucesso.',
      })
    }

    return sendJson(res, 200, {
      success: true,
      format: reportContent && looksLikeHtml(reportContent) ? 'html' : 'text',
      report: reportContent,
    })
  } catch (error) {
    if (error.message === 'Payload too large') {
      return sendJson(res, 413, { error: 'Requisição muito grande.' })
    }
    return sendJson(res, 500, {
      error: 'Erro ao enviar dados para o webhook n8n.',
    })
  }
}
