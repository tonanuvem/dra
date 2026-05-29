'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import { useCorrelacoes } from '@/hooks/useCorrelacoes'
import { useAuth } from '@/contexts/AuthContext'
import { DetailPanel } from '@/components/pesquisa/DetailPanel'
import { StatusCorrelacaoBadge, StatusTUSSBadge } from '@/components/shared/StatusBadge'
import { formatDate, formatCurrency, getRiskLevel } from '@/lib/utils'
import type { Correlacao, DecisaoHumana, StatusCorrelacao } from '@/lib/types'
import { Search, X, Loader2, SlidersHorizontal, FileSearch } from 'lucide-react'

// ── Chips de filtro rápido ────────────────────────────────────────────────────

type ChipStatus = 'todos' | 'correlacionado' | 'nao_faturado' | 'repasse_nao_id' | 'cobrar' | 'manual'

const CHIPS: { id: ChipStatus; label: string }[] = [
  { id: 'todos',         label: 'Todos'                      },
  { id: 'correlacionado',label: 'Pago e Conferido'           },
  { id: 'nao_faturado',  label: 'Não Faturado no Repasse'    },
  { id: 'repasse_nao_id',label: 'Pago sem Registro'          },
  { id: 'cobrar',        label: 'A Cobrar (TUSS)'            },
  { id: 'manual',        label: 'Análise Manual'             },
]

