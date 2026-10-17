import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { query } from './db.js'
import { enviarArquivoTelegram, telegramConfigurado } from './alertas.js'
import { avisarProblema } from './acesso/integracoes.js'
import { modoAcesso } from './acesso/motor.js'

/**
 * Backup diário do banco do dash, fora do Supabase (o plano grátis não faz cópia de segurança).
 *
 * O que sai: todas as tabelas do dash em JSON, compactado e CRIPTOGRAFADO (AES-256-GCM) com BACKUP_PASSPHRASE,
 * porque o banco tem e-mails, telefones e CPFs. Vai para duas partes:
 *   1) uma pasta no servidor (BACKUP_DIR, padrão ./backups), guardando os últimos BACKUP_DIAS (padrão 14);
 *   2) o chat do Telegram da equipe (mesmo bot dos alertas), que fica com o histórico completo.
 *   3) opcional: uma pasta do Google Drive (BACKUP_DRIVE_URL + BACKUP_DRIVE_TOKEN, ver scripts/backup-drive.gs).
 * Sem a senha o arquivo não abre: guarde BACKUP_PASSPHRASE também no seu gerenciador de senhas.
 * Para restaurar: server/scripts/restaurarBackup.js (ver DEPLOY.md).
 *
 * Variáveis: BACKUP_PASSPHRASE (obrigatória, 12+ caracteres), BACKUP_HORA (padrão 3, horário de São Paulo),
 * BACKUP_DIR, BACKUP_DIAS, BACKUP_ENABLED (padrão true).
 */

const MAGICA = Buffer.from('TZBK1')
// Dados que se refazem sozinhos ou expiram: não entram (a cópia das planilhas volta em minutos).
const FORA_DO_BACKUP = new Set(['planilhas_copia', 'sessions', 'password_resets'])
const SENHA_MINIMA = 12

export function cifrar(buffer, senha) {
  const sal = randomBytes(16)
  const iv = randomBytes(12)
  const chave = scryptSync(senha, sal, 32)
  const cifra = createCipheriv('aes-256-gcm', chave, iv)
  const dados = Buffer.concat([cifra.update(buffer), cifra.final()])
  return Buffer.concat([MAGICA, sal, iv, cifra.getAuthTag(), dados])
}

export function decifrar(arquivo, senha) {
  if (!arquivo.subarray(0, MAGICA.length).equals(MAGICA)) throw new Error('Este arquivo não é um backup do dash.')
  const base = MAGICA.length
  const sal = arquivo.subarray(base, base + 16)
  const iv = arquivo.subarray(base + 16, base + 28)
  const tag = arquivo.subarray(base + 28, base + 44)
  const dados = arquivo.subarray(base + 44)
  try {
    const decifra = createDecipheriv('aes-256-gcm', scryptSync(senha, sal, 32), iv)
    decifra.setAuthTag(tag)
    return Buffer.concat([decifra.update(dados), decifra.final()])
  } catch {
    throw new Error('Senha errada ou arquivo corrompido.')
  }
}

export async function exportarBanco(consultar) {
  const { rows: tabelas } = await consultar(`select tablename from pg_tables where schemaname = current_schema() order by tablename`)
  const resultado = {}
  for (const { tablename } of tabelas) {
    if (FORA_DO_BACKUP.has(tablename)) continue
    const { rows } = await consultar(`select * from "${String(tablename).replace(/"/g, '""')}"`)
    resultado[tablename] = rows
  }
  return { versao: 1, geradoEm: new Date().toISOString(), tabelas: resultado }
}

/** Data (AAAA-MM-DD) e hora em São Paulo. */
export function dataEHoraEmSaoPaulo(agora = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(agora)
      .map((parte) => [parte.type, parte.value]),
  )
  return { dia: `${partes.year}-${partes.month}-${partes.day}`, hora: Number(partes.hour) }
}

export function driveConfigurado(env) {
  return Boolean(String(env.BACKUP_DRIVE_URL ?? '').trim() && String(env.BACKUP_DRIVE_TOKEN ?? '').trim())
}

/**
 * Manda o backup para uma pasta do Google Drive por um pequeno script do Google (Apps Script, ver scripts/backup-drive.gs).
 * O script confere BACKUP_DRIVE_TOKEN e grava o arquivo na pasta. O arquivo já vai criptografado.
 */
export async function enviarParaDrive(env, { nome, conteudo }, fetchImpl = fetch) {
  const resposta = await fetchImpl(String(env.BACKUP_DRIVE_URL).trim(), {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: String(env.BACKUP_DRIVE_TOKEN).trim(), nome, conteudo: conteudo.toString('base64') }),
    signal: AbortSignal.timeout(60_000),
  })
  const texto = await resposta.text().catch(() => '')
  let dados = null
  try {
    dados = JSON.parse(texto)
  } catch {
    // resposta que não é do script (página de login do Google, por exemplo)
  }
  if (!resposta.ok || !dados?.ok) {
    throw new Error(`Drive não aceitou o backup (${resposta.status}): ${dados?.erro ?? texto.replace(/\s+/g, ' ').slice(0, 120)}`)
  }
  return { enviado: true, id: dados.id }
}

