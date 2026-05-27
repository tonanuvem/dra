'use client'

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { getStatusCorrelacaoLabel } from '@/lib/utils'

const COLORS = ['#22c55e', '#ef4444', '#f97316', '#eab308', '#8b5cf6', '#06b6d4', '#64748b', '#ec4899', '#84cc16', '#f43f5e']

interface StatusChartProps {
  data: { status: string; total: number; valor: number }[]
}

export function StatusChart({ data }: StatusChartProps) {
  const chartData = data.map(d => ({
    name: getStatusCorrelacaoLabel(d.status as any) ?? d.status,
    value: d.total,
    valor: d.valor,
  }))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Distribuição por Status</h3>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="45%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((_, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => [Number(value).toLocaleString('pt-BR'), '']}
          />
          <Legend
            formatter={(value) => <span className="text-xs text-gray-600">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
