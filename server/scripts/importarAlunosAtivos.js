// Importa para a tabela acessos os alunos ATIVOS da lista exportada da plataforma de cursos.
//   node --env-file=.env server/scripts/importarAlunosAtivos.js db/alunos-plataforma-2026-10-16.json [--dry]
// O arquivo é uma lista de linhas [id, nome, curso, status, validade "dd/mm/aaaa"] (com dados de alunos:
// fica fora do git). Só entram os "Ativado". Repetir o comando não duplica (chave: plataforma_id).
//
// A lista não tem e-mail. Para ligar o aluno ao e-mail, o nome é comparado com as compras e, depois,
// com os cadastros do site: só vale quando o nome aponta para UM e-mail. O resto entra sem e-mail.
import { readFileSync } from 'node:fs'
import { query } from '../db.js'

const arquivo = process.argv[2]
const dry = process.argv.includes('--dry')
if (!arquivo) {
  console.error('Uso: node --env-file=.env server/scripts/importarAlunosAtivos.js <arquivo.json> [--dry]')
  process.exit(1)
}

const normaliza = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** "16/10/2027" -> fim desse dia em São Paulo (UTC-3). */
function fimDoDia(texto) {
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto).trim())
  if (!partes) return null
  const [, dia, mes, ano] = partes
  return new Date(`${ano}-${mes}-${dia}T23:59:59-03:00`)
}

function indicePorNome(linhas, campoNome, campoEmail, campoTelefone) {
  const mapa = new Map()
  for (const linha of linhas) {
    const email = String(linha[campoEmail] ?? '').trim().toLowerCase()
    const chave = normaliza(linha[campoNome])
    if (!chave || chave.split(' ').length < 2 || !email) continue
    if (!mapa.has(chave)) mapa.set(chave, new Map())
    mapa.get(chave).set(email, String(linha[campoTelefone] ?? '').trim())
  }
  return mapa
}

const bruto = JSON.parse(readFileSync(arquivo, 'utf8'))
const ativos = bruto
  .map(([id, nome, curso, status, validade]) => ({ id: String(id), nome, curso, status, liberadoAte: fimDoDia(validade) }))
  .filter((aluno) => /^ativ/i.test(aluno.status))
console.log(`Lista: ${bruto.length} alunos, ${ativos.length} ativos.`)

const compras = (await query(process.env, `select nome, email, telefone from purchases where coalesce(email, '') <> ''`)).rows
const leads = (await query(process.env, `select nome, email, telefone from leads where coalesce(email, '') <> ''`)).rows
const porCompra = indicePorNome(compras, 'nome', 'email', 'telefone')
const porLead = indicePorNome(leads, 'nome', 'email', 'telefone')

const agora = new Date()
let comEmailCompra = 0
let comEmailLead = 0
let semEmail = 0
let ambiguos = 0
let vencidos = 0
let novos = 0
let atualizados = 0

for (const aluno of ativos) {
  const chave = normaliza(aluno.nome)
  let email = null
  let telefone = null
  for (const [mapa, tipo] of [[porCompra, 'compra'], [porLead, 'lead']]) {
    const achados = mapa.get(chave)
    if (!achados) continue
    if (achados.size === 1) {
      ;[[email, telefone]] = [...achados.entries()]
      if (tipo === 'compra') comEmailCompra += 1
      else comEmailLead += 1
      break
    }
    ambiguos += 1
  }
  if (!email) semEmail += 1
  if (aluno.liberadoAte && aluno.liberadoAte < agora) vencidos += 1
  if (dry) continue

  const dados = [aluno.id, email, aluno.curso, aluno.nome, telefone || null, aluno.liberadoAte]
  const existente = await query(process.env, 'select id from acessos where plataforma_id = $1', [aluno.id])
  if (existente.rows[0]) {
    await query(
      process.env,
      `update acessos set nome = $4, liberado_ate = $6, curso = $3,
              email = coalesce(email, $2), telefone = coalesce(nullif(telefone, ''), $5), atualizado_em = now()
        where plataforma_id = $1`,
      dados,
    )
    atualizados += 1
    continue
  }
  // Mesmo e-mail e curso já registrados pelo dash (compra nova): só ganha o número da plataforma e o prazo.
  const porEmail = email
    ? await query(
        process.env,
        `update acessos set plataforma_id = $1, liberado_ate = greatest(coalesce(liberado_ate, $4), $4), atualizado_em = now()
          where email = $2 and curso = $3 and plataforma_id is null returning id`,
        [aluno.id, email, aluno.curso, aluno.liberadoAte],
      )
    : { rows: [] }
  if (porEmail.rows[0]) {
    atualizados += 1
    continue
  }
  await query(
    process.env,
    `insert into acessos (plataforma_id, email, curso, nome, telefone, liberado_ate, status, origem, parcelas_pagas, ultima_liberacao_em)
     values ($1, $2, $3, $4, $5, $6, 'ativo', 'plataforma', 0, null)
     on conflict (email, curso) do nothing`,
    dados,
  )
  novos += 1
}

console.log(`E-mail achado pelas compras: ${comEmailCompra} · pelos cadastros do site: ${comEmailLead} · sem e-mail: ${semEmail} (nome em mais de um e-mail: ${ambiguos})`)
console.log(`Com validade já vencida (ativos na plataforma, mas datados no passado): ${vencidos}`)
console.log(dry ? 'Simulação: nada foi gravado.' : `Gravado: ${novos} novos, ${atualizados} atualizados.`)
process.exit(0)
