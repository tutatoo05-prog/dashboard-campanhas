export interface VideoFunnelStep {
  chave: string
  rotulo: string
  pessoas: number
  pct: number
}

export interface VideoDayPoint {
  dia: string
  espectadores: number
  assistiram75: number
}

export interface VideoPageRow {
  rotulo: string
  visitantes: number
  espectadores: number
  taxaPlay: number
  assistiram75: number
}

export interface VideoDeviceRow {
  aparelho: string
  espectadores: number
  assistiram75: number
}

export interface VideoConversionGroup {
  pessoas: number
  compraram: number
}

export interface VideoMetrics {
  success: boolean
  atualizadoEm: string
  video: string
  dias: number
  de: string
  ate: string
  videosDisponiveis: { nome: string; espectadores: number }[]
  resumo: {
    espectadores: number
    eventosDePlay: number
    visitantes: number
    taxaPlay: number
    assistiram75: number
    viramAteOFim: number
    mediaSegundos: number | null
    pessoasComTempo: number
  }
  funil: VideoFunnelStep[]
  porDia: VideoDayPoint[]
  porPagina: VideoPageRow[]
  porAparelho: VideoDeviceRow[]
  conversao: {
    identificados: number
    assistiram75: VideoConversionGroup
    outros: VideoConversionGroup
  }
}

export async function fetchVideoMetrics(video: string, dias: number): Promise<VideoMetrics> {
  const params = new URLSearchParams({ video, dias: String(dias) })
  const response = await fetch(`/api/videos?${params}`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })

  if (response.status === 401) {
    throw new Error('SESSION_EXPIRED')
  }

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error ?? 'Não foi possível carregar as métricas dos vídeos.')
  }

  return data as VideoMetrics
}

export type FormaBotao = 'suave' | 'reto' | 'pilula'
export type PosicaoBotao = 'centro' | 'esquerda' | 'direita'
export type VerticalBotao = 'baixo' | 'topo'
export type TamanhoBotao = 'p' | 'm' | 'g'
export type AnimacaoBotao = 'nenhuma' | 'pulsar' | 'brilho'

export interface BarraFalsa {
  ativo: boolean
  inicioSegundos: number
  inicioVelocidade: number
  trechoSegundos: number
  rapido: number
  lento: number
}

export interface PlayerConfig {
  arquivos: { hd: string; leve: string }
  permitirAvancar: boolean
  textoToque: string
  aparencia: { corDestaque: string; corBotao: string; corTextoBotao: string; formaBotao: FormaBotao }
  controles: { tempo: boolean; volume: boolean }
  protegerVideo: boolean
  lembrarPosicao: boolean
  barraFalsa: BarraFalsa
  cta: { ativo: boolean; segundo: number; duracao: number; repetir: number; texto: string; posicao: PosicaoBotao; vertical: VerticalBotao; tamanho: TamanhoBotao; animacao: AnimacaoBotao }
  fim: { ativo: boolean; titulo: string; texto: string }
}

export interface PlayerConfigState {
  success: boolean
  video: string
  padrao: PlayerConfig
  config: PlayerConfig
  /** false = ainda está usando o padrão (nada salvo). */
  salvo: boolean
  /** true = falta criar a tabela video_config no banco (db/schema.sql). */
  precisaMigracao: boolean
  atualizadoEm?: string
  atualizadoPor?: string | null
}

async function readConfigResponse(response: Response): Promise<PlayerConfigState> {
  if (response.status === 401) {
    throw new Error('SESSION_EXPIRED')
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error ?? 'Não foi possível acessar a configuração do player.')
  }
  return data as PlayerConfigState
}

export async function fetchPlayerConfig(video: string): Promise<PlayerConfigState> {
  const response = await fetch(`/api/videos/config?video=${encodeURIComponent(video)}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  return readConfigResponse(response)
}

export async function savePlayerConfig(video: string, config: PlayerConfig): Promise<PlayerConfigState> {
  const response = await fetch(`/api/videos/config?video=${encodeURIComponent(video)}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  })
  return readConfigResponse(response)
}
