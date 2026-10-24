export type Situacao = 'ok' | 'lento' | 'fora' | 'sem-dados'

export interface PontoDeChecagem {
  ok: boolean
  ms: number | null
  em: string
}

export interface AlvoMonitorado {
  nome: string
  url: string
  situacao: Situacao
  status: number | null
  ms: number | null
  erro: string | null
  checadoEm: string | null
  disponibilidade24h: number | null
  mediaMs: number | null
  ultimas: PontoDeChecagem[]
}

export interface CapturaDoDash {
  gravados: number
  duplicados: number
  invalidos: number
  bloqueados: number
  falhas: number
  ultimoGravadoEm: string | null
  ultimaFalhaEm: string | null
  ultimoErro: string | null
  desde: string
}

export interface ProjetoMonitorado {
  id: string
  nome: string
  descricao: string
  pasta: string
  situacao: Situacao
  alvos: AlvoMonitorado[]
  leads: { ultimas24h: number; ultimos7dias: number; total: number; ultimoEm: string | null } | null
  captura: CapturaDoDash | null
}

export interface ResumoDoMonitor {
  geradoEm: string
  projetos: ProjetoMonitorado[]
}

async function pedir(url: string, init?: RequestInit): Promise<ResumoDoMonitor> {
  const response = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' }, ...init })
  if (response.status === 401) throw new Error('SESSION_EXPIRED')
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'Não foi possível carregar o monitoramento.')
  return data as ResumoDoMonitor
}

export const fetchMonitor = () => pedir('/api/monitor')

export const verificarAgora = () => pedir('/api/monitor/verificar', { method: 'POST' })
