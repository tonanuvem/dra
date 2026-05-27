'use client'

import { useState, useMemo, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useCorrelacoes } from '@/hooks/useCorrelacoes'
import { StatusCorrelacaoBadge, StatusTUSSBadge } from '@/components/shared/StatusBadge'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { Correlacao } from '@/lib/types'
import { Download, AlertTriangle, Loader2, FileText, Info, TrendingDown } from 'lucide-react'
import * as XLSX from 'xlsx'

type TabType = 'downgrade' | 'ausente' | 'nao_faturado'

const TAB_CONFIG = {
  downgrade: {
    label: '🔴 Cobrado Como Simples',
    statusTUSS: ['TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES'],
    description: 'Adicional pago com código simples — cobrar diferença',
  },
  ausente: {
    label: '🟠 Código Adicional Ausente',
    statusTUSS: ['TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE'],
    description: 'Código adicional não faturado separadamente',
  },
  nao_faturado: {
    label: '❌ Não Faturados',
    statusTUSS: ['TUSS_NAO_FATURADO_MAPEADO'],
    description: 'Procedimento inteiro sem pagamento',
  },
} as const

function FaturamentoContent() {
  const searchParams = useSearchParams()
  const tabParam = (searchParams.get('tab') ?? 'downgrade') as TabType
  const [activeTab, setActiveTab] = useState<TabType>(tabParam)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [includeNegative, setIncludeNegative] = useState(false)

  const { data, loading } = useCorrelacoes({
    statusTUSS: [...TAB_CONFIG[activeTab].statusTUSS] as any[],
    limit: 1000,
  })

  // For downgrade tab, auto-deselect negative values by default
  const processedData = useMemo(() => {
    return data.map(row => {
      const valorRecuperar = calcularValorRecuperar(row, activeTab)
      return { ...row, valorRecuperar }
    })
  }, [data, activeTab])

  // Initialize selection: exclude negative by default
  useMemo(() => {
    const newSelected = new Set<string>()
    processedData.forEach(row => {
      const v = row.valorRecuperar
      if (v !== null && (v > 0 || includeNegative)) {
        newSelected.add(row.ChaveCorrelacao)
      }
    })
    setSelected(newSelected)
  }, [processedData, includeNegative])

  const toggleRow = (chave: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(chave)) next.delete(chave)
      else next.add(chave)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === processedData.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(processedData.map(r => r.ChaveCorrelacao)))
    }
  }

  const selectedRows = processedData.filter(r => selected.has(r.ChaveCorrelacao))
  const totalSelecionado = selectedRows.reduce((acc, r) => acc + (r.valorRecuperar ?? 0), 0)
  const negativos = processedData.filter(r => (r.valorRecuperar ?? 0) < 0).length

  const exportXLSX = useCallback(() => {
    const rows = selectedRows.map(r => ({
      'Nr. Atendimento': r.NrAtendimento_REPASSE ?? r.NrAtendimento_PRODUCAO ?? '',
      'Data': formatDate(r.Data_PRODUCAO ?? r.Data_REPASSE),
      'Paciente': r.Paciente_PRODUCAO ?? r.Paciente_REPASSE ?? '',
      'Convênio': r.Convenio_PRODUCAO ?? r.Convenio_REPASSE ?? '',
      'Prestador': r.MedicoExecutor_PRODUCAO ?? '',
      'Cód. TUSS Pago': r.CodigoTUSS_REPASSE ?? '',
      'Cód. TUSS Esperado': r.CodigosTUSS_Esperados ?? '',
      'Procedimento TUSS': r.DescricaoTUSS ?? r.Procedimento_REPASSE ?? '',
      'Valor Recebido': r.ValorLiberado_REPASSE ?? 0,
      'Valor a Recuperar': r.valorRecuperar ?? 0,
      'Observação': buildObservacao(r, activeTab),
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Cobrança')
    XLSX.writeFile(wb, `formulario_cobranca_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }, [selectedRows, activeTab])

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Gerenciamento de Faturamento</h1>
          <p className="text-sm text-gray-500 mt-0.5">Recuperações financeiras por categoria</p>
        </div>
        <button
          onClick={exportXLSX}
          disabled={selected.size === 0}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          Gerar Formulário ({selected.size})
          {totalSelecionado > 0 && <span className="text-blue-200">· {formatCurrency(totalSelecionado)}</span>}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(Object.keys(TAB_CONFIG) as TabType[]).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setSelected(new Set()) }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {TAB_CONFIG[tab].label}
          </button>
        ))}
      </div>

      <p className="text-sm text-gray-500">{TAB_CONFIG[activeTab].description}</p>

      {/* Negative warning */}
      {activeTab === 'downgrade' && negativos > 0 && (
        <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-800">
              {negativos} item(s) com recuperação negativa excluídos automaticamente
            </p>
            <p className="text-xs text-yellow-700 mt-0.5">
              O convênio paga mais pelo código simples que pelo código correto. Incluir esses itens geraria cobrança indevida.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-yellow-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeNegative}
              onChange={e => setIncludeNegative(e.target.checked)}
              className="rounded"
            />
            Incluir mesmo assim
          </label>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : processedData.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum registro nesta categoria</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Summary bar */}
          <div className="flex items-center gap-6 px-5 py-3 bg-gray-50 border-b border-gray-200 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.size === processedData.length}
                onChange={toggleAll}
                className="rounded"
              />
              <span className="text-gray-600">Selecionar todos ({processedData.length})</span>
            </label>
            <span className="text-gray-400">|</span>
            <span className="font-medium text-blue-700">{selected.size} selecionados</span>
            <span className="text-gray-400">|</span>
            <span className="font-semibold text-green-700">Total: {formatCurrency(totalSelecionado)}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left w-10"></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Paciente</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Convênio</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cód. Pago</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cód. Esperado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Recebido</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">A Recuperar</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {processedData.map(row => {
                  const isNegative = (row.valorRecuperar ?? 0) < 0
                  const isChecked = selected.has(row.ChaveCorrelacao)

                  return (
                    <tr
                      key={row.ChaveCorrelacao}
                      className={`hover:bg-gray-50 transition-colors ${isNegative ? 'bg-yellow-50' : ''} ${!isChecked ? 'opacity-60' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleRow(row.ChaveCorrelacao)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 truncate max-w-40">
                          {row.Paciente_PRODUCAO ?? row.Paciente_REPASSE}
                        </p>
                        <p className="text-xs text-gray-500">{row.NrAtendimento_REPASSE}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {formatDate(row.Data_PRODUCAO ?? row.Data_REPASSE)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 truncate max-w-28">
                        {row.Convenio_PRODUCAO ?? row.Convenio_REPASSE}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-gray-700">{row.CodigoTUSS_REPASSE ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-blue-700">{row.CodigosTUSS_Esperados ?? '—'}</span>
                        {row.DescricaoTUSS && (
                          <p className="text-xs text-gray-400 truncate max-w-36">{row.DescricaoTUSS}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {formatCurrency(row.ValorLiberado_REPASSE)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isNegative && <TrendingDown className="w-3 h-3 text-yellow-500" />}
                          <span className={`font-semibold ${
                            isNegative ? 'text-yellow-600' :
                            (row.valorRecuperar ?? 0) > 0 ? 'text-green-700' : 'text-gray-400'
                          }`}>
                            {formatCurrency(row.valorRecuperar)}
                          </span>
                        </div>
                        {isNegative && (
                          <p className="text-xs text-yellow-600 text-right">Negativo — excluído</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusTUSSBadge status={row.StatusTUSS} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function calcularValorRecuperar(row: Correlacao & { valorRecuperar?: number | null }, tab: TabType): number | null {
  const estimado = row.ValorEstimado_TUSS
  const recebido = row.ValorLiberado_REPASSE

  if (tab === 'downgrade') {
    if (estimado == null) return null
    return estimado - (recebido ?? 0)
  }
  if (tab === 'ausente') return estimado ?? null
  if (tab === 'nao_faturado') return estimado ?? null
  return null
}

function buildObservacao(row: Correlacao, tab: TabType): string {
  if (tab === 'downgrade') {
    return `Faturado como ${row.CodigoTUSS_REPASSE}. Correto conforme TUSS: ${row.CodigosTUSS_Esperados} — ${row.DescricaoTUSS}. Solicita revisão e reprocessamento.`
  }
  if (tab === 'ausente') {
    return `Código adicional ausente no repasse: ${row.CodigosTUSS_Ausentes}. Procedimento realizado: ${row.ProcedimentosAdicionais_PRODUCAO}.`
  }
  return `Procedimento realizado em ${row.Data_PRODUCAO} não identificado no repasse. Solicita inclusão.`
}

export default function FaturamentoPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
      <FaturamentoContent />
    </Suspense>
  )
}
