/**
 * Projetos acompanhados na tela Monitoramento. Para entrar um site novo, é só acrescentar aqui.
 *
 * alvo: { nome, url, metodo?, cabecalhos?, esperaStatus?, contem? }
 *   - contem: texto que tem de aparecer no HTML (pega página "no ar" mas quebrada).
 *   - esperaStatus: para checagens que não são GET 2xx/3xx (ex.: o preflight do cadastro responde 204).
 * slugsDeLeads: slugs (leads.slug) que pertencem ao projeto, para contar cadastros (ver server/projetos/catalogo.js).
 * captura: o projeto cadastra leads pelo endpoint /api/captura do dash (mostra os erros dele).
 */
export const PROJETOS = [
  {
    id: 'work-gratuito',
    nome: 'Workshop gratuito',
    descricao: 'Página de captura do workshop gratuito (lançamento Irezumi)',
    pasta: 'PRODUÇÃO/work-gratuito',
    captura: true,
    slugsDeLeads: ['workirezumi', 'workcobertura', 'workleao2', 'workprompt'],
    alvos: [
      { nome: 'Página de captura', url: 'https://tuzinho.academy/lancamento/', contem: 'data-lead-form' },
      {
        nome: 'Cadastro (dash)',
        url: 'https://dash.tuzinho.academy/api/captura',
        metodo: 'OPTIONS',
        cabecalhos: { Origin: 'https://tuzinho.academy', 'Access-Control-Request-Method': 'POST' },
        esperaStatus: 204,
      },
    ],
  },
  {
    id: 'produtos',
    nome: 'Produtos',
    descricao: 'Essentials, Live, área de membros, mentoria particular e player',
    pasta: 'PRODUÇÃO/produtos',
    slugsDeLeads: ['essentials', 'essentials-live', 'essentials-membros', 'mentoria-particular'],
    alvos: [
      { nome: 'Essentials', url: 'https://tuzinho.academy/produtos/essentials/' },
      // A Live da campanha do Google fica em tuzinho.app (só esse domínio foi aprovado); a de tuzinho.academy é a cópia.
      { nome: 'Live (campanha)', url: 'https://tuzinho.app/essentials/' },
      { nome: 'Live (tuzinho.academy)', url: 'https://tuzinho.academy/produtos/essentials/live/' },
      { nome: 'Área de membros', url: 'https://tuzinho.academy/produtos/essentials/membros/' },
      { nome: 'Mentoria particular', url: 'https://tuzinho.academy/produtos/particular/' },
      { nome: 'Player de vídeo', url: 'https://tuzinho.academy/produtos/player/' },
    ],
  },
  {
    id: 'original-sp-tattoo',
    nome: 'Original SP Tattoo',
    descricao: 'Site institucional do estúdio (originaltattoo.com.br)',
    pasta: 'PRODUÇÃO/original sp tattoo',
    slugsDeLeads: [],
    alvos: [
      { nome: 'Home', url: 'https://originaltattoo.com.br/' },
      { nome: 'Artistas', url: 'https://originaltattoo.com.br/artistas.html' },
      { nome: 'Portfólio', url: 'https://originaltattoo.com.br/portfolio.html' },
      { nome: 'Contato', url: 'https://originaltattoo.com.br/contato.html' },
      { nome: 'Sobre', url: 'https://originaltattoo.com.br/sobre.html' },
    ],
  },
]
