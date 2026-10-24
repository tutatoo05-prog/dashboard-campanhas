/**
 * Catálogo de projetos do dash: de que TIPO é cada cadastro e qual o SLUG da página que o gerou.
 *
 *   tipo      essentials | workshop | mentoria | outros
 *   vertente  só no Essentials: "live" ou "membros" ("" = Essentials geral)
 *   slug      identificação que a página manda ao cadastrar (ex.: workirezumi). Todos os workshops são um tipo só,
 *             separados apenas pelo slug.
 *   origem    valor gravado em leads.origem (a tela Leads e os relatórios antigos usam este nome; não mudar).
 *   aliases   outros nomes que já apareceram para o mesmo projeto (origens antigas, "evento" da página...).
 *
 * Projeto novo: acrescente uma linha aqui e a página passa a mandar o slug. Slug que não está aqui também funciona:
 * workXXXX vira workshop, essentialsXXX vira Essentials, mentoriaXXX vira mentoria, o resto vira "outros".
 */

export const TIPOS = {
  essentials: 'Essentials',
  workshop: 'Workshops',
  mentoria: 'Mentoria particular',
  outros: 'Outros',
}

export const PROJETOS = [
  { slug: 'essentials', tipo: 'essentials', vertente: '', nome: 'Geral', origem: 'essentials', aliases: ['essentials_a', 'essentials_b'] },
  { slug: 'essentials-live', tipo: 'essentials', vertente: 'live', nome: 'Live', origem: 'essentials_live', aliases: ['live'] },
  { slug: 'essentials-membros', tipo: 'essentials', vertente: 'membros', nome: 'Membros', origem: 'essentials_membros', aliases: ['membros'] },
  {
    slug: 'workirezumi',
    tipo: 'workshop',
    vertente: '',
    nome: 'Irezumi',
    origem: 'workshop_irezumi_1',
    // "lancamento_interessados": o formulário do workshop mandava cada cadastro duas vezes; são as mesmas pessoas.
    aliases: ['workshop_irezumi_1', 'workshop_irezumi', 'irezumi_oriental', 'lancamento_interessados', 'lancamento_irezumi_oriental'],
  },
  { slug: 'workleao2', tipo: 'workshop', vertente: '', nome: 'Leão 2', origem: 'workshop_leao_2', aliases: ['workshop_leao_2', 'workshop_gratuito_leao'] },
  {
    slug: 'workcobertura',
    tipo: 'workshop',
    vertente: '',
    nome: 'Cobertura',
    origem: 'cobertura_cicatrizacao_09_09',
    aliases: ['workshop_gratuito', 'cobertura_cicatrizacao_09_09', 'cobertura'],
  },
  { slug: 'workprompt', tipo: 'workshop', vertente: '', nome: 'Prompt', origem: 'prompt', aliases: ['prompt'] },
  { slug: 'mentoria-particular', tipo: 'mentoria', vertente: '', nome: 'Particular', origem: 'mentoria_particular', aliases: ['mentoria_particular'] },
]

/** "Workshop-Irezumi 1" -> "workshop_irezumi_1": a mesma forma para comparar slug, origem e evento. */
export function normalizar(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const POR_NOME = new Map()
for (const projeto of PROJETOS) {
  for (const nome of [projeto.slug, projeto.origem, ...projeto.aliases]) POR_NOME.set(normalizar(nome), projeto)
}

function humanizar(slug) {
  const texto = String(slug).replace(/[-_]+/g, ' ').trim()
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : 'Sem nome'
}

/**
 * Descobre o projeto de um slug/origem/evento. Sempre devolve { slug, tipo, vertente, nome, origem, conhecido }.
 * Vazio vira o Essentials geral? Não: vazio vira "outros / site", para ninguém ser misturado sem querer.
 */
export function classificar(valor) {
  const chave = normalizar(valor)
  const achado = chave && POR_NOME.get(chave)
  if (achado) return { slug: achado.slug, tipo: achado.tipo, vertente: achado.vertente, nome: achado.nome, origem: achado.origem, conhecido: true }

  const slug = chave ? chave.replace(/_/g, '-') : 'site'
  let tipo = 'outros'
  let vertente = ''
  if (/^work/.test(chave)) tipo = 'workshop'
  else if (/^essentials/.test(chave)) {
    tipo = 'essentials'
    if (/live/.test(chave)) vertente = 'live'
    else if (/membro/.test(chave)) vertente = 'membros'
  } else if (/^mentoria/.test(chave)) tipo = 'mentoria'
  return { slug, tipo, vertente, nome: humanizar(slug), origem: chave || 'site', conhecido: false }
}

/** Nome do grupo e do projeto como a tela Registros mostra ("Workshops" / "Irezumi"). */
export function rotulos(projeto) {
  return { grupo: TIPOS[projeto.tipo] ?? TIPOS.outros, nome: projeto.nome }
}
