export type MotivoRecuperacao = 'abandono' | 'pix_boleto' | 'cancelamento' | 'reembolso'

export interface CasoRecuperacao {
  id: string
  chave: string
  nome: string
  email: string
  telefone: string
  cidade: string
  estado: string
  estadoCaso: 'aberto' | 'recuperado'
  motivo: MotivoRecuperacao
  situacao: string
  rotulo: string
  data: string
  diasParado: number
  produto: string
  oferta: string
  valor: number | null
  pagamento: string
  parcelas: number | null
  canal: string
  campanha: string
  tentativas: { carrinhos: number; pixBoletos: number }
  outrosAbertos: { motivo: MotivoRecuperacao; rotulo: string; produto: string; data: string }[]
  jaComprou: string[]
  totalPago: number
  lead: {
    projeto: string
    campanha: string
    criativo: string
    veioDe: string
    pagina: string
    data: string
    respostas: Record<string, unknown>
    cadastros: number
  } | null
  linhaDoTempo: { data: string; titulo: string; categoria: string; situacao: string | null; produto: string; valor: number | null; pagamento: string }[]
}

export interface ResumoRecuperacao {
  abertos: number
  recuperados: number
  taxaRecuperacao: number
  valorAberto: number
  novos7d: number
  porMotivo: Record<MotivoRecuperacao, { abertos: number; recuperados: number; valorAberto: number }>
  produtos: { produto: string; abertos: number; valor: number }[]
}

export interface RecuperacaoResponse {
  fetchedAt: string
  casos: CasoRecuperacao[]
  resumo: ResumoRecuperacao
}

export async function fetchRecuperacao(refresh = false): Promise<RecuperacaoResponse> {
  const response = await fetch(`/api/recuperacao${refresh ? '?refresh=1' : ''}`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (response.status === 401) throw new Error('SESSION_EXPIRED')
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'Não foi possível carregar a recuperação.')
  return { fetchedAt: data.fetchedAt ?? '', casos: Array.isArray(data.casos) ? data.casos : [], resumo: data.resumo }
}
