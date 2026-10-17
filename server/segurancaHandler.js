import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { query } from './db.js'
import { isAdmin } from './roles.js'
import { getSessionToken, limparCacheDeSessoes } from './session.js'
import { driveConfigurado, rodarBackup } from './backup.js'
import { estatisticasDoWebhook } from './hotmartWebhookHandler.js'
import { telegramConfigurado } from './alertas.js'
import { avisarProblema } from './acesso/integracoes.js'
import { modoAcesso } from './acesso/motor.js'

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

const SENHA_BACKUP_MINIMA = 12

async function arquivosDeBackup(env) {
  const dir = env.BACKUP_DIR || join(process.cwd(), 'backups')
  try {
    const nomes = (await readdir(dir)).filter((nome) => /^dash-\d{4}-\d{2}-\d{2}\.bkp$/.test(nome)).sort().reverse()
    const arquivos = []
    for (const nome of nomes.slice(0, 30)) {
      const info = await stat(join(dir, nome))
      arquivos.push({ nome, bytes: info.size, em: info.mtime.toISOString() })
    }
    return arquivos
  } catch {
    return []
  }
}

/** Últimas linhas do registro do deploy (deploy.log, gravado por scripts/deploy-plesk.sh), sem nada sensível. */
export async function lerUltimoDeploy(env, { dir = env.DEPLOY_LOG_DIR || process.cwd(), linhas = 40 } = {}) {
  try {
    const arquivo = join(dir, 'deploy.log')
    const [texto, info] = await Promise.all([readFile(arquivo, 'utf8'), stat(arquivo)])
    const limpo = texto
      .replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '') // cores do terminal
      .split('\n')
      .map((linha) => linha.trimEnd())
      .filter(Boolean)
    const fim = limpo.slice(-linhas)
    const ultima = fim[fim.length - 1] ?? ''
    const estado = /Deploy concluído/.test(ultima) ? 'ok' : /ERRO|not found/i.test(fim.join('\n')) ? 'erro' : 'rodando'
    return { em: info.mtime.toISOString(), estado, linhas: fim }
  } catch {
    return null
  }
}

/** O que já chegou da Hotmart (banco) e o que o webhook recusou/aceitou desde que o app subiu (memória). */
export async function resumoDoWebhook(env, { consultar = (texto) => query(env, texto), estatisticas = estatisticasDoWebhook } = {}) {
  let banco = { total: 0, ultimoEm: null }
  try {
    const { rows } = await consultar('select count(*)::int total, max(recebido_em) ultimo from hotmart_eventos')
    banco = { total: rows[0]?.total ?? 0, ultimoEm: rows[0]?.ultimo ?? null }
  } catch {
    // tabela ainda não existe: segue com zeros
  }
  const memoria = estatisticas()
  return { ...banco, recusadas: memoria.recusadas, ultimaRecusaEm: memoria.ultimaRecusaEm, aceitas: memoria.aceitas, ultimaAceitaEm: memoria.ultimaAceitaEm, hottokConfigurado: Boolean(String(env.HOTMART_HOTTOK ?? '').trim()) }
}

/** Só diz se cada ajuste está feito. Nunca devolve valor de chave, token ou senha. */
export function checklistDeConfiguracao(env) {
  const porta = (() => {
    try {
      return new URL(env.DATABASE_URL).port
    } catch {
      return ''
    }
  })()
  const tem = (nome) => Boolean(String(env[nome] ?? '').trim())
  return [
    { id: 'porta-6543', rotulo: 'Banco pela porta 6543 (modo transação)', ok: porta === '6543', dica: 'Evita o limite de 15 conexões do Supabase. Ajuste a porta no DATABASE_URL.' },
    { id: 'acesso-ativo', rotulo: 'Liberação de acesso em modo ativo', ok: modoAcesso(env) === 'ativo', dica: 'ACESSO_MODO=ativo no Plesk.' },
    { id: 'hottok', rotulo: 'Webhook da Hotmart confere o código de segurança (hottok)', ok: tem('HOTMART_HOTTOK'), dica: 'Sem HOTMART_HOTTOK qualquer um poderia mandar eventos falsos.' },
    { id: 'telegram', rotulo: 'Avisos de problema no Telegram', ok: telegramConfigurado(env), dica: 'TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID no Plesk.' },
    { id: 'backup', rotulo: 'Backup diário ligado', ok: String(env.BACKUP_PASSPHRASE ?? '').length >= SENHA_BACKUP_MINIMA && String(env.BACKUP_ENABLED ?? 'true').toLowerCase() !== 'false', dica: 'BACKUP_PASSPHRASE com 12+ caracteres no Plesk.' },
    { id: 'vigia', rotulo: 'Vigia da liberação de acesso', ok: String(env.VIGIA_ENABLED ?? 'true').toLowerCase() !== 'false' && modoAcesso(env) === 'ativo', dica: 'Roda com ACESSO_MODO=ativo (VIGIA_ENABLED=false desliga).' },
    { id: 'deploy', rotulo: 'Deploy automático ligado', ok: String(env.DEPLOY_TOKEN ?? '').length >= 16, dica: 'DEPLOY_TOKEN com 16+ caracteres no Plesk (ver DEPLOY.md).' },
    { id: 'brevo', rotulo: 'E-mail (Brevo) configurado', ok: tem('BREVO_API_KEY') && tem('BREVO_REMETENTE_EMAIL'), dica: 'BREVO_API_KEY e BREVO_REMETENTE_EMAIL.' },
    { id: 'whatsapp', rotulo: 'WhatsApp (Evolution) configurado', ok: tem('EVOLUTION_URL') && tem('EVOLUTION_ALUNO_APIKEY') && tem('EVOLUTION_EQUIPE_APIKEY'), dica: 'EVOLUTION_URL e as chaves do aluno e da equipe.' },
  ]
}

