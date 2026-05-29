'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { getStatusCorrelacaoLabel } from '@/lib/utils'

const STATUS_COLORS: Record<string, string> = {
  CORRELACIONADO:                        '#22c55e',
  NAO_FATURADO_NO_REPASSE:               '#ef4444',
  REPASSE_NAO_IDENTIFICADO_NA_PRODUCAO:  '#8b5cf6',
  REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO: '#64748b',
}

const TUSS_COLORS: Record<string, string> = {
  TUSS_OK:     '#22c55e',
  TUSS_COBRAR: '#ef4444',
  TUSS_MANUAL: '#f59e0b',
}

const TUSS_LABELS: Record<string, string> = {
  TUSS_OK:     'Código TUSS Pago e Conferido',
  TUSS_COBRAR: 'A Cobrar',
  TUSS_MANUAL: 'Análise Manual Necessária',
}

const FALLBACK_PALETTE = ['#94a3b8', '#cbd5e1', '#bae6fd', '#fde68a', '#bbf7d0']

function fmtBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface StatusChartProps {
  data: { status: string; total: number; valor: number; valorPago: number }[]
  showFinancial?: boolean
  mode?: 'correlacao' | 'tuss'
}

export function StatusChart({ data, showFinancial = true, mode = 'correlacao' }: StatusChartProps) {
  const isTUSS = mode === 'tuss'
  const totalRegistros = data.reduce((s, d) => s + d.total, 0)
  const totalValorPago = data.reduce((s, d) => s + d.valorPago, 0)

  const chartData = data.map((d, i) => ({
    raw:       d.status,
    name:      isTUSS
                 ? (TUSS_LABELS[d.status] ?? d.status)
                 : (getStatusCorrelacaoLabel(d.status as any) ?? d.status),
    value:     d.total,
    valorPago: d.valorPago,
    pctReg:    totalRegistros > 0 ? ((d.total     / totalRegistros) * 100).toFixed(1) : '0.0',
    pctValor:  totalValorPago > 0 ? ((d.valorPago / totalValorPago) * 100).toFixed(1) : '0.0',
    color:     isTUSS
                 ? (TUSS_COLORS[d.status] ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length])
                 : (STATUS_COLORS[d.status] ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length]),
  }))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-5">

      {/* ── Cabeçalho ──────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-sm font-semibold text-gray-700">
          {isTUSS ? 'Verificação TUSS do Repasse' : 'Distribuição por Status de Correlação'}
        </h3>
        {showFinancial && totalValorPago > 0 && (
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] text-gray-400 leading-tight">Total pago no repasse</p>
            <p className="text-sm font-bold text-emerald-700 tabular-nums">{fmtBRL(totalValorPago)}</p>
          </div>
        )}
      </div>

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
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 max-w-[240px]">
                    <p className="text-xs font-semibold text-gray-800 leading-snug mb-2">{d.name}</p>
                    <div className="space-y-1">
                      <div className="flex justify-between gap-4 text-xs">
                        <span className="text-gray-500">Registros</span>
                        <span className="font-medium text-gray-800 tabular-nums">
                          {Number(d.value).toLocaleString('pt-BR')}
                          <span className="text-gray-400 ml-1">({d.pctReg}%)</span>
                        </span>
                      </div>
                      {showFinancial && (
                        <div className="flex justify-between gap-4 text-xs">
                          <span className="text-gray-500">Valor pago</span>
                          <span className={`font-semibold tabular-nums ${d.valorPago > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>
                            {d.valorPago > 0 ? fmtBRL(d.valorPago) : '—'}
                            {d.valorPago > 0 && totalValorPago > 0 && (
                              <span className="text-gray-400 font-normal ml-1">({d.pctValor}%)</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* ── Legenda customizada ───────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
        {chartData.map((entry, i) => (
          <div key={i} className="flex items-start gap-2 min-w-0">
            {/* Bolinha colorida */}
            <span
              className="mt-[3px] w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.color }}
            />

            <div className="min-w-0 flex-1">
              {/* Linha 1: nome + contagem */}
              <div className="flex items-start justify-between gap-1">
                <span className="text-xs text-gray-700 leading-snug">{entry.name}</span>
                <span className="text-xs font-semibold text-gray-600 flex-shrink-0 tabular-nums ml-1">
                  {Number(entry.value).toLocaleString('pt-BR')}
                  <span className="font-normal text-gray-400 ml-0.5">({entry.pctReg}%)</span>
                </span>
              </div>

              {/* Linha 2: valor financeiro (só para financeiro/admin) */}
              {showFinancial && (
                <div className="flex items-center justify-end gap-1 mt-0.5">
                  {entry.valorPago > 0 ? (
                    <span className="text-[11px] font-semibold text-emerald-700 tabular-nums">
                      {fmtBRL(entry.valorPago)}
                      <span className="text-[10px] font-normal text-gray-400 ml-1">({entry.pctValor}% do total)</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-300 italic">sem valor no repasse</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