const nomeDoArquivo = (dia) => `dash-${dia}.bkp`

async function aplicarRotacao(dir, manter) {
  const arquivos = (await readdir(dir)).filter((nome) => /^dash-\d{4}-\d{2}-\d{2}\.bkp$/.test(nome)).sort()
  for (const antigo of arquivos.slice(0, Math.max(0, arquivos.length - manter))) await unlink(join(dir, antigo)).catch(() => {})
}

/** Faz um backup agora. Devolve um resumo; lança erro se não conseguiu guardar em lugar nenhum. */
export async function rodarBackup(
  env,
  { consultar = (texto) => query(env, texto), enviarArquivo = enviarArquivoTelegram, enviarDrive = enviarParaDrive, agora = () => new Date() } = {},
) {
  const senha = String(env.BACKUP_PASSPHRASE ?? '')
  if (senha.length < SENHA_MINIMA) throw new Error(`Defina BACKUP_PASSPHRASE com pelo menos ${SENHA_MINIMA} caracteres.`)

  const banco = await exportarBanco(consultar)
  const linhas = Object.values(banco.tabelas).reduce((soma, rows) => soma + rows.length, 0)
  const arquivo = cifrar(gzipSync(Buffer.from(JSON.stringify(banco))), senha)
  const { dia } = dataEHoraEmSaoPaulo(agora())
  const nome = nomeDoArquivo(dia)
  const destinos = []

  const dir = env.BACKUP_DIR || join(process.cwd(), 'backups')
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, nome), arquivo)
    await aplicarRotacao(dir, Math.max(1, Number(env.BACKUP_DIAS) || 14))
    destinos.push('servidor')
  } catch (erro) {
    console.error('[backup] não consegui gravar na pasta do servidor:', erro.message || erro)
  }

  if (telegramConfigurado(env)) {
    try {
      await enviarArquivo(env, { nome, conteudo: arquivo, legenda: `Backup do dash · ${dia} · ${linhas} linhas · criptografado` })
      destinos.push('telegram')
    } catch (erro) {
      console.error('[backup] não consegui enviar ao Telegram:', erro.message || erro)
    }
  }

  if (driveConfigurado(env)) {
    try {
      await enviarDrive(env, { nome, conteudo: arquivo })
      destinos.push('drive')
    } catch (erro) {
      console.error('[backup] não consegui enviar ao Google Drive:', erro.message || erro)
    }
  }

  if (!destinos.length) throw new Error('Gerei o backup mas não consegui guardar em nenhum lugar (servidor e Telegram falharam).')
  return { nome, tabelas: Object.keys(banco.tabelas).length, linhas, bytes: arquivo.length, destinos }
}

export function startBackupScheduler(env, { rodar = rodarBackup, avisar = avisarProblema, agora = () => new Date() } = {}) {
  const ligado = String(env.BACKUP_ENABLED ?? 'true').toLowerCase() !== 'false'
  if (!ligado || !env.DATABASE_URL || modoAcesso(env) === 'desligado') {
    return { stop() {} }
  }
  if (String(env.BACKUP_PASSPHRASE ?? '').length < SENHA_MINIMA) {
    console.warn(`[backup] desligado: defina BACKUP_PASSPHRASE (${SENHA_MINIMA}+ caracteres) no Plesk para ligar o backup diário.`)
    return { stop() {} }
  }
  const hora = Number.isFinite(Number(env.BACKUP_HORA)) && env.BACKUP_HORA !== undefined && env.BACKUP_HORA !== '' ? Number(env.BACKUP_HORA) : 3
  let feitoEm = ''
  let rodando = false

  const conferir = async () => {
    const { dia, hora: horaAtual } = dataEHoraEmSaoPaulo(agora())
    if (rodando || feitoEm === dia || horaAtual < hora) return
    rodando = true
    try {
      const dir = env.BACKUP_DIR || join(process.cwd(), 'backups')
      const jaExiste = await readdir(dir).then((nomes) => nomes.includes(nomeDoArquivo(dia))).catch(() => false)
      if (!jaExiste) {
        const resumo = await rodar(env)
        console.log(`[backup] ${resumo.nome}: ${resumo.linhas} linhas em ${resumo.tabelas} tabelas → ${resumo.destinos.join(' + ')}`)
      }
      feitoEm = dia
    } catch (erro) {
      console.error('[backup] falhou:', erro.message || erro)
      await avisar(env, `🔴 O backup diário do dash falhou: ${String(erro.message || erro).slice(0, 300)}`)
      feitoEm = dia // avisou uma vez; tenta de novo amanhã (ou pelo botão em Acessos)
    } finally {
      rodando = false
    }
  }

  console.log(`[backup] backup diário ligado (depois das ${hora}h, horário de São Paulo)`)
  const timer = setInterval(() => void conferir(), 10 * 60_000)
  const inicio = setTimeout(() => void conferir(), 5 * 60_000)
  timer.unref?.()
  inicio.unref?.()
  return { stop: () => { clearInterval(timer); clearTimeout(inicio) } }
}
