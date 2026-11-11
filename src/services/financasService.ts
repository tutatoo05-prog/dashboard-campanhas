export interface FinCelula {
  valor: number
  origem: 'auto' | 'manual' | 'planilha'
}

export interface FinLinha {
  id: string
  rotulo: string
  auto: boolean
  /** Já está somado em outra linha (não entra no total). */
  incluso: boolean
  celulas: (FinCelula | null)[]
}

export interface FinFonte {
  id: string
  rotulo: string
  configurada: boolean
  vars: string
}

export interface FinResultadoSync {
  id: string
  rotulo: string
  status: 'ok' | 'erro' | 'sem_credencial'
  mensagem: string
}

export interface FinRecorde {
  mes: string
  valor: number
}

export interface Financas {
  ano: number
  meses: string[]
  receitas: FinLinha[]
  custos: FinLinha[]
  totalReceita: number[]
  totalCusto: number[]
  lucro: (number | null)[]
  anual: { receita: number; custo: number; lucro: number }
  caixa: number | null
  mesesSobrevivencia: number | null
  faltamPara12Meses: number | null
  custoMensalReferencia: number
  recordes: { mes: FinRecorde | null; porFonte: (FinRecorde & { id: string; rotulo: string })[] }
  fontes: FinFonte[]
  sincronizacao: { em: string | null; resultado: FinResultadoSync[] }
}

async function ler(response: Response): Promise<Financas> {
  if (response.status === 401) throw new Error('SESSION_EXPIRED')
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'Não foi possível carregar as finanças.')
  return data as Financas
}

const json = { Accept: 'application/json', 'Content-Type': 'application/json' }

export async function fetchFinancas(ano: number): Promise<Financas> {
  return ler(await fetch(`/api/financas?ano=${ano}`, { credentials: 'include', headers: { Accept: 'application/json' } }))
}

/** valor null apaga o lançamento (a célula volta a ser preenchida pela fonte automática, se tiver). */
export async function salvarLancamento(mes: string, tipo: 'receita' | 'custo', linha: string, valor: number | null): Promise<Financas> {
  return ler(await fetch('/api/financas/lancamento', { method: 'PUT', credentials: 'include', headers: json, body: JSON.stringify({ mes, tipo, linha, valor }) }))
}

export async function salvarCaixa(valor: number, ano: number): Promise<Financas> {
  return ler(await fetch(`/api/financas/caixa?ano=${ano}`, { method: 'PUT', credentials: 'include', headers: json, body: JSON.stringify({ valor }) }))
}

export async function sincronizarFinancas(desde?: string): Promise<Financas> {
  return ler(await fetch('/api/financas/sincronizar', { method: 'POST', credentials: 'include', headers: json, body: JSON.stringify(desde ? { desde } : {}) }))
}
