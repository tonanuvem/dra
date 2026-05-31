'use client'

import { useState, useEffect, useRef } from 'react'
import { TrendingUp, Search, Filter, X, ChevronDown, ChevronUp, BarChart2 } from 'lucide-react'
import {
  useValoresTuss,
  useValoresTussOptions,
  fmtBRL,
  fmtPeriodo,
  confiancaColor,
  type ValoresTussFilter,
} from '@/hooks/useValoresTuss'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function ConfiancaBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-gray-400 text-xs">—</span>
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${confiancaColor(value)}`}>
      {value}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ValoresTussPage() {
  const { permissions, loading: authLoading } = useAuth()
  const router = useRouter()

  // Redireciona se sem permissão financeira
  useEffect(() => {
    if (!authLoading && !permissions?.canViewFinancial) {
      router.replace('/dashboard')
    }
  }, [authLoading, permissions, router])

  // ── Filtros ────────────────────────────────────────────────────────────────
  const [rawSearch,    setRawSearch]    = useState('')
  const [search,       setSearch]       = useState('')
  const [convenio,     setConvenio]     = useState('')
  const [codigoTUSS,   setCodigoTUSS]   = useState('')
  const [ano,          setAno]          = useState<number | undefined>()
  const [mes,          setMes]          = useState<number | undefined>()
  const [filtersOpen,  setFiltersOpen]  = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleSearchChange(v: string) {
    setRawSearch(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearch(v), 350)
  }

  function clearFilters() {
    setRawSearch(''); setSearch('')
    setConvenio(''); setCodigoTUSS('')
    setAno(undefined); setMes(undefined)
  }

  const hasActiveFilters = !!(search || convenio || codigoTUSS || ano || mes)

  const filter: ValoresTussFilter = {
    search:     search     || undefined,
    convenio:   convenio   || undefined,
    codigoTUSS: codigoTUSS || undefined,
    ano,
    mes,
  }

  const { data, loading, error, refetch } = useValoresTuss(filter)
  const { convenios, codigos, periodos, loading: optsLoading } = useValoresTussOptions()

  // ── Anos disponíveis a partir dos períodos ─────────────────────────────────
  const anos = [...new Set(periodos.map(p => p.ano))].sort((a, b) => b - a)
  const mesesDisponiveis = ano
    ? periodos.filter(p => p.ano === ano).sort((a, b) => b.mes - a.mes)
    : []

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Valores TUSS</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Histórico de valores liberados por convênio, código TUSS e período — extraído dos arquivos de repasse.
          </p>
        </div>

        {/* Totalizadores rápidos */}
        {!loading && data.length > 0 && (
          <div className="flex gap-3 flex-wrap">
            <Stat label="Registros" value={data.length} />
            <Stat label="Convênios" value={new Set(data.map(r => r.Convenio)).size} />
            <Stat label="Códigos TUSS" value={new Set(data.map(r => r.CodigoTUSS)).size} />
          </div>
        )}
      </div>

      {/* ── Barra de pesquisa + botão de filtros ───────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por convênio, código TUSS ou descrição..."
            value={rawSearch}
            onChange={e => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {rawSearch && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          onClick={() => setFiltersOpen(v => !v)}
          className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${
            hasActiveFilters
              ? 'bg-blue-50 border-blue-300 text-blue-700'
              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Filter className="w-4 h-4" />
          Filtros
          {hasActiveFilters && (
            <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-blue-600 text-white rounded-full">
              {[convenio, codigoTUSS, ano, mes].filter(Boolean).length}
            </span>
          )}
          {filtersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Limpar
          </button>
        )}
      </div>

      {/* ── Painel de filtros ──────────────────────────────────────────────── */}
      {filtersOpen && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">

          {/* Convênio */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Convênio</label>
            <select
              value={convenio}
              onChange={e => setConvenio(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={optsLoading}
            >
              <option value="">Todos</option>
              {convenios.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Código TUSS */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Código TUSS</label>
            <select
              value={codigoTUSS}
              onChange={e => setCodigoTUSS(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={optsLoading}
            >
              <option value="">Todos</option>
              {codigos.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Ano */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ano</label>
            <select
              value={ano ?? ''}
              onChange={e => {
                const v = e.target.value ? Number(e.target.value) : undefined
                setAno(v)
                setMes(undefined)  // limpa mês ao trocar ano
              }}
              className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={optsLoading}
            >
              <option value="">Todos</option>
              {anos.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Mês — só ativo se ano selecionado */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Mês {!ano && <span className="text-gray-400">(selecione ano)</span>}
            </label>
            <select
              value={mes ?? ''}
              onChange={e => setMes(e.target.value ? Number(e.target.value) : undefined)}
              disabled={!ano || optsLoading}
              className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">Todos</option>
              {mesesDisponiveis.map(p => (
                <option key={p.mes} value={p.mes}>{p.label}</option>
              ))}
            </select>
          </div>

        </div>
      )}

      {/* ── Estado de carregamento / erro ──────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center h-40 text-gray-500 gap-2">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
          <span className="text-sm">Carregando valores...</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <strong>Erro ao carregar dados:</strong> {error}
          <button onClick={refetch} className="ml-3 underline hover:no-underline">Tentar novamente</button>
        </div>
      )}

      {/* ── Tabela ─────────────────────────────────────────────────────────── */}
      {!loading && !error && (
        <>
          {data.length === 0 ? (
            <EmptyState hasFilters={hasActiveFilters} onClear={clearFilters} />
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      <th className="px-4 py-3 whitespace-nowrap">Período</th>
                      <th className="px-4 py-3 whitespace-nowrap">Convênio</th>
                      <th className="px-4 py-3 whitespace-nowrap">Código TUSS</th>
                      <th className="px-4 py-3">Descrição</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Ocorrências</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Valor Médio</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Último Valor</th>
                      <th className="px-4 py-3 whitespace-nowrap">Data Último</th>
                      <th className="px-4 py-3 whitespace-nowrap">Confiança</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.map(row => (
                      <tr key={row.id} className="hover:bg-blue-50/40 transition-colors">

                        {/* Período */}
                        <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">
                          {fmtPeriodo(row.Mes, row.Ano)}
                        </td>

                        {/* Convênio */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-medium text-gray-800">{row.Convenio}</span>
                        </td>

                        {/* Código TUSS */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                            {row.CodigoTUSS}
                          </span>
                        </td>

                        {/* Descrição */}
                        <td className="px-4 py-3 text-gray-600 min-w-[200px]">
                          {row.Descricao ?? <span className="text-gray-400">—</span>}
                        </td>

                        {/* Ocorrências */}
                        <td className="px-4 py-3 text-right text-gray-700 font-medium">
                          {row.Qtd ?? '—'}
                        </td>

                        {/* Valor Médio */}
                        <td className="px-4 py-3 text-right font-mono text-gray-700">
                          {fmtBRL(row.Media)}
                        </td>

                        {/* Último Valor */}
                        <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                          {fmtBRL(row.UltimoValor)}
                        </td>

                        {/* Data Último */}
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {row.DataUltimo
                            ? new Date(row.DataUltimo).toLocaleDateString('pt-BR')
                            : '—'}
                        </td>

                        {/* Confiança */}
                        <td className="px-4 py-3">
                          <ConfiancaBadge value={row.Confianca} />
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Rodapé com totais */}
              <div className="border-t border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-500 flex items-center justify-between">
                <span>{data.length.toLocaleString('pt-BR')} registro{data.length !== 1 ? 's' : ''} exibido{data.length !== 1 ? 's' : ''}</span>
                {data.length >= 2000 && (
                  <span className="text-amber-600 font-medium">Limite de 2.000 registros atingido — refine os filtros para ver todos</span>
                )}
              </div>
            </div>
          )}
        </>
      )}

    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-center min-w-[80px] shadow-sm">
      <p className="text-xl font-bold text-gray-900">{value.toLocaleString('pt-BR')}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-56 text-center gap-3">
      <BarChart2 className="w-10 h-10 text-gray-300" />
      {hasFilters ? (
        <>
          <p className="text-sm text-gray-500">Nenhum valor encontrado para os filtros selecionados.</p>
          <button onClick={onClear} className="text-sm text-blue-600 hover:underline">Limpar filtros</button>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-500">Nenhum valor TUSS carregado ainda.</p>
          <p className="text-xs text-gray-400">
            Execute uma correlação no app e clique em <strong>Recarregar Dados no Supabase</strong> para popular esta tabela.
          </p>
        </>
      )}
    </div>
  )
}
