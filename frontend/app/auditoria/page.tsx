'use client'

import { useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useCorrelacoes } from '@/hooks/useCorrelacoes'
import { SplitView } from '@/components/auditoria/SplitView'
import { StatusCorrelacaoBadge } from '@/components/shared/StatusBadge'
import { SimilarityScore } from '@/components/shared/SimilarityScore'
import { formatDate, getRiskLevel, needsHumanReview } from '@/lib/utils'
import type { Correlacao, DecisaoHumana, StatusCorrelacao, MetodoMatch } from '@/lib/types'
import { AlertTriangle, Search, Filter, Loader2, ClipboardList } from 'lucide-react'

type FiltroType = 'todos' | 'divergente' | 'fallback' | 'glosa_total' | 'glosa_parcial' | 'nao_revisado'

const FILTRO_LABELS: Record<FiltroType, string> = {
  todos: 'Todos',
  divergente: 'Proc. Divergente',
  fallback: 'Match Incerto',
  glosa_total: 'Glosa Total',
  glosa_parcial: 'Glosa Parcial',
  nao_revisado: 'Não Revisados',
}

function AuditoriaContent() {
  const searchParams = useSearchParams()
  const filtroParam = (searchParams.get('filtro') ?? 'nao_revisado') as FiltroType
  const [filtro, setFiltro] = useState<FiltroType>(filtroParam)
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  // Build filter for hook
  const filterConfig = useMemo(() => {
    const statusMap: Record<FiltroType, { statusCorrelacao?: StatusCorrelacao[]; metodoMatch?: MetodoMatch[]; loadAll?: boolean }> = {
      todos: {},
      divergente: { metodoMatch: [
        '1_NOME_COMPLETO_DATA_PROCEDIMENTO_PROCEDIMENTO_DIVERGENTE',
        '2_FALLBACK_NR-ATENDIMENTO_DATA_PROCEDIMENTO_PROCEDIMENTO_DIVERGENTE',
        '3_FALLBACK_NOME_PARCIAL_FUZZY_DATA_FIXA_PROCEDIMENTO_DIVERGENTE',
        '4_FALLBACK_NOME_COMPLETO_DATA-FLEXIVEL_PROCEDIMENTO_DIVERGENTE',
      ]},
      fallback: { metodoMatch: [
        '2_FALLBACK_NR-ATENDIMENTO_DATA_PROCEDIMENTO',
        '3_FALLBACK_NOME_PARCIAL_FUZZY_DATA_FIXA',
        '4_FALLBACK_NOME_COMPLETO_DATA-FLEXIVEL',
      ]},
      // glosa: filtra CORRELACIONADO server-side, refina por valor client-side
      glosa_total:  { statusCorrelacao: ['CORRELACIONADO'], loadAll: true },
      glosa_parcial: { statusCorrelacao: ['CORRELACIONADO'], loadAll: true },
      nao_revisado: {},
    }
    return {
      ...statusMap[filtro],
      pendentesRevisao: filtro === 'nao_revisado',
      search: search || undefined,
      // glosa usa loadAll:true (definido no statusMap), então não precisa de limit
      limit: (filtro === 'glosa_total' || filtro === 'glosa_parcial') ? undefined : 500,
    }
  }, [filtro, search])

  const { data, total, loading } = useCorrelacoes(filterConfig)

  // Client-side filtering for tabs that can't be filtered server-side
  const filteredData = useMemo(() => {
    if (filtro === 'nao_revisado') return data.filter(r => needsHumanReview(r))
    if (filtro === 'glosa_total') return data.filter(r =>
      Number(r.ValorLiberado_REPASSE ?? 0) === 0 && Number(r.ValorEstimado_TUSS ?? 0) > 0
    )
    if (filtro === 'glosa_parcial') return data.filter(r => {
      const rep = Number(r.ValorLiberado_REPASSE ?? 0)
      const est = Number(r.ValorEstimado_TUSS ?? 0)
      return est > 0 && rep > 0 && rep < est * 0.95
    })
    return data
  }, [data, filtro])

  const [decisions, setDecisions] = useState<Record<string, DecisaoHumana>>({})

  const handleDecision = (chave: string, decision: DecisaoHumana) => {
    setDecisions(prev => ({ ...prev, [chave]: decision }))
  }

  const enrichedData = filteredData.map(r => ({
    ...r,
    decisao_humana: decisions[r.ChaveCorrelacao] ?? r.decisao_humana ?? null,
  }))

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Auditoria e Revisão Humana</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total.toLocaleString('pt-BR')} registros encontrados
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar paciente..."
            value={search}
            onChange={e => { setSearch(e.target.value); setSelectedIndex(null) }}
            className="text-sm outline-none w-48"
          />
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-gray-400" />
        {(Object.keys(FILTRO_LABELS) as FiltroType[]).map(f => (
          <button
            key={f}
            onClick={() => { setFiltro(f); setSelectedIndex(null) }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filtro === f ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {FILTRO_LABELS[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : filteredData.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum registro nesta fila</p>
          <p className="text-sm mt-1">Tente outro filtro ou carregue os dados no Supabase</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Lista */}
          <div className="xl:col-span-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <p className="text-sm font-medium text-gray-700">
                {filteredData.length.toLocaleString('pt-BR')} registros
              </p>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: '70vh' }}>
              {enrichedData.map((item, idx) => {
                const risk = getRiskLevel(item.StatusCorrelacao, item.MetodoMatch)
                const isSelected = selectedIndex === idx
                const reviewed = !!item.decisao_humana

                return (
                  <button
                    key={item.ChaveCorrelacao}
                    onClick={() => setSelectedIndex(idx)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${
                      isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-gray-50'
                    } ${reviewed ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {item.Paciente_PRODUCAO || item.Paciente_REPASSE || '—'}
                      </span>
                      {risk && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${
                          risk === 'alto' ? 'bg-red-100 text-red-700' :
                          risk === 'medio' ? 'bg-orange-100 text-orange-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {risk === 'alto' ? '🔴' : risk === 'medio' ? '🟠' : '🟡'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{formatDate(item.Data_PRODUCAO)}</span>
                      <StatusCorrelacaoBadge status={item.StatusCorrelacao} />
                    </div>
                    {item.SimilaridadeProcedimento != null && (
                      <SimilarityScore score={item.SimilaridadeProcedimento} label="Proc." className="mt-1" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Split View */}
          <div className="xl:col-span-2">
            {selectedIndex !== null ? (
              <SplitView
                items={enrichedData}
                currentIndex={selectedIndex}
                onNavigate={setSelectedIndex}
                onDecision={handleDecision}
              />
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center h-full min-h-64">
                <div className="text-center text-gray-400">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Selecione um registro para revisar</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AuditoriaPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
      <AuditoriaContent />
    </Suspense>
  )
}
