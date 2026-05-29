'use client'

import { useState, useMemo, useCallback, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useCorrelacoes } from '@/hooks/useCorrelacoes'
import { StatusTUSSBadge, StatusCorrelacaoBadge } from '@/components/shared/StatusBadge'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { Correlacao } from '@/lib/types'
import {
  Download, AlertTriangle, Loader2, FileText, TrendingDown,
  X, ChevronLeft, ChevronRight, Info,
} from 'lucide-react'
import * as XLSX from 'xlsx'

// ─────────────────────────────────────────────────────────
// Tipos e configuração das abas
// ─────────────────────────────────────────────────────────
type TabType = 'todos' | 'downgrade' | 'ausente' | 'nao_faturado'

const TAB_CONFIG: Record<TabType, {
  label: string
  statusTUSS: string[]
  description: string
}> = {
  todos: {
    label: '📋 Todos',
    statusTUSS: [
      'COBRAR_TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES',
      'COBRAR_TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE',
      'COBRAR_TUSS_NAO_FATURADO_MAPEADO',
      'COBRAR_TUSS_CODIGO_PRINCIPAL_DOWNGRADE',
    ],
    description: 'Todos os itens com potencial de recuperação financeira',
  },
  downgrade: {
    label: '🔴 Cobrado Como Simples',
    statusTUSS: [
      'COBRAR_TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES',
      'COBRAR_TUSS_CODIGO_PRINCIPAL_DOWNGRADE',
    ],
    description: 'Código pago mais simples do que o realizado — cobrar diferença',
  },
  ausente: {
    label: '🟠 Código Adicional Ausente',
    statusTUSS: ['COBRAR_TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE'],
    description: 'Código adicional não faturado separadamente',
  },
  nao_faturado: {
    label: '❌ Não Faturados',
    statusTUSS: ['COBRAR_TUSS_NAO_FATURADO_MAPEADO'],
    description: 'Procedimento inteiro sem pagamento no repasse',
  },
}

type ProcessedRow = Correlacao & { valorRecuperar: number | null }

// ─────────────────────────────────────────────────────────
// Modal de detalhe — Produção × Repasse
// ─────────────────────────────────────────────────────────
function FieldRow({
  label, left, right, diverge,
}: {
  label: string
  left?: string | null
  right?: string | null
  diverge?: boolean
}) {
  return (
    <div className={`grid grid-cols-2 gap-3 py-2.5 border-b border-gray-100 last:border-0 ${diverge ? 'bg-red-50 -mx-5 px-5' : ''}`}>
      <div>
        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
        <p className={`text-sm leading-snug ${diverge ? 'font-semibold text-red-700' : 'font-medium text-gray-900'}`}>
          {left || '—'}
        </p>
      </div>
      <div>
        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{label} (Repasse)</p>
        <p className={`text-sm leading-snug ${diverge ? 'font-semibold text-red-700' : 'font-medium text-gray-900'}`}>
          {right || '—'}
        </p>
      </div>
    </div>
  )
}

