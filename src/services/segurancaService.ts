export interface ArquivoDeBackup {
  nome: string
  bytes: number
  em: string
}

export interface ItemDeConfiguracao {
  id: string
  rotulo: string
  ok: boolean
  dica: string
}

export interface SessaoAtiva {
  nome: string
  email: string
  cargo: string
  entrouEm: string
  expiraEm: string
  atual: boolean
}

export interface AcaoNaMeta {
  em: string
  usuario: string | null
  campanha: string | null
  acao: string
  ok: boolean
}

export interface ResumoDeSeguranca {
  backup: { ligado: boolean; hora: number; dias: number; noTelegram: boolean; noDrive: boolean; arquivos: ArquivoDeBackup[] }
  avisos: { canal: 'telegram' | 'whatsapp' | 'nenhum' }
  sessoes: SessaoAtiva[]
  acoes: AcaoNaMeta[]
  configuracao: ItemDeConfiguracao[]
  deploy: { em: string; estado: 'ok' | 'erro' | 'rodando'; linhas: string[] } | null
  hotmart: {
    total: number
    ultimoEm: string | null
    recusadas: number
    ultimaRecusaEm: string | null
    aceitas: number
    ultimaAceitaEm: string | null
    hottokConfigurado: boolean
  }
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' }, ...init })
  if (response.status === 401) throw new Error('SESSION_EXPIRED')
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'Não foi possível carregar a segurança.')
  return data as T
}

export const fetchSeguranca = () => pedir<ResumoDeSeguranca>('/api/seguranca/resumo')

export const fazerBackupAgora = () =>
  pedir<{ nome: string; tabelas: number; linhas: number; bytes: number; destinos: string[] }>('/api/seguranca/backup', { method: 'POST' })

export const testarAlerta = () => pedir<{ canal: string }>('/api/seguranca/alerta-teste', { method: 'POST' })

export const importarVendaHotmart = (payload: string) =>
  pedir<{ registrado: boolean; repetido: boolean; processa: boolean; evento: string; email: string | null; transacao: string | null; produto: string | null }>(
    '/api/seguranca/hotmart/importar',
    { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ payload }) },
  )

export const encerrarOutrasSessoes = () => pedir<{ encerradas: number }>('/api/seguranca/encerrar-sessoes', { method: 'POST' })

export interface SaudeDoSistema {
  ok: boolean
  banco: { ms: number; ok: boolean }
  filaDoBanco: { total: number; ociosas: number; esperando: number; maximo: number } | null
  servidor: { atrasoDoServidorMs: number; ligadoHaMinutos: number; memoriaMB: number }
}

export const fetchSaude = () => pedir<SaudeDoSistema>('/api/saude')
