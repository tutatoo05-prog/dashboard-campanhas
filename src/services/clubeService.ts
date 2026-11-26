export type PlataformaClube = 'youtube' | 'essentials'

export interface ClubeBloco {
  id: string
  titulo: string
  dica: string
  /** Nomes das variáveis de ambiente que ainda faltam no servidor (nunca os valores). */
  faltando: string[]
  pronto: boolean
}

export interface ClubeMembro {
  id: number
  plataforma: PlataformaClube
  chave: string
  nome: string | null
  email: string | null
  nivel: string | null
  status: 'ativo' | 'cancelado'
  desde: string | null
  discordNome: string | null
  noDiscord: boolean
  cargoAplicado: boolean
}

export interface ClubePlataforma {
  ativos: number
  cancelados: number
  noDiscord: number
}

export interface ClubeSnapshot {
  dia: string
  plataforma: PlataformaClube
  ativos: number
  novos: number
  cancelados: number
}

export interface ClubeEstadoFonte {
  atualizadoEm: string
  erro?: string
  aviso?: string
  pulado?: string
  ativos?: number
  novos?: number
  cancelados?: number
  cargosRemovidos?: number
}

export interface Clube {
  success: boolean
  config: ClubeBloco[]
  enderecos: { retornoGoogle: string; retornoDiscord: string; paginaDeResgate: string }
  /** true = falta rodar db/clube.sql no banco. */
  precisaMigracao: boolean
  plataformas: Record<PlataformaClube, ClubePlataforma> | null
  evolucao: ClubeSnapshot[]
  estado: Record<string, ClubeEstadoFonte>
  membros: ClubeMembro[]
}

export type ResultadoSync = Record<string, { erro?: string; aviso?: string; pulado?: string; ativos?: number; novos?: number; cancelados?: number; cargosRemovidos?: number }>

async function ler<T>(resposta: Response, mensagem: string): Promise<T> {
  if (resposta.status === 401) throw new Error('SESSION_EXPIRED')
  const dados = await resposta.json().catch(() => ({}))
  if (!resposta.ok) throw new Error((dados as { error?: string }).error ?? mensagem)
  return dados as T
}

export async function fetchClube(): Promise<Clube> {
  return ler<Clube>(await fetch('/api/clube', { credentials: 'include', headers: { Accept: 'application/json' } }), 'Não foi possível carregar o clube.')
}

export async function sincronizarClube(): Promise<ResultadoSync> {
  const dados = await ler<{ resultado: ResultadoSync }>(
    await fetch('/api/clube/sincronizar', { method: 'POST', credentials: 'include', headers: { Accept: 'application/json' } }),
    'Não foi possível sincronizar agora.',
  )
  return dados.resultado
}

/** Página pública de resgate: pede o link de confirmação ao e-mail do aluno da Essentials. */
export async function pedirLinkDiscord(email: string): Promise<string> {
  const resposta = await fetch('/api/clube/resgate/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email }),
  })
  const dados = await resposta.json().catch(() => ({}))
  if (!resposta.ok) throw new Error((dados as { error?: string }).error ?? 'Não conseguimos agora. Tente de novo em instantes.')
  return (dados as { mensagem?: string }).mensagem ?? 'Pronto! Olhe a sua caixa de entrada.'
}
