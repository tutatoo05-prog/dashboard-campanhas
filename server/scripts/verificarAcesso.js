// Confere as chaves da liberação de acesso sem tocar em nenhum aluno.
//   node --env-file=.env server/scripts/verificarAcesso.js [--enviar voce@email.com]
// Atenção: o "Run script" do Plesk NÃO carrega as variáveis do app. No servidor, use o botão
// "Conferir conexões" da tela Acessos, que roda com o ambiente real.
import { verificarConexoes } from '../acesso/verificacao.js'

const argumentos = process.argv.slice(2)
const indice = argumentos.indexOf('--enviar')
const emailTeste = indice >= 0 ? argumentos[indice + 1] : ''

const { itens, falhas } = await verificarConexoes(process.env, { emailTeste })
console.log(`\nModo atual: ${process.env.ACESSO_MODO || 'desligado'}`)
let grupo = ''
for (const item of itens) {
  if (item.grupo !== grupo) {
    grupo = item.grupo
    console.log(`\n${grupo}`)
  }
  console.log(`  ${item.nivel === 'ok' ? '✅' : item.nivel === 'erro' ? '❌' : '⚠️ '} ${item.texto}`)
}
console.log(falhas ? `\n${falhas} problema(s) para corrigir antes de ligar.\n` : '\nTudo certo para ligar. ✅\n')
process.exit(falhas ? 1 : 0)
