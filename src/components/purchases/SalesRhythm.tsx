import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCurrency, formatNumber } from '@/lib/format.ts'
import type { Purchase } from '@/types'

const TZ = 'America/Sao_Paulo'
const COR = '#ff8a1f'
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const TOOLTIP_STYLE = {
  background: 'var(--card)',
  border: '3px solid var(--line)',
  borderRadius: 10,
  boxShadow: '3px 3px 0 var(--shade)',
  color: 'var(--ink)',
  fontSize: 12,
}

type Periodo = 'dia' | 'mes'

interface Ponto {
  nome: string
  vendas: number
  receita: number
}

/** Dia da venda (AAAA-MM-DD, horário de Brasília): usa o momento em que entrou; senão a data digitada (dd/mm/aaaa). */
function diaDaVenda(purchase: Purchase): string | null {
  if (purchase.createdAt) {
    const date = new Date(purchase.createdAt)
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString('en-CA', { timeZone: TZ })
  }
  const match = String(purchase.data ?? '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  return null
}

function hoje(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
}

/** Soma n dias a um AAAA-MM-DD (n pode ser negativo). */
function somarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

function ColunaGrafico({ dados, rotulo, intervalo = 0 }: { dados: Ponto[]; rotulo: string; intervalo?: number }) {
  const maior = Math.max(1, ...dados.map((item) => item.vendas))
  return (
    <div style={{ width: '100%', height: 200 }} role="img" aria-label={rotulo}>
      <ResponsiveContainer>
        <BarChart data={dados} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barCategoryGap="18%">
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="nome" stroke="var(--muted)" tick={{ fontSize: 11 }} tickLine={false} interval={intervalo} />
          <YAxis hide domain={[0, Math.ceil(maior * 1.15)]} />
          <Tooltip
            cursor={{ fill: 'var(--chart-grid)' }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(valor, _nome, item) => {
              const ponto = item.payload as Ponto
              return [`${formatNumber(Number(valor))} ${Number(valor) === 1 ? 'venda' : 'vendas'}${ponto.receita ? ` · ${formatCurrency(ponto.receita)}` : ''}`, ponto.nome]
            }}
            separator=": "
          />
          <Bar dataKey="vendas" fill={COR} stroke="var(--line)" strokeWidth={dados.length > 16 ? 1 : 2} radius={[6, 6, 0, 0]} minPointSize={2} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function Cartao({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="kpi-card">
      <p className="section-label">{rotulo}</p>
      <p className="mt-0.5 text-lg font-semibold text-zinc-50">{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-zinc-500">{detalhe}</p>}
    </div>
  )
}

/** Ritmo das vendas: hoje, 7 dias, mês, melhor dia, vendas por dia/mês e por dia da semana. Cancelamentos ficam de fora. */
export function SalesRhythm({ purchases }: { purchases: Purchase[] }) {
  const [periodo, setPeriodo] = useState<Periodo>('dia')

  const dados = useMemo(() => {
    const porDia = new Map<string, { vendas: number; receita: number }>()
    for (const purchase of purchases) {
      if (purchase.status === 'cancelado') continue
      const dia = diaDaVenda(purchase)
      if (!dia) continue
      const atual = porDia.get(dia) ?? { vendas: 0, receita: 0 }
      atual.vendas += 1
      if (typeof purchase.valor === 'number') atual.receita += purchase.valor
      porDia.set(dia, atual)
    }

    const fim = hoje()
    const somar = (de: string, ate: string) => {
      let vendas = 0
      let receita = 0
      for (const [dia, item] of porDia) {
        if (dia >= de && dia <= ate) {
          vendas += item.vendas
          receita += item.receita
        }
      }
      return { vendas, receita }
    }

    const hojeTotal = somar(fim, fim)
    const semana = somar(somarDias(fim, -6), fim)
    const mes = somar(`${fim.slice(0, 7)}-01`, fim)
    const total = somar('0000-01-01', fim)

    let melhor: { dia: string; vendas: number } | null = null
    for (const [dia, item] of porDia) {
      if (!melhor || item.vendas > melhor.vendas) melhor = { dia, vendas: item.vendas }
    }

    const ultimosDias: Ponto[] = Array.from({ length: 30 }, (_, i) => {
      const dia = somarDias(fim, i - 29)
      const item = porDia.get(dia)
      return { nome: `${dia.slice(8)}/${dia.slice(5, 7)}`, vendas: item?.vendas ?? 0, receita: item?.receita ?? 0 }
    })

    const ultimosMeses: Ponto[] = Array.from({ length: 12 }, (_, i) => {
      const [y, m] = fim.split('-').map(Number)
      const data = new Date(Date.UTC(y, m - 1 - (11 - i), 1))
      const chave = data.toISOString().slice(0, 7)
      const item = somar(`${chave}-01`, `${chave}-31`)
      return { nome: `${MESES[data.getUTCMonth()]}/${String(data.getUTCFullYear()).slice(2)}`, vendas: item.vendas, receita: item.receita }
    })

    const semanaPorDia: Ponto[] = DIAS_SEMANA.map((nome) => ({ nome, vendas: 0, receita: 0 }))
    for (const [dia, item] of porDia) {
      const [y, m, d] = dia.split('-').map(Number)
      const ponto = semanaPorDia[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
      ponto.vendas += item.vendas
      ponto.receita += item.receita
    }

    const diasComVenda = porDia.size
    return { hojeTotal, semana, mes, total, melhor, ultimosDias, ultimosMeses, semanaPorDia, mediaPorDia: diasComVenda ? total.vendas / diasComVenda : 0 }
  }, [purchases])

  if (!dados.total.vendas) return null

  const melhorTexto = dados.melhor ? `${dados.melhor.dia.slice(8)}/${dados.melhor.dia.slice(5, 7)}/${dados.melhor.dia.slice(0, 4)}` : undefined
  const receita = (valor: number) => (valor ? formatCurrency(valor) : undefined)

  return (
    <>
      <section className="kpi-scroll">
        <Cartao rotulo="Vendas hoje" valor={formatNumber(dados.hojeTotal.vendas)} detalhe={receita(dados.hojeTotal.receita)} />
        <Cartao rotulo="Últimos 7 dias" valor={formatNumber(dados.semana.vendas)} detalhe={receita(dados.semana.receita)} />
        <Cartao rotulo="Este mês" valor={formatNumber(dados.mes.vendas)} detalhe={receita(dados.mes.receita)} />
        <Cartao rotulo="Média por dia com venda" valor={dados.mediaPorDia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} />
        <Cartao rotulo="Melhor dia" valor={dados.melhor ? `${formatNumber(dados.melhor.vendas)} vendas` : '—'} detalhe={melhorTexto} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="surface-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="section-label">Ritmo</p>
              <h3 className="section-title mt-1">{periodo === 'dia' ? 'Vendas por dia' : 'Vendas por mês'}</h3>
              <p className="mt-1 mb-3 text-xs text-zinc-500">
                {periodo === 'dia' ? 'Últimos 30 dias' : 'Últimos 12 meses'} · sem as canceladas
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" className={periodo === 'dia' ? 'btn-gold' : 'chip-btn'} onClick={() => setPeriodo('dia')}>
                Dia
              </button>
              <button type="button" className={periodo === 'mes' ? 'btn-gold' : 'chip-btn'} onClick={() => setPeriodo('mes')}>
                Mês
              </button>
            </div>
          </div>
          {periodo === 'dia' ? (
            <ColunaGrafico dados={dados.ultimosDias} rotulo="Vendas por dia nos últimos 30 dias" intervalo={4} />
          ) : (
            <ColunaGrafico dados={dados.ultimosMeses} rotulo="Vendas por mês nos últimos 12 meses" />
          )}
        </div>

        <div className="surface-card p-4">
          <p className="section-label">Semana</p>
          <h3 className="section-title mt-1">Vendas por dia da semana</h3>
          <p className="mt-1 mb-3 text-xs text-zinc-500">Soma de todo o histórico</p>
          <ColunaGrafico dados={dados.semanaPorDia} rotulo="Vendas por dia da semana" />
        </div>
      </section>
    </>
  )
}
