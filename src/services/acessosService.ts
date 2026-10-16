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
  status: 'ativo' | 'atrasado' | 'bloqueado' | 'bloqueio_pendente'
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

export const marcarBloqueioFeito = (id: number) => pedir<{ ok: true }>(`/api/acessos/lista/${id}/bloqueio-feito`, { method: 'POST' })
