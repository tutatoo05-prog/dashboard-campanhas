import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { Typewriter } from '@/components/mascot/Typewriter.tsx'
import { BarrasVerticais } from '@/components/videos/BarrasVerticais.tsx'
import { PlayerControl } from '@/components/videos/PlayerControl.tsx'
import { fetchVideoMetrics, type VideoMetrics } from '@/services/videoService.ts'
import { formatNumber, formatPercent } from '@/lib/format.ts'
import { formatDateBr } from '@/lib/period.ts'

const PERIODS = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
  { value: 0, label: 'Tudo' },
]

const GOLD = '#ff8a1f'
const GRID = 'var(--chart-grid)'
const AXIS = 'var(--muted)'
const TOOLTIP_STYLE = {
  background: 'var(--card)',
  border: '3px solid var(--line)',
  borderRadius: 10,
  boxShadow: '3px 3px 0 var(--shade)',
  color: 'var(--ink)',
  fontSize: 12,
}

/** Só a VSL é monitorada aqui (os depoimentos não usam o player hospedado). */
const VIDEO = 'vsl'

const DEVICE_LABELS: Record<string, string> = { mobile: 'Celular', desktop: 'Computador', tablet: 'Tablet', outro: 'Outro' }

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function rate(part: number, total: number): string {
  return total > 0 ? formatPercent((part / total) * 100) : '—'
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="kpi-card">
      <p className="section-label">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-zinc-50">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
    </div>
  )
}

/** Barra de "quantos % compraram": a altura é a taxa e a dica mostra os números absolutos. */
function compra(grupo: { pessoas: number; compraram: number }) {
  const pct = grupo.pessoas > 0 ? (grupo.compraram / grupo.pessoas) * 100 : 0
  return { valor: pct, texto: formatPercent(pct), dica: `${formatNumber(grupo.compraram)} de ${formatNumber(grupo.pessoas)} compraram` }
}

