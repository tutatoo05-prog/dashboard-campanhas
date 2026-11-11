import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCurrency } from '@/lib/format.ts'
import type { Financas } from '@/services/financasService.ts'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
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

// Cada plataforma com a cor da propria marca; custo cinza e lucro amarelo para nao brigar com o vermelho do YouTube.
const COR = {
  ganho: '#1baf7a',
  custo: '#8a8984',
  lucro: '#eda100',
  prejuizo: '#d03b3b',
  meta: '#1877f2',
}
const FONTES: Record<string, { rotulo: string; cor: string }> = {
  hotmart: { rotulo: 'Hotmart', cor: '#f26a1b' },
  youtube: { rotulo: 'YouTube', cor: '#ff0000' },
  principia: { rotulo: 'Principia', cor: '#7c3aed' },
  asaas: { rotulo: 'Asaas', cor: '#2f5bff' },
  pix_ted: { rotulo: 'Pix / TED', cor: '#32bcad' },
  stripe: { rotulo: 'Stripe', cor: '#a29bff' },
  facebook: { rotulo: 'Facebook', cor: '#1877f2' },
}

const soma = (valores: number[]) => valores.reduce((a, v) => a + v, 0)

function compacto(v: number) {
  const abs = Math.abs(v)
  const texto = abs >= 1000 ? `${(abs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(Math.round(abs))
  return v < 0 ? `-${texto}` : texto
}

function Bloco({ titulo, descricao, legenda, altura = 260, children }: { titulo: string; descricao: string; legenda?: { rotulo: string; cor: string }[]; altura?: number; children: ReactNode }) {
  return (
    <section className="surface-card p-4">
      <p className="section-label">{titulo}</p>
      <p className="mb-3 mt-0.5 text-xs text-zinc-500">{descricao}</p>
      {legenda && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
          {legenda.map((item) => (
            <li key={item.rotulo} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: item.cor }} aria-hidden />
              {item.rotulo}
            </li>
          ))}
        </ul>
      )}
      <div className="w-full" style={{ height: altura }}>
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function Resumo({ rotulo, valor, dica, cor }: { rotulo: string; valor: string; dica: string; cor?: string }) {
  return (
    <div className="kpi2">
      <p className="kpi2-label">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold" style={{ color: cor ?? 'var(--ink)' }}>
        {valor}
      </p>
      <p className="mt-0.5 text-xs text-zinc-500">{dica}</p>
    </div>
  )
}

export function FinancasGraficos({ dados }: { dados: Financas }) {
  const hoje = new Date()
  const ultimo = dados.ano < hoje.getFullYear() ? 11 : dados.ano > hoje.getFullYear() ? 0 : hoje.getMonth()
  // Do primeiro mes com movimento ate o mes atual (ou dezembro, em anos passados).
  const primeiro = Math.max(0, dados.meses.findIndex((_, i) => dados.totalReceita[i] !== 0 || dados.totalCusto[i] !== 0))
  const indices = Array.from({ length: Math.max(0, ultimo - primeiro + 1) }, (_, i) => primeiro + i)
  if (indices.length === 0) return null

  const valor = (id: string, tipo: 'receitas' | 'custos', i: number) => dados[tipo].find((l) => l.id === id)?.celulas[i]?.valor ?? 0
  const receitaAno = dados.anual.receita
  const custoAno = dados.anual.custo
  const lucroAno = dados.anual.lucro
  const margemAno = receitaAno > 0 ? (lucroAno / receitaAno) * 100 : 0
  const mesParcial = dados.ano === hoje.getFullYear()
  const ultimoRotulo = MESES[ultimo]
  const ultimoLucro = dados.lucro[ultimo]

  const porMes = indices.map((i) => ({
    nome: MESES[i],
    Ganhos: dados.totalReceita[i],
    Custos: dados.totalCusto[i],
    Lucro: dados.lucro[i] ?? dados.totalReceita[i] - dados.totalCusto[i],
  }))

  const fontesComValor = dados.receitas.filter((l) => FONTES[l.id] && soma(l.celulas.map((c) => c?.valor ?? 0)) !== 0)
  const empilhado = indices.map((i) => {
    const linha: Record<string, number | string> = { nome: MESES[i] }
    for (const f of fontesComValor) linha[FONTES[f.id].rotulo] = valor(f.id, 'receitas', i)
    return linha
  })
  const peso = fontesComValor
    .map((f) => ({ id: f.id, rotulo: FONTES[f.id].rotulo, cor: FONTES[f.id].cor, total: soma(f.celulas.map((c) => c?.valor ?? 0)) }))
    .sort((a, b) => b.total - a.total)
    .map((f) => ({ ...f, nome: `${f.rotulo} (${receitaAno > 0 ? Math.round((f.total / receitaAno) * 100) : 0}%)` }))

  const cascata = [
    { nome: 'Entrou', faixa: [0, receitaAno], cor: COR.ganho, sinal: '' },
    { nome: 'Saiu', faixa: [Math.min(lucroAno, receitaAno), receitaAno], cor: COR.custo, sinal: '-' },
    { nome: 'Sobrou', faixa: [0, lucroAno], cor: lucroAno >= 0 ? COR.lucro : COR.prejuizo, sinal: '' },
  ]

  const margem = indices.map((i) => {
    const r = dados.totalReceita[i]
    const l = dados.lucro[i] ?? r - dados.totalCusto[i]
    return { nome: MESES[i], real: r > 0 ? (l / r) * 100 : null, receita: r }
  })
  const margemGrafico = margem.map((m) => ({ ...m, Margem: m.real === null ? 0 : Math.max(-100, Math.min(100, m.real)) }))

  const custosPorMes = indices.map((i) => {
    const total = dados.totalCusto[i]
    const meta = Math.min(valor('anuncios', 'custos', i), total)
    return { nome: MESES[i], Operação: total - meta, 'Anúncios (Meta)': meta }
  })
  const temMeta = custosPorMes.some((c) => c['Anúncios (Meta)'] > 0)

  const eixoY = <YAxis stroke={AXIS} fontSize={12} width={52} tickFormatter={compacto} />
  const eixoX = <XAxis dataKey="nome" stroke={AXIS} fontSize={12} />
  const grade = <CartesianGrid stroke={GRID} vertical={false} />
  const dica = (v: unknown) => formatCurrency(Number(v))

  return (
    <div className="space-y-4">
      <div className="kpi-grid">
        <Resumo rotulo="Entrou no ano" valor={formatCurrency(receitaAno)} dica="Todas as fontes" cor={COR.ganho} />
        <Resumo rotulo="Saiu no ano" valor={formatCurrency(custoAno)} dica="Operação + anúncios" cor={COR.custo} />
        <Resumo rotulo="Lucro no ano" valor={formatCurrency(lucroAno)} dica={`Margem de ${margemAno.toFixed(1).replace('.', ',')}%`} cor={lucroAno >= 0 ? COR.lucro : COR.prejuizo} />
        {mesParcial && ultimoLucro !== null && (
          <Resumo rotulo={`${ultimoRotulo} (parcial)`} valor={formatCurrency(ultimoLucro)} dica="Mês em andamento" cor={ultimoLucro >= 0 ? COR.lucro : COR.prejuizo} />
        )}
      </div>

      <Bloco
        titulo="Entrou, saiu e sobrou por mês"
        descricao="Verde entra, cinza sai, a linha amarela é o lucro."
        legenda={[
          { rotulo: 'Ganhos', cor: COR.ganho },
          { rotulo: 'Custos', cor: COR.custo },
          { rotulo: 'Lucro', cor: COR.lucro },
        ]}
        altura={280}
      >
        <ComposedChart data={porMes}>
          {grade}
          {eixoX}
          {eixoY}
          <ReferenceLine y={0} stroke={AXIS} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={dica} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
          <Bar dataKey="Ganhos" fill={COR.ganho} radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Bar dataKey="Custos" fill={COR.custo} radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Line dataKey="Lucro" stroke={COR.lucro} strokeWidth={2} dot={{ r: 4, fill: COR.lucro }} connectNulls />
        </ComposedChart>
      </Bloco>

      <Bloco
        titulo="De onde veio o dinheiro, mês a mês"
        descricao="Cada cor é a cor da própria plataforma."
        legenda={fontesComValor.map((f) => ({ rotulo: FONTES[f.id].rotulo, cor: FONTES[f.id].cor }))}
        altura={280}
      >
        <BarChart data={empilhado}>
          {grade}
          {eixoX}
          {eixoY}
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={dica} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
          {fontesComValor.map((f) => (
            <Bar key={f.id} dataKey={FONTES[f.id].rotulo} stackId="fontes" fill={FONTES[f.id].cor} maxBarSize={40} stroke="var(--card)" strokeWidth={1} />
          ))}
        </BarChart>
      </Bloco>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloco titulo="Peso de cada fonte no ano" descricao={`Total de ${formatCurrency(receitaAno)}.`} altura={Math.max(220, peso.length * 38 + 40)}>
          <BarChart data={peso} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid stroke={GRID} horizontal={false} />
            <XAxis type="number" stroke={AXIS} fontSize={12} tickFormatter={compacto} />
            <YAxis type="category" dataKey="nome" stroke={AXIS} fontSize={12} width={116} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={dica} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
            <Bar dataKey="total" name="Ano" radius={[0, 4, 4, 0]} maxBarSize={24}>
              {peso.map((f) => (
                <Cell key={f.id} fill={f.cor} />
              ))}
            </Bar>
          </BarChart>
        </Bloco>

        <Bloco titulo="Cascata do ano" descricao="Do que entrou até o que sobrou." altura={Math.max(220, peso.length * 38 + 40)}>
          <BarChart data={cascata}>
            {grade}
            {eixoX}
            {eixoY}
            <ReferenceLine y={0} stroke={AXIS} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              formatter={(v) => {
                const [de, ate] = v as unknown as [number, number]
                return formatCurrency(ate - de)
              }}
            />
            <Bar dataKey="faixa" name="Ano" radius={[4, 4, 0, 0]} maxBarSize={70}>
              {cascata.map((c) => (
                <Cell key={c.nome} fill={c.cor} />
              ))}
            </Bar>
          </BarChart>
        </Bloco>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloco titulo="Quanto de cada R$ 100 virou lucro" descricao="Margem mensal. Abaixo de zero é prejuízo." altura={240}>
          <BarChart data={margemGrafico}>
            {grade}
            {eixoX}
            <YAxis stroke={AXIS} fontSize={12} width={52} domain={[-100, 100]} tickFormatter={(v: number) => `${v}%`} />
            <ReferenceLine y={0} stroke={AXIS} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              formatter={(_, __, item) => {
                const real = (item.payload as { real: number | null }).real
                if (real === null) return 'Sem ganhos no mês'
                return real < -100 ? 'menos de -100%' : `${real.toFixed(1).replace('.', ',')}%`
              }}
            />
            <Bar dataKey="Margem" radius={[4, 4, 0, 0]} maxBarSize={26}>
              {margemGrafico.map((m) => (
                <Cell key={m.nome} fill={m.real !== null && m.real < 0 ? COR.prejuizo : COR.lucro} />
              ))}
            </Bar>
          </BarChart>
        </Bloco>

        <Bloco
          titulo="Custos: operação e anúncios Meta"
          descricao={temMeta ? 'Os anúncios (Meta) vêm da integração; o resto do gasto é operação.' : 'Sem anúncios Meta lançados neste período.'}
          legenda={[
            { rotulo: 'Operação', cor: COR.custo },
            { rotulo: 'Anúncios (Meta)', cor: COR.meta },
          ]}
          altura={240}
        >
          <BarChart data={custosPorMes}>
            {grade}
            {eixoX}
            {eixoY}
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={dica} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
            <Bar dataKey="Operação" stackId="c" fill={COR.custo} maxBarSize={32} stroke="var(--card)" strokeWidth={1} />
            <Bar dataKey="Anúncios (Meta)" stackId="c" fill={COR.meta} maxBarSize={32} stroke="var(--card)" strokeWidth={1} />
          </BarChart>
        </Bloco>
      </div>

      {mesParcial && <p className="text-xs text-zinc-500">{ultimoRotulo} está em andamento: os números mudam conforme as vendas e os gastos chegam.</p>}
    </div>
  )
}