/**
 * /api/seguranca/* — só admin.
 *   GET  /api/seguranca/resumo
 *   POST /api/seguranca/backup            (faz o backup agora: servidor + Telegram)
 *   POST /api/seguranca/alerta-teste      (manda um aviso de teste pelo canal de alertas)
 *   POST /api/seguranca/encerrar-sessoes  (derruba todos os logins, menos o seu)
 */
export async function handleSegurancaRequest(req, res, env, user) {
  if (!isAdmin(user)) return sendJson(res, 403, { error: 'Só admin.' })
  const caminho = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '')

  try {
    if (req.method === 'GET' && caminho === '/api/seguranca/resumo') {
      const meuToken = getSessionToken(req)
      const [sessoes, acoes, arquivos] = await Promise.all([
        query(
          env,
          `select s.expires_at, u.nome, u.email, u.cargo, (s.token = $1) as atual
             from sessions s join users u on u.id = s.user_id
            where s.expires_at > now() order by s.expires_at desc limit 100`,
          [meuToken ?? ''],
        ),
        query(
          env,
          `select created_at, user_email, campaign_name, action, ok from meta_action_log order by created_at desc limit 20`,
        ).catch((erro) => {
          if (erro?.code === '42P01') return { rows: [] }
          throw erro
        }),
        arquivosDeBackup(env),
      ])
      const canal = telegramConfigurado(env) ? 'telegram' : env.ACESSO_AVISO_NUMERO ? 'whatsapp' : 'nenhum'
      return sendJson(res, 200, {
        backup: {
          ligado: String(env.BACKUP_PASSPHRASE ?? '').length >= SENHA_BACKUP_MINIMA && String(env.BACKUP_ENABLED ?? 'true').toLowerCase() !== 'false',
          hora: Number(env.BACKUP_HORA) || 3,
          dias: Number(env.BACKUP_DIAS) || 14,
          noTelegram: telegramConfigurado(env),
          noDrive: driveConfigurado(env),
          arquivos,
        },
        avisos: { canal },
        sessoes: sessoes.rows.map((linha) => ({
          nome: linha.nome,
          email: linha.email,
          cargo: linha.cargo,
          // A sessão dura 30 dias: entrou = fim - 30 dias.
          entrouEm: new Date(new Date(linha.expires_at).getTime() - 30 * 24 * 3600_000).toISOString(),
          expiraEm: linha.expires_at,
          atual: Boolean(linha.atual),
        })),
        acoes: acoes.rows.map((linha) => ({ em: linha.created_at, usuario: linha.user_email, campanha: linha.campaign_name, acao: linha.action, ok: linha.ok })),
        configuracao: checklistDeConfiguracao(env),
        deploy: await lerUltimoDeploy(env),
        hotmart: await resumoDoWebhook(env),
      })
    }

    if (req.method === 'POST' && caminho === '/api/seguranca/backup') {
      try {
        return sendJson(res, 200, await rodarBackup(env))
      } catch (erro) {
        return sendJson(res, 500, { error: String(erro.message || erro) })
      }
    }

    if (req.method === 'POST' && caminho === '/api/seguranca/alerta-teste') {
      const canal = telegramConfigurado(env) ? 'Telegram' : 'WhatsApp da equipe'
      await avisarProblema(env, '✅ Teste do dash: se você está lendo isto, os avisos de problema chegam aqui.')
      return sendJson(res, 200, { canal })
    }

    if (req.method === 'POST' && caminho === '/api/seguranca/encerrar-sessoes') {
      const meuToken = getSessionToken(req)
      const { rowCount } = await query(env, `delete from sessions where token <> $1`, [meuToken ?? ''])
      limparCacheDeSessoes()
      return sendJson(res, 200, { encerradas: rowCount ?? 0 })
    }

    return sendJson(res, 404, { error: 'Rota não encontrada.' })
  } catch (erro) {
    console.error('[seguranca]', erro.message || erro)
    return sendJson(res, 500, { error: 'Não consegui ler os dados de segurança agora.' })
  }
}