const CHIP_TO_STATUS: Partial<Record<ChipStatus, StatusCorrelacao[]>> = {
  correlacionado:  ['CORRELACIONADO'],
  nao_faturado:    ['NAO_FATURADO_NO_REPASSE'],
  repasse_nao_id:  ['REPASSE_NAO_IDENTIFICADO_NA_PRODUCAO'],
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function PesquisaPage() {
  const { permissions } = useAuth()
  const canFinancial = permissions?.canViewFinancial ?? false

  // Inputs de busca (debouncados)
  const [rawPaciente,     setRawPaciente]     = useState('')
  const [rawNrAtend,      setRawNrAtend]      = useState('')
  const [rawProcedimento, setRawProcedimento] = useState('')
  const [rawData,         setRawData]         = useState('')

  // Valores debouncados reais enviados ao hook
  const [paciente,     setPaciente]     = useState('')
  const [nrAtend,      setNrAtend]      = useState('')
  const [procedimento, setProcedimento] = useState('')
  const [data,         setData]         = useState('')

  const debounce = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const debounced = useCallback((key: string, setter: (v: string) => void, value: string, delay = 400) => {
    if (debounce.current[key]) clearTimeout(debounce.current[key])
    debounce.current[key] = setTimeout(() => setter(value), delay)
  }, [])

  const [chip, setChip] = useState<ChipStatus>('todos')
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [decisions, setDecisions] = useState<Record<string, DecisaoHumana>>({})

  // Qualquer campo preenchido dispara busca
  const hasQuery = !!(paciente || nrAtend || procedimento || data || chip !== 'todos')

  const filterConfig = useMemo(() => {
    const statusCorrelacao = CHIP_TO_STATUS[chip]
    const statusTUSSPrefix = chip === 'cobrar' ? 'COBRAR_' : chip === 'manual' ? 'CORRELACIONAR_MANUAL_' : undefined

    return {
      search:               paciente     || undefined,
      searchNrAtendimento:  nrAtend      || undefined,
      searchProcedimento:   procedimento || undefined,
      searchData:           data         || undefined,
      statusCorrelacao,
      // StatusTUSS prefix — filtrado client-side abaixo (hook não suporta startsWith nativo)
      limit: 200,
    }
  }, [paciente, nrAtend, procedimento, data, chip])

  const { data: rows, total, loading } = useCorrelacoes(hasQuery ? filterConfig : { limit: 0 })

  // Filtro client-side para chips TUSS (COBRAR_ / CORRELACIONAR_MANUAL_)
  const filteredRows = useMemo(() => {
    if (chip === 'cobrar')  return rows.filter(r => r.StatusTUSS?.startsWith('COBRAR_'))
    if (chip === 'manual')  return rows.filter(r => r.StatusTUSS?.startsWith('CORRELACIONAR_MANUAL_'))
    return rows
  }, [rows, chip])

  const enrichedRows: Correlacao[] = useMemo(() =>
    filteredRows.map(r => ({
      ...r,
      decisao_humana: decisions[r.ChaveCorrelacao] ?? r.decisao_humana ?? null,
    })),
    [filteredRows, decisions]
  )

  // Contagem de procedimentos por atendimento (para pílula na lista)
  const atendimentoCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of enrichedRows) {
      const nr = r.NrAtendimento_PRODUCAO
      if (nr) map.set(nr, (map.get(nr) ?? 0) + 1)
    }
    return map
  }, [enrichedRows])

  const handleDecision = (chave: string, decision: DecisaoHumana) => {
    setDecisions(prev => ({ ...prev, [chave]: decision }))
  }

  const handleSelectRelated = (item: Correlacao) => {
    const idx = enrichedRows.findIndex(r => r.ChaveCorrelacao === item.ChaveCorrelacao)
    if (idx >= 0) setSelectedIndex(idx)
  }

  const clearAll = () => {
    setRawPaciente(''); setRawNrAtend(''); setRawProcedimento(''); setRawData('')
    setPaciente('');    setNrAtend('');    setProcedimento('');     setData('')
    setChip('todos')
    setSelectedIndex(null)
  }

  const hasFilters = !!(rawPaciente || rawNrAtend || rawProcedimento || rawData || chip !== 'todos')

  return (
    <div className="max-w-7xl mx-auto space-y-4">

      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-gray-900">Pesquisa</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
          Busque por qualquer campo da correlação — clique num resultado para confrontar PRODUÇÃO e REPASSE
        </p>
      </div>

      {/* ── Campos de busca ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Campos da correlação
          {hasFilters && (
            <button
              onClick={clearAll}
              className="ml-auto flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Limpar filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {/* Paciente */}
          <SearchInput
            icon={<Search className="w-4 h-4 text-gray-400" />}
            placeholder="Nome do paciente…"
            value={rawPaciente}
            onChange={v => { setRawPaciente(v); debounced('pac', setPaciente, v) }}
          />
          {/* Nr. Atendimento */}
          <SearchInput
            placeholder="Nr. Atendimento…"
            value={rawNrAtend}
            onChange={v => { setRawNrAtend(v); debounced('nr', setNrAtend, v) }}
          />
          {/* Procedimento */}
          <SearchInput
            placeholder="Procedimento…"
            value={rawProcedimento}
            onChange={v => { setRawProcedimento(v); debounced('proc', setProcedimento, v) }}
          />
          {/* Data */}
          <SearchInput
            placeholder="Data (DD/MM/AAAA)…"
            value={rawData}
            onChange={v => { setRawData(v); debounced('data', setData, v) }}
          />
        </div>

        {/* Chips de filtro rápido */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          {CHIPS.map(c => (
            <button
              key={c.id}
              onClick={() => { setChip(c.id); setSelectedIndex(null) }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                chip === c.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Estado vazio / instrução inicial ────────────────────────────── */}
      {!hasQuery && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <FileSearch className="w-12 h-12 mb-3 opacity-30" />
          <p className="font-medium text-gray-500">Digite um termo ou selecione um filtro para buscar</p>
          <p className="text-sm mt-1">Paciente · Nr. Atendimento · Procedimento · Data</p>
        </div>
      )}

      {/* ── Resultados + Detalhe ─────────────────────────────────────────── */}
      {hasQuery && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* Lista de resultados */}
          <div className="xl:col-span-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
              {loading
                ? <span className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Buscando…</span>
                : <span className="text-sm font-medium text-gray-700">
                    {filteredRows.length.toLocaleString('pt-BR')} resultado{filteredRows.length !== 1 ? 's' : ''}
                    {total > filteredRows.length && <span className="text-gray-400"> (mostrando {filteredRows.length} de {total})</span>}
                  </span>
              }
            </div>

            <div className="overflow-y-auto flex-1" style={{ maxHeight: '70vh' }}>
              {!loading && filteredRows.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Search className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">Nenhum resultado encontrado</p>
                </div>
              )}

              {enrichedRows.map((item, idx) => {
                const risk = getRiskLevel(item.StatusCorrelacao, item.MetodoMatch)
                const isSelected = selectedIndex === idx
                const nrAtend = item.NrAtendimento_PRODUCAO
                const siblingCount = nrAtend ? (atendimentoCounts.get(nrAtend) ?? 0) : 0

                return (
                  <button
                    key={item.ChaveCorrelacao}
                    onClick={() => setSelectedIndex(idx)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${
                      isSelected
                        ? 'bg-blue-50 border-l-2 border-l-blue-500'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* Paciente + pílula de múltiplos proc. + risco */}
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-medium text-gray-900 truncate leading-snug">
                          {item.Paciente_PRODUCAO || item.Paciente_REPASSE || '—'}
                        </span>
                        {siblingCount > 1 && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-semibold flex-shrink-0">
                            {siblingCount} proc.
                          </span>
                        )}
                      </span>
                      {risk && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${
                          risk === 'alto'  ? 'bg-red-100 text-red-700' :
                          risk === 'medio' ? 'bg-orange-100 text-orange-700' :
                                            'bg-yellow-100 text-yellow-700'
                        }`}>
                          {risk === 'alto' ? '🔴' : risk === 'medio' ? '🟠' : '🟡'}
                        </span>
                      )}
                    </div>

                    {/* Nr. Atend + Procedimento */}
                    <div className="text-xs text-gray-500 truncate mb-1.5">
                      <span className="font-mono">{item.NrAtendimento_PRODUCAO || '—'}</span>
                      {' · '}
                      <span>{item.Procedimento_PRODUCAO || item.Procedimento_REPASSE || '—'}</span>
                    </div>

                    {/* Data + Badges + Valor */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-gray-400">{formatDate(item.Data_PRODUCAO)}</span>
                      <StatusCorrelacaoBadge status={item.StatusCorrelacao} />
                      <StatusTUSSBadge status={item.StatusTUSS} />
                      {canFinancial && item.ValorLiberado_REPASSE != null && (
                        <span className="text-xs font-semibold text-emerald-700 ml-auto tabular-nums">
                          {formatCurrency(item.ValorLiberado_REPASSE)}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Painel de detalhe */}
          <div className="xl:col-span-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
            {selectedIndex !== null && enrichedRows.length > 0 ? (
              <DetailPanel
                items={enrichedRows}
                currentIndex={selectedIndex}
                onNavigate={setSelectedIndex}
                onDecision={handleDecision}
                onSelectRelated={handleSelectRelated}
                showFinancial={canFinancial}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-white rounded-xl border border-gray-200 border-dashed py-20">
                <FileSearch className="w-10 h-10 mb-2 opacity-20" />
                <p className="text-sm">Selecione um registro para ver o confronto</p>
                <p className="text-xs mt-1">PRODUÇÃO · REPASSE · Análise TUSS · Notas</p>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

// ── Sub-componente: input de busca ────────────────────────────────────────────
function SearchInput({
  icon, placeholder, value, onChange,
}: {
  icon?: React.ReactNode
  placeholder: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-white focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-200 transition-all">
      {icon ?? <Search className="w-4 h-4 text-gray-300" />}
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 text-sm outline-none bg-transparent placeholder-gray-300 min-w-0"
      />
      {value && (
        <button onClick={() => onChange('')} className="text-gray-300 hover:text-gray-500 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