function Content({ data }: { data: VideoMetrics }) {
  const { resumo } = data

  if (resumo.espectadores === 0) {
    return (
      <section className="surface-card p-5 text-sm text-zinc-400" role="status">
        <p className="font-semibold text-zinc-200">Ainda sem reproduções deste vídeo no período.</p>
        <p className="mt-1">
          Os números aparecem aqui conforme as pessoas dão play na página. Só contam visitantes que aceitaram os cookies.
        </p>
      </section>
    )
  }

  const chartData = data.porDia.map((ponto) => ({ ...ponto, date: ponto.dia }))
  const conv = data.conversao
  const showChart = chartData.length >= 2

  return (
    <>
      <section className="kpi-scroll" data-tour="Resumo do vídeo" data-tour-text="Quantas pessoas deram play, que parte das visitas isso representa e quantas assistiram a maior parte do vídeo.">
        <Kpi label="Espectadores" value={formatNumber(resumo.espectadores)} hint="pessoas que deram play" />
        <Kpi label="Taxa de play" value={formatPercent(resumo.taxaPlay)} hint={`de ${formatNumber(resumo.visitantes)} visitantes`} />
        <Kpi label="Assistiram 75%+" value={formatNumber(resumo.assistiram75)} hint={rate(resumo.assistiram75, resumo.espectadores)} />
        <Kpi
          label="Tempo médio"
          value={formatDuration(resumo.mediaSegundos)}
          hint={resumo.pessoasComTempo > 0 ? `de ${formatNumber(resumo.pessoasComTempo)} pessoas` : 'sem dado ainda'}
        />
      </section>

      <section className="surface-card p-4" data-tour="Onde saem" data-tour-text="Quanto da plateia chega a cada trecho do vídeo. A maior queda entre duas barras mostra onde perde gente.">
        <p className="section-label">Retenção</p>
        <h3 className="section-title mt-1 mb-3">Quantos chegam a cada trecho</h3>
        <BarrasVerticais
          rotulo="Pessoas que chegam a cada trecho do vídeo"
          dados={data.funil.map((etapa) => ({
            nome: etapa.rotulo.replace('Chegaram a ', ''),
            valor: etapa.pessoas,
            texto: formatNumber(etapa.pessoas),
            dica: `${formatNumber(etapa.pessoas)} pessoas (${formatPercent(etapa.pct)})`,
          }))}
        />
      </section>

      {showChart && (
        <section className="surface-card p-4">
          <p className="section-label">Espectadores por dia</p>
          <p className="mb-3 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: GOLD }} aria-hidden="true" />Espectadores</span>
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--muted)' }} aria-hidden="true" />Assistiram 75%+</span>
          </p>
          <div style={{ width: '100%', height: 180 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="date" tickFormatter={(value: string) => formatDateBr(value).slice(0, 5)} stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false} width={32} />
                <Tooltip
                  cursor={{ fill: GRID }}
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(value) => formatDateBr(String(value))}
                  formatter={(value, name) => [formatNumber(Number(value)), name === 'assistiram75' ? 'Assistiram 75%+' : 'Espectadores']}
                />
                <Bar dataKey="espectadores" fill={GOLD} stroke="var(--line)" strokeWidth={1.5} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="assistiram75" fill="var(--muted)" stroke="var(--line)" strokeWidth={1.5} radius={[6, 6, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="surface-card p-4">
          <p className="section-label">Por página</p>
          <h3 className="section-title mt-1 mb-3">Onde o vídeo é visto</h3>
          <BarrasVerticais
            rotulo="Espectadores por página"
            dados={data.porPagina.map((linha) => ({
              nome: linha.rotulo,
              valor: linha.espectadores,
              texto: formatNumber(linha.espectadores),
              dica: `${formatNumber(linha.espectadores)} de ${formatNumber(linha.visitantes)} visitas (${rate(linha.espectadores, linha.visitantes)})`,
            }))}
          />
        </section>

        <section className="surface-card p-4">
          <p className="section-label">Por aparelho</p>
          <h3 className="section-title mt-1 mb-3">Celular ou computador</h3>
          <BarrasVerticais
            rotulo="Espectadores por aparelho"
            dados={data.porAparelho.map((linha) => ({
              nome: DEVICE_LABELS[linha.aparelho] ?? linha.aparelho,
              valor: linha.espectadores,
              texto: formatNumber(linha.espectadores),
              dica: `${formatNumber(linha.espectadores)} espectadores · ${rate(linha.assistiram75, linha.espectadores)} vão a 75%+`,
            }))}
          />
        </section>
      </div>

      <section className="surface-card p-4" data-tour="Vídeo e venda" data-tour-text="Compara quem assistiu quase tudo com quem assistiu menos, só entre as pessoas que já preencheram o formulário (aí dá para saber quem comprou).">
        <p className="section-label">Vídeo e venda</p>
        <h3 className="section-title mt-1 mb-3">Quem assistiu mais comprou mais?</h3>
        {conv.identificados === 0 ? (
          <p className="text-sm text-zinc-400">Ainda não há espectadores que tenham preenchido o formulário. Quando houver, a comparação aparece aqui.</p>
        ) : (
          <>
            <BarrasVerticais
              rotulo="Percentual que comprou, entre quem assistiu 75% ou mais e quem assistiu menos"
              altura={170}
              dados={[
                { nome: 'Assistiram 75% ou mais', ...compra(conv.assistiram75) },
                { nome: 'Assistiram menos', ...compra(conv.outros) },
              ]}
            />
            <p className="mt-3 text-xs text-zinc-500">
              Só entram {formatNumber(conv.identificados)} de {formatNumber(resumo.espectadores)} espectadores (quem já se identificou). Com poucas pessoas, a diferença pode ser acaso.
            </p>
          </>
        )}
      </section>
    </>
  )
}

export default function VideosPage() {
  const [dias, setDias] = useState(30)

  const query = useQuery({
    queryKey: ['videos', VIDEO, dias],
    queryFn: () => fetchVideoMetrics(VIDEO, dias),
    retry: false,
  })

  const data = query.data
  const error = query.error as Error | null
  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHero>
        <p className="section-label">Operação</p>
        <Typewriter as="h2" className="section-title mt-1" text="Vídeos" />
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          Como a VSL está sendo vista: quantos dão play, até onde chegam e se isso tem relação com a compra.
        </p>
      </PageHero>

      <section className="surface-card filter-bar filter-grid" data-tour="Filtros do vídeo" data-tour-text="Escolha o período. Os números contam pessoas, não cliques: quem pausa e retoma conta uma vez só.">
        <div className="seg" role="group" aria-label="Período">
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`seg-btn ${dias === option.value ? 'seg-btn-active' : ''}`}
              onClick={() => setDias(option.value)}
              aria-pressed={dias === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <section className="surface-card border-red-500/30 p-4 text-sm text-red-300" role="alert">
          {error.message === 'SESSION_EXPIRED' ? 'Sua sessão expirou. Faça login novamente.' : error.message || 'Não foi possível carregar os vídeos.'}
        </section>
      )}

      {query.isLoading && !error && (
        <div className="space-y-6" aria-busy="true" aria-label="Carregando métricas do vídeo">
          <div className="kpi-grid">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="kpi2">
                <div className="skeleton h-3 w-20" />
                <div className="skeleton h-8 w-24" />
              </div>
            ))}
          </div>
          <div className="surface-card p-5">
            <div className="skeleton mb-3 h-3 w-32" />
            <div className="skeleton h-28 w-full" />
          </div>
        </div>
      )}

      {data && !error && <Content data={data} />}

      <PlayerControl video={VIDEO} />

      {data && !error && (
        <p className="text-xs text-zinc-500">
          Conta só quem aceitou os cookies: mostra a tendência, não o total de visitantes. Atualizado a cada 5 minutos
          {data.atualizadoEm ? ` (última leitura ${new Date(data.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})` : ''}.
        </p>
      )}
    </div>
  )
}
