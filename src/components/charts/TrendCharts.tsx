import type { ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency, formatNumber } from '@/lib/format.ts'
import { formatDateBr } from '@/lib/period.ts'
import type { DailyPoint } from '@/lib/dailySeries.ts'

const GOLD = '#d4a054'
const GRID = 'rgba(255,255,255,0.06)'
const AXIS = '#71717a'
const TOOLTIP_STYLE = {
  background: '#0c0c0f',
  border: '1px solid rgba(212,160,84,0.2)',
  borderRadius: 8,
  fontSize: 12,
}

function shortDate(value: string): string {
  return formatDateBr(value).slice(0, 5)
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="surface-card p-4">
      <p className="section-label mb-3">{title}</p>
      <div style={{ width: '100%', height: 160 }}>{children}</div>
    </div>
  )
}

export function TrendCharts({ data }: { data: DailyPoint[] }) {
  if (data.length < 2) return null

  return (
    <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <ChartCard title="Investimento por dia">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="dashSpendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
                <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fill: AXIS, fontSize: 11 }}
              axisLine={{ stroke: GRID }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              tick={{ fill: AXIS, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(value: number) => formatCurrency(value).replace('R$', '').trim()}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(value) => formatDateBr(String(value))}
              formatter={(value) => [formatCurrency(Number(value)), 'Gasto']}
            />
            <Area type="monotone" dataKey="spend" stroke={GOLD} strokeWidth={2} fill="url(#dashSpendFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Leads por dia">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fill: AXIS, fontSize: 11 }}
              axisLine={{ stroke: GRID }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(value) => formatDateBr(String(value))}
              formatter={(value) => [formatNumber(Number(value)), 'Leads']}
            />
            <Bar dataKey="leads" fill={GOLD} radius={[3, 3, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Custo por lead">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fill: AXIS, fontSize: 11 }}
              axisLine={{ stroke: GRID }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              tick={{ fill: AXIS, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(value: number) => formatCurrency(value).replace('R$', '').trim()}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(value) => formatDateBr(String(value))}
              formatter={(value) => [value == null ? '—' : formatCurrency(Number(value)), 'CPL']}
            />
            <Line
              type="monotone"
              dataKey="cpl"
              stroke={GOLD}
              strokeWidth={2}
              dot={{ r: 3, fill: GOLD, strokeWidth: 0 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </section>
  )
}
