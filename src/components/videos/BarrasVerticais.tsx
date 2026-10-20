import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface Barra {
  nome: string
  valor: number
  /** Rótulo em cima da barra (padrão: o valor). */
  texto?: string
  /** Linha extra mostrada ao passar o mouse ou tocar na barra. */
  dica?: string
}

const COR = '#ff8a1f'
const TOOLTIP_STYLE = {
  background: 'var(--card)',
  border: '3px solid var(--line)',
  borderRadius: 10,
  boxShadow: '3px 3px 0 var(--shade)',
  color: 'var(--ink)',
  fontSize: 12,
}

/** Gráfico de barras na vertical com o valor em cima de cada barra. */
export function BarrasVerticais({ dados, altura = 190, rotulo }: { dados: Barra[]; altura?: number; rotulo: string }) {
  const maior = Math.max(1, ...dados.map((item) => item.valor))
  return (
    <div style={{ width: '100%', height: altura }} role="img" aria-label={rotulo}>
      <ResponsiveContainer>
        <BarChart data={dados} margin={{ top: 22, right: 8, left: 8, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="nome" stroke="var(--muted)" tick={{ fontSize: 11 }} tickLine={false} interval={0} />
          <YAxis hide domain={[0, Math.ceil(maior * 1.1)]} />
          <Tooltip
            cursor={{ fill: 'var(--chart-grid)' }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(valor, _nome, item) => [(item.payload as Barra).dica ?? String(valor), (item.payload as Barra).nome]}
            separator=": "
          />
          <Bar dataKey="valor" fill={COR} stroke="var(--line)" strokeWidth={2} radius={[8, 8, 0, 0]} minPointSize={3} isAnimationActive={false}>
            <LabelList
              position="top"
              fill="var(--ink)"
              fontSize={12}
              fontWeight={800}
              valueAccessor={(entrada) => {
                const barra = (entrada as unknown as { payload: Barra }).payload
                return barra.texto ?? String(barra.valor)
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
