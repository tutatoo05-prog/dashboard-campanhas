// Gera a prévia dos e-mails de sequência para revisão:
//   node server/scripts/previaEmails.js
// Escreve preview-email/sequencias/*.html (abrir no navegador) e docs/emails-sequencias.md (textos e quando saem).
import { mkdir, writeFile } from 'node:fs/promises'
import { EMAILS, montarEmail } from '../emails/conteudo.js'

const exemplo = {
  nome: 'Ana Souza',
  curso: 'Essentials',
  pixCodigo: '00020126580014br.gov.bcb.pix0136exemplo-de-codigo-pix-copia-e-cola',
  linkPagamento: 'https://exemplo.hotmart.com/boleto',
}

const quando = (ms) => {
  const h = ms / 3_600_000
  return h >= 24 && h % 24 === 0 ? `${h / 24} dia(s)` : `${h} h`
}
const GRUPOS = {
  carrinho: 'Carrinho abandonado (depois do e-mail imediato que já existe)',
  pagamento: 'Pix/boleto gerado e pagamento expirado',
  onboarding: 'Onboarding (depois da compra aprovada)',
}
const REFERENCIA = {
  carrinho: 'depois do evento de carrinho abandonado',
  pagamento: 'depois do evento (Pix/boleto gerado ou expirado)',
  onboarding: 'depois da liberação do acesso',
}

await mkdir('preview-email/sequencias', { recursive: true })
await mkdir('docs', { recursive: true })

let md = `# E-mails de sequência: textos para revisão\n\nGerado por \`node server/scripts/previaEmails.js\`. Os textos moram em \`server/emails/conteudo.js\`; edite lá (ou me diga o que mudar).\n\nPrévia visual: abra os arquivos de \`preview-email/sequencias/\` no navegador.\n\nRegras da fila: teto de 180 por dia (de 300 da Brevo), só entre 8h e 21h (São Paulo), Pix/boleto saem antes de conversão/onboarding, quem comprou deixa de receber os e-mails de carrinho e de pagamento.\n`
for (const [cenario, titulo] of Object.entries(GRUPOS)) {
  md += `\n## ${titulo}\n`
  for (const [chave, e] of Object.entries(EMAILS).filter(([, e]) => e.cenario === cenario)) {
    const { assunto, html } = montarEmail(chave, exemplo)
    await writeFile(`preview-email/sequencias/${chave}.html`, html)
    const vars = { nome: 'Ana', curso: 'Essentials', linkCheckout: '', linkPagamento: '', linkLogin: '', linkSuporte: '', pixCodigo: '' }
    md += `\n### ${chave} — sai ${quando(e.atrasoMs)} ${REFERENCIA[cenario]}\n- **Assunto:** ${assunto}\n- **Título:** ${e.titulo(vars)}\n- **Texto:**\n${e.paragrafos(vars).map((t) => `  - ${t}`).join('\n')}\n- **Botão:** ${e.botao.texto}\n`
  }
}
await writeFile('docs/emails-sequencias.md', md)
console.log(`${Object.keys(EMAILS).length} e-mails gerados em preview-email/sequencias e docs/emails-sequencias.md`)
