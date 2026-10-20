import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PageHero } from '@/components/flash/PageHero.tsx'
import { Typewriter } from '@/components/mascot/Typewriter.tsx'
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

const DEVICE_LABELS: Record<string, string> = { mobile: 'Celular', desktop: 'Computador', tablet: 'Tablet', outro: 'Outro' }

/** "vsl" -> "VSL (vídeo de vendas)"; "depo-karem" -> "Depoimento: Karem". */
function videoLabel(nome: string): string {
  if (nome === 'vsl') return 'VSL (vídeo de vendas)'
  if (nome.startsWith('depo-')) {
    const pessoa = nome.slice(5)
    return `Depoimento: ${pessoa.charAt(0).toUpperCase()}${pessoa.slice(1)}`
  }
  return nome
}

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
        <div className="space-y-2">
          {data.funil.map((etapa) => (
            <div key={etapa.chave}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-zinc-300">{etapa.rotulo}</span>
                <span className="font-semibold text-zinc-50">
                  {formatNumber(etapa.pessoas)} <span className="text-xs font-normal text-zinc-500">({formatPercent(etapa.pct)})</span>
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: 'var(--chart-grid)' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(etapa.pct, etapa.pessoas > 0 ? 2 : 0)}%`, background: GOLD }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {showChart && (
        <section className="surface-card p-4">
          <p className="section-label mb-3">Espectadores por dia</p>
          <div style={{ width: '100%', height: 180 }}>
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="videoViewersFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="date" tickFormatter={(value: string) => formatDateBr(value).slice(0, 5)} stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false} width={32} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(value) => formatDateBr(String(value))}
                  formatter={(value, name) => [formatNumber(Number(value)), name === 'assistiram75' ? 'Assistiram 75%+' : 'Espectadores']}
                />
                <Area type="monotone" dataKey="espectadores" stroke={GOLD} strokeWidth={2.4} fill="url(#videoViewersFill)" />
                <Area type="monotone" dataKey="assistiram75" stroke="var(--ink)" strokeWidth={1.6} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="surface-card p-4">
          <p className="section-label">Por página</p>
          <h3 className="section-title mt-1 mb-3">Onde o vídeo é visto</h3>
          <div className="space-y-2 text-sm">
            {data.porPagina.map((linha) => (
              <div key={linha.rotulo} className="flex items-baseline justify-between gap-2">
                <span className="text-zinc-300">{linha.rotulo}</span>
                <span className="text-right text-zinc-50">
                  <b>{formatNumber(linha.espectadores)}</b>
                  <span className="text-xs text-zinc-500"> de {formatNumber(linha.visitantes)} visitas ({rate(linha.espectadores, linha.visitantes)})</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="surface-card p-4">
          <p className="section-label">Por aparelho</p>
          <h3 className="section-title mt-1 mb-3">Celular ou computador</h3>
          <div className="space-y-2 text-sm">
            {data.porAparelho.map((linha) => (
              <div key={linha.aparelho} className="flex items-baseline justify-between gap-2">
                <span className="text-zinc-300">{DEVICE_LABELS[linha.aparelho] ?? linha.aparelho}</span>
                <span className="text-right text-zinc-50">
                  <b>{formatNumber(linha.espectadores)}</b>
                  <span className="text-xs text-zinc-500"> · {rate(linha.assistiram75, linha.espectadores)} vão a 75%+</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="surface-card p-4" data-tour="Vídeo e venda" data-tour-text="Compara quem assistiu quase tudo com quem assistiu menos, só entre as pessoas que já preencheram o formulário (aí dá para saber quem comprou).">
        <p className="section-label">Vídeo e venda</p>
        <h3 className="section-title mt-1 mb-3">Quem assistiu mais comprou mais?</h3>
        {conv.identificados === 0 ? (
          <p className="text-sm text-zinc-400">Ainda não há espectadores que tenham preenchido o formulário. Quando houver, a comparação aparece aqui.</p>
        ) : (
          <>
            <div className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-zinc-300">Assistiram 75% ou mais</span>
                <span className="text-zinc-50">
                  <b>{formatNumber(conv.assistiram75.compraram)}</b> de {formatNumber(conv.assistiram75.pessoas)} compraram
                  <span className="text-xs text-zinc-500"> ({rate(conv.assistiram75.compraram, conv.assistiram75.pessoas)})</span>
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-zinc-300">Assistiram menos</span>
                <span className="text-zinc-50">
                  <b>{formatNumber(conv.outros.compraram)}</b> de {formatNumber(conv.outros.pessoas)} compraram
                  <span className="text-xs text-zinc-500"> ({rate(conv.outros.compraram, conv.outros.pessoas)})</span>
                </span>
              </div>
            </div>
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
  const [video, setVideo] = useState('vsl')

  const query = useQuery({
    queryKey: ['videos', video, dias],
    queryFn: () => fetchVideoMetrics(video, dias),
    retry: false,
  })

  const data = query.data
  const error = query.error as Error | null
  // A VSL sempre aparece na lista, mesmo sem reproduções; os demais vídeos só quando têm dados no período.
  const opcoes = [{ nome: 'vsl' }, ...(data?.videosDisponiveis ?? []).filter((item) => item.nome !== 'vsl')]

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHero>
        <p className="section-label">Operação</p>
        <Typewriter as="h2" className="section-title mt-1" text="Vídeos" />
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          Como o vídeo das páginas de venda está sendo visto: quantos dão play, até onde chegam e se isso tem relação com a compra.
        </p>
      </PageHero>

      <section className="surface-card filter-bar filter-grid" data-tour="Filtros do vídeo" data-tour-text="Escolha o vídeo e o período. Os números contam pessoas, não cliques: quem pausa e retoma conta uma vez só.">
        <select className="filter-select" aria-label="Vídeo" value={video} onChange={(event) => setVideo(event.target.value)}>
          {opcoes.map((item) => (
            <option key={item.nome} value={item.nome}>
              {videoLabel(item.nome)}
            </option>
          ))}
        </select>
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

      {/* O controle é da VSL (os depoimentos não usam o player hospedado). */}
      {video === 'vsl' && <PlayerControl video="vsl" />}

      {data && !error && (
        <p className="text-xs text-zinc-500">
          Conta só quem aceitou os cookies: mostra a tendência, não o total de visitantes. Atualizado a cada 5 minutos
          {data.atualizadoEm ? ` (última leitura ${new Date(data.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})` : ''}.
        </p>
      )}
    </div>
  )
}
