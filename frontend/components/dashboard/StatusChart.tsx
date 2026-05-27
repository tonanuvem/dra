'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { getStatusCorrelacaoLabel } from '@/lib/utils'

// Cores semânticas por status (resto usa fallback)
const STATUS_COLORS: Record<string, string> = {
  CORRELACIONADO:                              '#22c55e',
  NAO_FATURADO_NO_REPASSE:                     '#ef4444',
  REPASSE_NAO_IDENTIFICADO_NA_PRODUCAO:        '#8b5cf6',
  CORRELACIONADO_COM_GLOSA_PARCIAL:            '#f97316',
  CORRELACIONADO_VIA_NR_ATENDIMENTO:           '#06b6d4',
  CORRELACIONADO_PROCEDIMENTO_ADICIONAL:       '#14b8a6',
  CORRELACIONADO_FALLBACK_2:                   '#eab308',
  CORRELACIONADO_FALLBACK_1:                   '#a78bfa',
  CORRELACIONADO_PROCEDIMENTO_DIVERGENTE:      '#f43f5e',
  REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO:       '#64748b',
}
const FALLBACK_PALETTE = ['#94a3b8', '#cbd5e1', '#bae6fd', '#fde68a', '#bbf7d0']

interface StatusChartProps {
  data: { status: string; total: number; valor: number }[]
}

export function StatusChart({ data }: StatusChartProps) {
  const total = data.reduce((s, d) => s + d.total, 0)

  const chartData = data.map((d, i) => ({
    raw:   d.status,
    name:  getStatusCorrelacaoLabel(d.status as any) ?? d.status,
    value: d.total,
    pct:   total > 0 ? ((d.total / total) * 100).toFixed(1) : '0.0',
    color: STATUS_COLORS[d.status] ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length],
  }))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-5">
      <h3 className="text-sm font-semibold text-gray-700">Distribuição por Status</h3>

      {/* ── Donut ─────────────────────────────────────── */}
      <div className="w-full" style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={88}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null
                const d = payload[0].payload
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 max-w-[220px]">
                    <p className="text-xs font-semibold text-gray-800 leading-snug mb-1">{d.name}</p>
                    <p className="text-xs text-gray-500">
                      {Number(d.value).toLocaleString('pt-BR')} registros
                      <span className="ml-1 font-medium text-gray-700">({d.pct}%)</span>
                    </p>
                  </div>
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* ── Legenda customizada ───────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
        {chartData.map((entry, i) => (
          <div key={i} className="flex items-start gap-2 min-w-0">
            <span
              className="mt-[3px] w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <div className="min-w-0 flex-1 flex items-start justify-between gap-1">
              <span className="text-xs text-gray-600 leading-snug">{entry.name}</span>
              <span className="text-xs font-semibold text-gray-700 flex-shrink-0 tabular-nums">
                {Number(entry.value).toLocaleString('pt-BR')}
                <span className="font-normal text-gray-400 ml-0.5">({entry.pct}%)</span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
