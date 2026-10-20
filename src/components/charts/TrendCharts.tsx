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

export function TrendCharts({ data, stacked = false }: { data: DailyPoint[]; stacked?: boolean }) {
  if (data.length < 2) return null

  return (
    <section className={`trend-grid ${stacked ? 'trend-stacked' : ''}`}>
      <ChartCard title="Investimento por dia">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
