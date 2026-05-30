'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { TABLES } from '@/lib/config'
import {
  Plus, Check, X, GitMerge, Loader2, ChevronDown, ChevronUp, Search,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface TussLookupRow {
  chave_norm: string
  Proc_PRODUCAO_raw: string | null
  ProcAdic_PRODUCAO_raw: string | null
  CodigosTUSS: string | null
  TipoCobranca: string
  codigo_base_proc_principal: string | null
  Descricao_REPASSE: string | null
}

interface CorrGap {
  procedimento: string
  adicional: string | null
  ocorrencias: number
  inLookup: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const TIPO_COBRANCA_OPTIONS = [
  { value: 'unico_cod_tuss_somente_proc_principal',            label: 'Único — só proc. principal'     },
  { value: 'unico_cod_tuss_inclui_proc_adicional_e_principal', label: 'Único — inclui proc. adicional' },
  { value: 'multiplos_cod_tuss_proced_adicional',              label: 'Múltiplos códigos'               },
]

const TIPO_LABEL: Record<string, string> = {
  'unico_cod_tuss_somente_proc_principal':            'Único — só principal',
  'unico_cod_tuss_inclui_proc_adicional_e_principal': 'Único — c/ adicional',
  'multiplos_cod_tuss_proced_adicional':              'Múltiplos códigos',
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function normalize(s: string | null | undefined): string {
  if (!s) return ''
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component — Grouped TUSS Mappings
// ─────────────────────────────────────────────────────────────────────────────
function MapeamentosAgrupados({ rows }: { rows: TussLookupRow[] }) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  const groups = rows.reduce<Record<string, { codigo: string; tipo: string; descricao: string | null; items: TussLookupRow[] }>>(
    (acc, row) => {
      const key = `${row.CodigosTUSS ?? '—'}||${row.TipoCobranca}`
      if (!acc[key]) {
        acc[key] = { codigo: row.CodigosTUSS ?? '—', tipo: row.TipoCobranca, descricao: row.Descricao_REPASSE, items: [] }
      }
      acc[key].items.push(row)
      return acc
    },
    {}
  )

  const sorted = Object.entries(groups).sort((a, b) => b[1].items.length - a[1].items.length)
  const toggle = (key: string) =>
    setOpenGroups(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Nenhum mapeamento encontrado</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Mapeamentos em vigor</h2>
        <span className="text-xs text-gray-500">{sorted.length} grupos · {rows.length} combinações</span>
      </div>
      <div className="grid grid-cols-[2fr_2fr_1fr_40px] gap-2 px-5 py-2 border-b border-gray-200 bg-gray-50">
        <span className="text-xs font-semibold text-gray-500 uppercase">Código(s) TUSS</span>
        <span className="text-xs font-semibold text-gray-500 uppercase">Tipo</span>
        <span className="text-xs font-semibold text-gray-500 uppercase text-right">Qtd</span>
        <span />
      </div>
      <div className="divide-y divide-gray-100">
        {sorted.map(([key, group]) => {
          const isOpen = openGroups.has(key)
          return (
            <div key={key}>
              <div className="grid grid-cols-[2fr_2fr_1fr_40px] gap-2 items-center px-5 py-3 hover:bg-gray-50 transition-colors">
                <div>
                  <span className="font-mono text-sm text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{group.codigo}</span>
                  {group.descricao && <p className="text-xs text-gray-400 mt-0.5 truncate">{group.descricao}</p>}
                </div>
                <span className="text-sm text-gray-600">{TIPO_LABEL[group.tipo] ?? group.tipo}</span>
                <span className="text-sm font-semibold text-gray-700 text-right">{group.items.length}</span>
                <button
                  onClick={() => toggle(key)}
                  className="flex items-center justify-center w-8 h-8 rounded hover:bg-gray-200 transition-colors ml-auto"
                >
                  {isOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </button>
              </div>
              {isOpen && (
                <div className="bg-gray-50 border-t border-gray-100">
                  <div className="grid grid-cols-2 gap-2 px-8 py-1.5 border-b border-gray-200">
                    <span className="text-xs font-semibold text-gray-400 uppercase">Procedimento</span>
                    <span className="text-xs font-semibold text-gray-400 uppercase">Adicional</span>
                  </div>
                  {group.items.map((item, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2 px-8 py-2 border-b border-gray-100 last:border-0 hover:bg-white transition-colors">
                      <span className="text-sm text-gray-800">{item.Proc_PRODUCAO_raw ?? '—'}</span>
                      <span className="text-sm text-gray-500">{item.ProcAdic_PRODUCAO_raw ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component — Search Results (unified across both tabs)
// ─────────────────────────────────────────────────────────────────────────────
interface SearchResult {
  id: string
  origin: 'mapeamento' | 'lacuna'
  label: string
  codigo: string | null
  descricao: string | null
  tipo: string | null
  ocorrencias: number | null
}

function SearchResults({ results }: { results: SearchResult[] }) {
  if (results.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm font-medium">Nenhum resultado encontrado</p>
        <p className="text-xs mt-1">Tente outros termos ou verifique a grafia</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Resultados da pesquisa</h2>
        <span className="text-xs text-gray-500">{results.length} resultado{results.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="divide-y divide-gray-100">
        {results.map(r => (
          <div key={r.id} className="px-5 py-3.5 hover:bg-gray-50 transition-colors">
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 flex-shrink-0 inline-block text-[10px] font-semibold px-2 py-0.5 rounded border ${
                r.origin === 'mapeamento'
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-orange-50 text-orange-700 border-orange-200'
              }`}>
                {r.origin === 'mapeamento' ? 'Mapeamento' : 'Lacuna'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{r.label}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {r.codigo && (
                    <span className="font-mono text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{r.codigo}</span>
                  )}
                  {r.tipo && (
                    <span className="text-xs text-gray-500">{TIPO_LABEL[r.tipo] ?? r.tipo}</span>
                  )}
                  {r.descricao && (
                    <span className="text-xs text-gray-400 truncate">{r.descricao}</span>
                  )}
                  {r.ocorrencias != null && (
                    <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded font-semibold">
                      {r.ocorrencias} ocorrência{r.ocorrencias !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function MapeamentosTussPage() {
  const [lookupGaps, setLookupGaps] = useState<TussLookupRow[]>([])
  const [corrGaps, setCorrGaps]     = useState<CorrGap[]>([])
  const [allLookup, setAllLookup]   = useState<TussLookupRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [expanded, setExpanded]     = useState<string | null>(null)
  const [forms, setForms]           = useState<Record<string, { codigo: string; tipo: string; descricao: string }>>({})
  const [saving, setSaving]         = useState<string | null>(null)
  const [saved, setSaved]           = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  type Tab = 'lacunas' | 'mapeamentos'
  const [activeTab, setActiveTab] = useState<Tab>('lacunas')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const { data: lookupData } = await supabase.from(TABLES.tussLookup).select('*')
      const lookup = ((lookupData as unknown) as TussLookupRow[]) ?? []
      setAllLookup(lookup)

      const gaps = lookup.filter(r => r.TipoCobranca === 'sem_mapeamento_tuss')
      setLookupGaps(gaps)

      const lookupKeys = new Set(lookup.map(r => r.chave_norm))

      const { data: corrRaw } = await supabase
        .from(TABLES.correlacao)
        .select('Procedimento_PRODUCAO, ProcedimentosAdicionais_PRODUCAO')
        .eq('StatusTUSS', 'CORRELACIONAR_MANUAL_TUSS_COMBINACAO_SEM_MAPEAMENTO')

      const corrRows = ((corrRaw as unknown) as Array<{
        Procedimento_PRODUCAO: string | null
        ProcedimentosAdicionais_PRODUCAO: string | null
      }>) ?? []

      const countMap: Record<string, { adicional: string | null; count: number }> = {}
      for (const row of corrRows) {
        const key = (row.Procedimento_PRODUCAO ?? '').trim()
        if (!key) continue
        if (!countMap[key]) countMap[key] = { adicional: row.ProcedimentosAdicionais_PRODUCAO, count: 0 }
        countMap[key].count++
      }

      const gaps2: CorrGap[] = Object.entries(countMap)
        .map(([proc, { adicional, count }]) => ({
          procedimento: proc,
          adicional,
          ocorrencias: count,
          inLookup: lookupKeys.has(proc + '_') || lookupKeys.has(proc + '_' + (adicional ?? '')),
        }))
        .sort((a, b) => b.ocorrencias - a.ocorrencias)

      setCorrGaps(gaps2)
    } finally {
      setLoading(false)
    }
  }

  const allGaps = useMemo(() => [
    ...lookupGaps.map(g => ({
      id: g.chave_norm,
      label: [g.Proc_PRODUCAO_raw, g.ProcAdic_PRODUCAO_raw].filter(Boolean).join(' + '),
      ocorrencias: null as number | null,
      source: 'lookup' as const,
      row: g,
    })),
    ...corrGaps
      .filter(g => !g.inLookup)
      .map(g => ({
        id: `corr_${g.procedimento}`,
        label: [g.procedimento, g.adicional].filter(Boolean).join(' + '),
        ocorrencias: g.ocorrencias,
        source: 'corr' as const,
        row: null as TussLookupRow | null,
      })),
  ], [lookupGaps, corrGaps])

  const mapeamentosRows = useMemo(
    () => allLookup.filter(r => r.TipoCobranca !== 'sem_mapeamento_tuss'),
    [allLookup]
  )

  // ── Busca global ──
  const isSearching = searchQuery.trim().length > 0
  const q = normalize(searchQuery)

  const searchResults = useMemo((): SearchResult[] => {
    if (!isSearching) return []

    const results: SearchResult[] = []

    // Mapeamentos
    for (const row of mapeamentosRows) {
      const hit = [row.CodigosTUSS, row.Descricao_REPASSE, row.Proc_PRODUCAO_raw, row.ProcAdic_PRODUCAO_raw]
        .some(f => normalize(f).includes(q))
      if (hit) {
        results.push({
          id: `map_${row.chave_norm}`,
          origin: 'mapeamento',
          label: [row.Proc_PRODUCAO_raw, row.ProcAdic_PRODUCAO_raw].filter(Boolean).join(' + ') || '—',
          codigo: row.CodigosTUSS,
          descricao: row.Descricao_REPASSE,
          tipo: row.TipoCobranca,
          ocorrencias: null,
        })
      }
    }

    // Lacunas
    for (const gap of allGaps) {
      const hit = normalize(gap.label).includes(q)
      if (hit) {
        results.push({
          id: `gap_${gap.id}`,
          origin: 'lacuna',
          label: gap.label || '—',
          codigo: null,
          descricao: null,
          tipo: null,
          ocorrencias: gap.ocorrencias,
        })
      }
    }

    return results
  }, [isSearching, q, mapeamentosRows, allGaps])

  async function saveGap(id: string, source: 'lookup' | 'corr', row: TussLookupRow | null) {
    const form = forms[id]
    if (!form?.codigo?.trim()) return
    setSaving(id)
    try {
      if (source === 'lookup' && row) {
        await supabase
          .from(TABLES.tussLookup)
          .update({
            CodigosTUSS: form.codigo.trim(),
            TipoCobranca: form.tipo || 'unico_cod_tuss_somente_proc_principal',
            Descricao_REPASSE: form.descricao?.trim() || null,
            codigo_base_proc_principal: form.codigo.trim(),
          } as object)
          .eq('chave_norm', row.chave_norm)
      } else {
        const proc = id.replace('corr_', '')
        const chave = proc + '_'
        await supabase
          .from(TABLES.tussLookup)
          .insert({
            chave_norm: chave,
            Proc_PRODUCAO_raw: proc,
            CONCATENAR_raw: chave,
            CodigosTUSS: form.codigo.trim(),
            QtdCodigos: 1,
            TipoCobranca: form.tipo || 'unico_cod_tuss_somente_proc_principal',
            Descricao_REPASSE: form.descricao?.trim() || null,
            codigo_base_proc_principal: form.codigo.trim(),
          } as object)
      }

      const proc = source === 'lookup' ? (row?.Proc_PRODUCAO_raw ?? '') : id.replace('corr_', '')
      if (proc) {
        await supabase
          .from(TABLES.correlacao)
          .update({ CodigosTUSS_Esperados: form.codigo.trim() } as object)
          .ilike('Procedimento_PRODUCAO', `%${proc}%`)
          .is('CodigosTUSS_Esperados', null)
      }

      setSaved(prev => new Set([...prev, id]))
      setExpanded(null)
      await loadData()
    } finally {
      setSaving(null)
    }
  }

  const updateForm = (id: string, field: 'codigo' | 'tipo' | 'descricao', value: string) =>
    setForms(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <GitMerge className="w-6 h-6 text-gray-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mapeamentos TUSS</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Mapeamentos em vigor e combinações pendentes de revisão
          </p>
        </div>
      </div>

      {/* ── Barra de pesquisa global ── */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Pesquisar por código TUSS, descrição ou nome de procedimento..."
          className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Limpar pesquisa"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isSearching ? (
        /* ── Modo busca: lista unificada ── */
        <SearchResults results={searchResults} />
      ) : (
        /* ── Modo normal: abas independentes ── */
        <>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
            <button
              onClick={() => setActiveTab('mapeamentos')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'mapeamentos' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Mapeamentos existentes ({mapeamentosRows.length})
            </button>
            <button
              onClick={() => setActiveTab('lacunas')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'lacunas' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Lacunas — Pendente Revisão Manual ({allGaps.length})
            </button>
          </div>

          {/* ── Aba: Mapeamentos existentes ── */}
          {activeTab === 'mapeamentos' && (
            <MapeamentosAgrupados rows={mapeamentosRows} />
          )}

          {/* ── Aba: Lacunas ── */}
          {activeTab === 'lacunas' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">Combinações sem mapeamento TUSS</h2>
                <span className="text-xs text-gray-500">ordenado por frequência</span>
              </div>

              {allGaps.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Check className="w-8 h-8 mx-auto mb-2 text-green-500" />
                  <p className="font-medium">Todas as combinações estão mapeadas</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {allGaps.map(gap => {
                    const isExpanded = expanded === gap.id
                    const isSaved = saved.has(gap.id)
                    const form = forms[gap.id] ?? { codigo: '', tipo: 'unico_cod_tuss_somente_proc_principal', descricao: '' }
                    return (
                      <div key={gap.id} className={isSaved ? 'bg-green-50' : ''}>
                        <button
                          onClick={() => setExpanded(isExpanded ? null : gap.id)}
                          className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{gap.label}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {gap.source === 'lookup' && (
                                <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">na tabela TUSS</span>
                              )}
                              {gap.ocorrencias != null && (
                                <span className="text-xs text-gray-500">
                                  {gap.ocorrencias} ocorrência{gap.ocorrencias !== 1 ? 's' : ''} na correlação
                                </span>
                              )}
                            </div>
                          </div>
                          {gap.ocorrencias != null && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-semibold flex-shrink-0">
                              {gap.ocorrencias}
                            </span>
                          )}
                          {isSaved ? (
                            <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                          ) : isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          )}
                        </button>

                        {isExpanded && !isSaved && (
                          <div className="px-5 pb-4 bg-blue-50 border-t border-blue-100">
                            <div className="grid grid-cols-2 gap-3 mt-3">
                              <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Código(s) TUSS *</label>
                                <input
                                  type="text"
                                  value={form.codigo}
                                  onChange={e => updateForm(gap.id, 'codigo', e.target.value)}
                                  placeholder="ex: 40202615 ou 40202615,40202186"
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Tipo de Cobrança</label>
                                <select
                                  value={form.tipo}
                                  onChange={e => updateForm(gap.id, 'tipo', e.target.value)}
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                >
                                  {TIPO_COBRANCA_OPTIONS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="mt-3">
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Descrição TUSS (opcional)</label>
                              <input
                                type="text"
                                value={form.descricao}
                                onChange={e => updateForm(gap.id, 'descricao', e.target.value)}
                                placeholder="ex: Ecoendoscopia do Trato Digestivo Baixo"
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div className="flex items-center gap-2 mt-3">
                              <button
                                onClick={() => saveGap(gap.id, gap.source, gap.row)}
                                disabled={!form.codigo?.trim() || saving === gap.id}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
                              >
                                {saving === gap.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                Salvar e retroalimentar correlações
                              </button>
                              <button
                                onClick={() => setExpanded(null)}
                                className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm transition-colors"
                              >
                                <X className="w-4 h-4" />
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