function RowDetailModal({
  rows, index, onClose, onNavigate,
}: {
  rows: ProcessedRow[]
  index: number
  onClose: () => void
  onNavigate: (i: number) => void
}) {
  const row = rows[index]

  // Navegar com teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      onClose()
      if (e.key === 'ArrowRight' && index < rows.length - 1) onNavigate(index + 1)
      if (e.key === 'ArrowLeft'  && index > 0)               onNavigate(index - 1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [index, rows.length, onClose, onNavigate])

  if (!row) return null

  const valorRecebido  = row.ValorLiberado_REPASSE
  const valorEstimado  = row.ValorEstimado_TUSS
  const valorRecuperar = row.valorRecuperar

  const nameDiverge =
    !!row.Paciente_PRODUCAO && !!row.Paciente_REPASSE &&
    row.Paciente_PRODUCAO.trim().toUpperCase() !== row.Paciente_REPASSE.trim().toUpperCase()

  const convDiverge =
    !!row.Convenio_PRODUCAO && !!row.Convenio_REPASSE &&
    row.Convenio_PRODUCAO.trim().toUpperCase() !== row.Convenio_REPASSE.trim().toUpperCase()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* ── Cabeçalho ────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200 bg-gray-50">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900 leading-snug">
              {row.Paciente_PRODUCAO ?? row.Paciente_REPASSE ?? '—'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {formatDate(row.Data_PRODUCAO ?? row.Data_REPASSE)}
              {(row.NrAtendimento_REPASSE || row.NrAtendimento_PRODUCAO) && (
                <span className="ml-2 text-gray-400">
                  Nº {row.NrAtendimento_REPASSE ?? row.NrAtendimento_PRODUCAO}
                </span>
              )}
            </p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <StatusCorrelacaoBadge status={row.StatusCorrelacao} />
              <StatusTUSSBadge status={row.StatusTUSS} />
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-xs text-gray-400 mr-1 tabular-nums">{index + 1}/{rows.length}</span>
            <button
              onClick={() => onNavigate(index - 1)}
              disabled={index === 0}
              className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 transition-colors"
              title="Anterior (←)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigate(index + 1)}
              disabled={index === rows.length - 1}
              className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 transition-colors"
              title="Próximo (→)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors ml-1"
              title="Fechar (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Corpo ────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* Cabeçalhos das colunas */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded text-center">
              PRODUÇÃO (Clínica)
            </div>
            <div className="text-xs font-bold text-green-700 bg-green-50 px-3 py-1.5 rounded text-center">
              REPASSE (Hospital)
            </div>
          </div>

          <FieldRow
            label="Paciente"
            left={row.Paciente_PRODUCAO}
            right={row.Paciente_REPASSE}
            diverge={nameDiverge}
          />
          <FieldRow
            label="Data"
            left={formatDate(row.Data_PRODUCAO)}
            right={formatDate(row.Data_REPASSE)}
            diverge={!!row.Data_PRODUCAO && !!row.Data_REPASSE && row.Data_PRODUCAO !== row.Data_REPASSE}
          />
          <FieldRow
            label="Procedimento"
            left={row.Procedimento_PRODUCAO}
            right={row.Procedimento_REPASSE}
          />
          <FieldRow
            label="Convênio"
            left={row.Convenio_PRODUCAO}
            right={row.Convenio_REPASSE}
            diverge={convDiverge}
          />
          <FieldRow
            label="Nr. Atendimento"
            left={row.NrAtendimento_PRODUCAO}
            right={row.NrAtendimento_REPASSE}
          />

          {/* Adicional + Código TUSS */}
          <div className="grid grid-cols-2 gap-3 py-2.5">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Adicional (Produção)</p>
              <p className="text-sm text-gray-700">{row.ProcedimentosAdicionais_PRODUCAO || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Código TUSS Pago</p>
              <p className="text-sm font-mono text-gray-900">{row.CodigoTUSS_REPASSE || '—'}</p>
            </div>
          </div>

          {/* Código TUSS esperado */}
          {row.CodigosTUSS_Esperados && (
            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-800 mb-1">Código TUSS Esperado (Correto)</p>
              <p className="font-mono text-sm text-blue-700">{row.CodigosTUSS_Esperados}</p>
              {row.DescricaoTUSS && (
                <p className="text-xs text-blue-600 mt-0.5">{row.DescricaoTUSS}</p>
              )}
            </div>
          )}
        </div>

        {/* ── Rodapé financeiro ────────────────────────── */}
        <div className="border-t border-gray-200 px-5 py-4 bg-gray-50">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-3">
            Resumo Financeiro
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Recebido</p>
              <p className="text-sm font-semibold text-gray-700 tabular-nums">
                {formatCurrency(valorRecebido)}
              </p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Estimado TUSS</p>
              <p className="text-sm font-semibold text-gray-700 tabular-nums">
                {formatCurrency(valorEstimado)}
              </p>
            </div>
            <div className={`rounded-lg border p-3 text-center ${
              (valorRecuperar ?? 0) > 0 ? 'bg-green-50 border-green-200' :
              (valorRecuperar ?? 0) < 0 ? 'bg-yellow-50 border-yellow-200' :
              'bg-white border-gray-200'
            }`}>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">A Recuperar</p>
              <p className={`text-sm font-bold tabular-nums ${
                (valorRecuperar ?? 0) > 0 ? 'text-green-700' :
                (valorRecuperar ?? 0) < 0 ? 'text-yellow-600' :
                'text-gray-400'
              }`}>
                {formatCurrency(valorRecuperar)}
              </p>
            </div>
          </div>

          {/* Fórmula: para "Cobrado Como Simples" e "Principal Downgrade" (delta) */}
          {(row.StatusTUSS === 'COBRAR_TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES' ||
            row.StatusTUSS === 'COBRAR_TUSS_CODIGO_PRINCIPAL_DOWNGRADE') &&
            valorEstimado != null && (
            <div className="flex items-center gap-1.5 mt-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
              <Info className="w-3 h-3 flex-shrink-0 text-blue-500" />
              <span>
                <strong>Cálculo do delta:</strong>{' '}
                <span className="tabular-nums font-medium">{formatCurrency(valorEstimado)}</span>
                <span className="text-blue-400 mx-1">(TUSS correto)</span>
                <span className="font-bold">−</span>
                <span className="tabular-nums font-medium mx-1">{formatCurrency(valorRecebido ?? 0)}</span>
                <span className="text-blue-400 mr-1">(já recebido)</span>
                <span className="font-bold">=</span>
                <span className="tabular-nums font-bold ml-1 text-green-700">{formatCurrency(valorRecuperar)}</span>
              </span>
            </div>
          )}

          <p className="text-[10px] text-gray-400 text-center mt-2">
            Use ← → ou as setas para navegar entre registros · Esc para fechar
          </p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────
function FaturamentoContent() {
  const searchParams  = useSearchParams()
  const tabParam      = (searchParams.get('tab') ?? 'todos') as TabType
  const [activeTab, setActiveTab]         = useState<TabType>(tabParam)
  const [selected, setSelected]           = useState<Set<string>>(new Set())
  const [includeNegative, setIncludeNegative] = useState(false)
  const [detailIndex, setDetailIndex]     = useState<number | null>(null)

  const { data, loading } = useCorrelacoes({
    statusTUSS: [...TAB_CONFIG[activeTab].statusTUSS] as any[],
    loadAll: true,   // carrega todos os registros em batches — sem truncar em 1000
  })

  const processedData: ProcessedRow[] = useMemo(() => (
    data.map(row => ({ ...row, valorRecuperar: calcularValorRecuperar(row, activeTab) }))
  ), [data, activeTab])

  // Auto-seleção: exclui negativos e nulos por padrão
  useMemo(() => {
    const next = new Set<string>()
    processedData.forEach(row => {
      const v = row.valorRecuperar
      if (v != null && isFinite(v) && (v > 0 || includeNegative)) next.add(row.ChaveCorrelacao)
    })
    setSelected(next)
  }, [processedData, includeNegative])

  const toggleRow = (chave: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(chave) ? next.delete(chave) : next.add(chave)
      return next
    })

  const toggleAll = () =>
    setSelected(
      selected.size === processedData.length
        ? new Set()
        : new Set(processedData.map(r => r.ChaveCorrelacao))
    )

  const selectedRows    = processedData.filter(r => selected.has(r.ChaveCorrelacao))
  const totalSelecionado = selectedRows.reduce((acc, r) => {
    const v = r.valorRecuperar
    if (v == null || !isFinite(v)) return acc
    return acc + v
  }, 0)
  const negativos       = processedData.filter(r => {
    const v = r.valorRecuperar
    return v != null && isFinite(v) && v < 0
  }).length

  const exportXLSX = useCallback(() => {
    const rows = selectedRows.map(r => ({
      'Nr. Atendimento':    r.NrAtendimento_REPASSE ?? r.NrAtendimento_PRODUCAO ?? '',
      'Data':               formatDate(r.Data_PRODUCAO ?? r.Data_REPASSE),
      'Paciente':           r.Paciente_PRODUCAO ?? r.Paciente_REPASSE ?? '',
      'Convênio':           r.Convenio_PRODUCAO ?? r.Convenio_REPASSE ?? '',
      'Prestador':          r.MedicoExecutor_PRODUCAO ?? '',
      'Cód. TUSS Pago':     r.CodigoTUSS_REPASSE ?? '',
      'Cód. TUSS Esperado': r.CodigosTUSS_Esperados ?? '',
      'Procedimento TUSS':  r.DescricaoTUSS ?? r.Procedimento_REPASSE ?? '',
      'Valor Recebido':     r.ValorLiberado_REPASSE ?? 0,
      'Valor a Recuperar':  r.valorRecuperar ?? 0,
      'Status TUSS':        r.StatusTUSS ?? '',
      'Observação':         buildObservacao(r, activeTab),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Cobrança')
    XLSX.writeFile(wb, `formulario_cobranca_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }, [selectedRows, activeTab])

  return (
    <>
      {/* ── Modal de detalhe ───────────────────────────── */}
      {detailIndex !== null && (
        <RowDetailModal
          rows={processedData}
          index={detailIndex}
          onClose={() => setDetailIndex(null)}
          onNavigate={setDetailIndex}
        />
      )}

      <div className="max-w-7xl mx-auto space-y-5">

        {/* ── Cabeçalho ────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Gerenciamento de Faturamento</h1>
            <p className="text-sm text-gray-500 mt-0.5">Recuperações financeiras por categoria</p>
          </div>
          <button
            onClick={exportXLSX}
            disabled={selected.size === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors flex-shrink-0"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Gerar Formulário</span>
            <span className="sm:hidden">Exportar</span>
            {' '}({selected.size})
            {totalSelecionado > 0 && (
              <span className="text-blue-200 hidden md:inline">
                · {formatCurrency(totalSelecionado)}
              </span>
            )}
          </button>
        </div>

        {/* ── Abas ─────────────────────────────────────── */}
        <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {(Object.keys(TAB_CONFIG) as TabType[]).map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setSelected(new Set()); setDetailIndex(null) }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {TAB_CONFIG[tab].label}
            </button>
          ))}
        </div>

        <p className="text-sm text-gray-500">{TAB_CONFIG[activeTab].description}</p>

        {/* ── Nota de cálculo: delta para "Cobrado Como Simples" ── */}
        {(activeTab === 'downgrade' || activeTab === 'todos') && (
          <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-blue-500" />
            <span>
              <strong>Cobrado Como Simples — cálculo do delta:</strong>{' '}
              o campo <em>"A Recuperar"</em> nesta categoria representa apenas a{' '}
              <strong>diferença</strong> entre o valor correto (tabela TUSS) e o valor já recebido
              — não o total do procedimento.{' '}
              {activeTab === 'todos' && (
                <>Para as demais categorias (<em>Código Adicional Ausente</em> e <em>Não Faturados</em>),
                o valor a recuperar é o estimado TUSS integral, pois nada foi recebido.</>
              )}
            </span>
          </div>
        )}

        {/* ── Aviso de negativos (só downgrade) ─────────── */}
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
            <label className="flex items-center gap-2 text-xs text-yellow-700 cursor-pointer flex-shrink-0">
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

        {/* ── Conteúdo ─────────────────────────────────── */}
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

            {/* Barra de seleção */}
            <div className="flex items-center gap-4 px-5 py-3 bg-gray-50 border-b border-gray-200 text-sm flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.size === processedData.length && processedData.length > 0}
                  onChange={toggleAll}
                  className="rounded"
                />
                <span className="text-gray-600">
                  Selecionar todos ({processedData.length})
                </span>
              </label>
              <span className="text-gray-300">|</span>
              <span className="font-medium text-blue-700">
                {selected.size} selecionados
              </span>
              <span className="text-gray-300">|</span>
              <span className="font-semibold text-green-700 tabular-nums">
                A Recuperar: {formatCurrency(totalSelecionado)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/50">
                    <th className="px-4 py-3 w-10" />
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Paciente</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Convênio</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cód. Pago</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cód. Esperado</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      A Recuperar
                      {(activeTab === 'downgrade' || activeTab === 'todos') && (
                        <span className="ml-1 text-gray-400 normal-case font-normal">(delta p/ simples)</span>
                      )}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {processedData.map((row, idx) => {
                    const isNegative = (row.valorRecuperar ?? 0) < 0
                    const isChecked  = selected.has(row.ChaveCorrelacao)
                    const isExpanded = detailIndex === idx

                    return (
                      <tr
                        key={row.ChaveCorrelacao}
                        className={`transition-colors cursor-pointer group
                          ${isExpanded ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : 'hover:bg-gray-50'}
                          ${isNegative ? 'bg-yellow-50 hover:bg-yellow-100' : ''}
                          ${!isChecked ? 'opacity-60' : ''}
                        `}
                        onClick={() => setDetailIndex(isExpanded ? null : idx)}
                      >
                        {/* Checkbox — não propaga o click para a linha */}
                        <td
                          className="px-4 py-3"
                          onClick={e => { e.stopPropagation(); toggleRow(row.ChaveCorrelacao) }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleRow(row.ChaveCorrelacao)}
                            className="rounded"
                          />
                        </td>

                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 truncate max-w-[160px]">
                            {row.Paciente_PRODUCAO ?? row.Paciente_REPASSE}
                          </p>
                          <p className="text-xs text-gray-400">{row.NrAtendimento_REPASSE}</p>
                        </td>

                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {formatDate(row.Data_PRODUCAO ?? row.Data_REPASSE)}
                        </td>

                        <td className="px-4 py-3 text-gray-600 truncate max-w-[110px]">
                          {row.Convenio_PRODUCAO ?? row.Convenio_REPASSE}
                        </td>

                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-gray-700">
                            {row.CodigoTUSS_REPASSE ?? '—'}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-blue-700">
                            {row.CodigosTUSS_Esperados ?? '—'}
                          </span>
                          {row.DescricaoTUSS && (
                            <p className="text-xs text-gray-400 truncate max-w-[140px]">
                              {row.DescricaoTUSS}
                            </p>
                          )}
                        </td>

                        {/* A Recuperar — coluna principal financeira */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isNegative && <TrendingDown className="w-3 h-3 text-yellow-500" />}
                            <span className={`font-semibold tabular-nums ${
                              isNegative               ? 'text-yellow-600' :
                              (row.valorRecuperar ?? 0) > 0 ? 'text-green-700' :
                              'text-gray-400'
                            }`}>
                              {formatCurrency(row.valorRecuperar)}
                            </span>
                          </div>
                          {isNegative && (
                            <p className="text-[10px] text-yellow-600 text-right">excluído</p>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <StatusTUSSBadge status={row.StatusTUSS} />
                        </td>

                        {/* Hint de expansão */}
                        <td className="px-3 py-3 text-gray-300 group-hover:text-blue-400 transition-colors">
                          <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90 text-blue-500' : ''}`} />
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
    </>
  )
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

/** Converte qualquer valor vindo do Supabase em número ou null (nunca NaN) */
function safeNum(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return isFinite(n) ? n : null
}

function calcularValorRecuperar(row: Correlacao, tab: TabType): number | null {
  const estimado = safeNum(row.ValorEstimado_TUSS)
  const recebido = safeNum(row.ValorLiberado_REPASSE) ?? 0

  // Aba "Todos": calcula com base no StatusTUSS de cada linha
  if (tab === 'todos') {
    if (row.StatusTUSS === 'COBRAR_TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES' ||
        row.StatusTUSS === 'COBRAR_TUSS_CODIGO_PRINCIPAL_DOWNGRADE') {
      if (estimado == null) return null
      return estimado - recebido
    }
    return estimado // ausente + nao_faturado: valor total a recuperar é o estimado
  }
  if (tab === 'downgrade') {
    if (estimado == null) return null
    return estimado - recebido
  }
  if (tab === 'ausente')      return estimado
  if (tab === 'nao_faturado') return estimado
  return null
}

function buildObservacao(row: Correlacao, tab: TabType): string {
  if (tab === 'downgrade' ||
      row.StatusTUSS === 'COBRAR_TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES' ||
      row.StatusTUSS === 'COBRAR_TUSS_CODIGO_PRINCIPAL_DOWNGRADE') {
    return `Faturado como ${row.CodigoTUSS_REPASSE}. Correto conforme TUSS: ${row.CodigosTUSS_Esperados} — ${row.DescricaoTUSS}. Solicita revisão e reprocessamento.`
  }
  if (tab === 'ausente' || row.StatusTUSS === 'COBRAR_TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE') {
    return `Código adicional ausente no repasse: ${row.CodigosTUSS_Ausentes}. Procedimento realizado: ${row.ProcedimentosAdicionais_PRODUCAO}.`
  }
  return `Procedimento realizado em ${row.Data_PRODUCAO} não identificado no repasse. Solicita inclusão.`
}

// ─────────────────────────────────────────────────────────
export default function FaturamentoPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    }>
      <FaturamentoContent />
    </Suspense>
  )
}
