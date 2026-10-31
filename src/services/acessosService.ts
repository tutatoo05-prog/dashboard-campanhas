export interface AcessoResumo {
  modo: 'desligado' | 'teste' | 'ativo'
  porEstado: Record<string, number>
  acessosPorStatus: Record<string, number>
  ultimoEventoEm: string | null
  configuracao: {
    obrigatorias: { nome: string; descricao: string }[]
    opcionais: { nome: string; descricao: string }[]
  }
}

export interface AcessoEtapa {
  nome: string
  ok: boolean
  simulado: boolean
  pulado: string | null
  erro: string | null
  em: string | null
}

export interface AcessoEvento {
  id: number
  eventId: string
  evento: string
  estado: string
  decisao: string | null
  simulado: boolean
  nome: string | null
  email: string | null
  curso: string | null
  pagamentoTipo: string | null
  plano: string | null
  recorrencia: number | null
  dias: number | null
  previstos: string[]
  etapas: AcessoEtapa[]
  tentativas: number
  proximaTentativa: string | null
  erro: string | null
  recebidoEm: string
  processadoEm: string | null
}

export interface AcessoAluno {
  id: number
  email: string | null
  nome: string | null
  telefone: string | null
  curso: string
  plano: string | null
  pagamentoTipo: string | null
  status: 'ativo' | 'atrasado' | 'bloqueio_pendente' | 'bloqueado' | 'reativar_pendente'
  diasRegra: number | null
  liberadoAte: string | null
  parcelasPagas: number
  atrasoDesde: string | null
  bloquearEm: string | null
  bloqueadoEm: string | null
  bloqueioErro: string | null
  ultimaLiberacaoEm: string | null
  /** 'plataforma' = aluno que já estava na plataforma de cursos (lista importada); 'dash' = liberado pelo dash. */
  origem: 'plataforma' | 'dash'
  plataformaId: string | null
  /** Aluno de Pix parcelado (controle de atraso). */
  parcelado: boolean
  /** Até quando as parcelas pagas cobrem (cada parcela = 30 dias). */
  pagoAte: string | null
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' }, ...init })
  if (response.status === 401) throw new Error('SESSION_EXPIRED')
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'Não foi possível carregar os acessos.')
  return data as T
}

export const fetchAcessoResumo = () => pedir<AcessoResumo>('/api/acessos/resumo')

export async function fetchAcessoEventos(estado: string, busca: string): Promise<AcessoEvento[]> {
  const params = new URLSearchParams({ estado, limite: '100' })
  if (busca.trim()) params.set('busca', busca.trim())
  const data = await pedir<{ eventos: AcessoEvento[] }>(`/api/acessos/eventos?${params}`)
  return data.eventos
}

export async function fetchAcessoAlunos(): Promise<AcessoAluno[]> {
  const data = await pedir<{ acessos: AcessoAluno[] }>('/api/acessos/lista')
  return data.acessos
}

export interface VerificacaoItem {
  grupo: string
  nivel: 'ok' | 'erro' | 'aviso'
  texto: string
}

export const verificarAcessos = (emailTeste: string) =>
  pedir<{ itens: VerificacaoItem[]; falhas: number }>('/api/acessos/verificar', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailTeste }),
  })

export const reprocessarEvento = (id: number) => pedir<{ ok: true }>(`/api/acessos/eventos/${id}/reprocessar`, { method: 'POST' })

export interface AvisoManualResultado {
  email: { ok: boolean; erro?: string }
  whatsapp: { ok: boolean; erro?: string }
}

export const avisarAcessoManual = (id: number, senha: string) =>
  pedir<AvisoManualResultado>(`/api/acessos/eventos/${id}/avisar-manual`, { method: 'POST', body: JSON.stringify({ senha }) })

export const marcarReativacaoFeita =(id: number) => pedir<{ ok: true }>(`/api/acessos/lista/${id}/reativacao-feita`, { method: 'POST' })

export const marcarBloqueioFeito = (id: number) => pedir<{ ok: true }>(`/api/acessos/lista/${id}/bloqueio-feito`, { method: 'POST' })

export interface EmailItem {
  id: string
  tipo: string
  rotulo: string
  origem: 'fila' | 'direto'
  /** Quando saiu (ou, se ainda não saiu, quando está agendado). */
  quando: string
  nome: string | null
  email: string | null
  curso: string | null
  estado: 'enviado' | 'simulado' | 'pendente' | 'cancelado' | 'falhou'
  motivo: string | null
  /** Só para e-mails de carrinho e de pagamento: a pessoa comprou em até 7 dias depois do envio. */
  comprouDepois: boolean | null
}

export interface EmailTipo {
  tipo: string
  rotulo: string
  grupo: string
  quando: string
  origem: 'fila' | 'direto'
  enviados: number
  simulados: number
  pendentes: number
  cancelados: number
  falhas: number
  comprouDepois: number
  taxaCompra: number | null
}

export interface EmailsPainel {
  modo: 'desligado' | 'teste' | 'ativo'
  dias: number
  hoje: { total: number; fila: number; tetoBrevo: number; tetoFila: number }
  total: { enviados: number; simulados: number; pendentes: number; cancelados: number; falhas: number }
  porTipo: EmailTipo[]
  porDia: { dia: string; fila: number; diretos: number }[]
  lista: EmailItem[]
  listaCortada: boolean
}

export const fetchEmailsPainel = (dias: number) => pedir<EmailsPainel>(`/api/acessos/emails?dias=${dias}`)

/** Todos os e-mails de um tipo no período e para quem foram (janela que abre ao clicar no cartão). */
export async function fetchEmailsDoTipo(tipo: string, dias: number): Promise<EmailItem[]> {
  const data = await pedir<{ lista: EmailItem[] }>(`/api/acessos/emails/tipo?tipo=${encodeURIComponent(tipo)}&dias=${dias}`)
  return data.lista
}

/** E-mails que uma pessoa recebeu (ou vai receber), para a linha do tempo dela. Só admin; para os demais dá 403. */
export async function fetchEmailsDaPessoa(email: string): Promise<EmailItem[]> {
  const data = await pedir<{ lista: EmailItem[] }>(`/api/acessos/emails/pessoa?email=${encodeURIComponent(email)}`)
  return data.lista
}
