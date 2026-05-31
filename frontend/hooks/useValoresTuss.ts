'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ValorTUSS {
  id: string
  lote_processamento: string
  hash_conteudo: string
  is_duplicata: boolean
  id_original: string | null
  criado_em: string
  Ano: number
  Mes: number
  Convenio: string
  CodigoTUSS: string
  Descricao: string | null
  Qtd: number | null
  Media: number | null
  UltimoValor: number | null
  DataUltimo: string | null
  Confianca: string | null
}

export interface ValoresTussFilter {
  search?: string         // busca em Convenio ou CodigoTUSS ou Descricao
  convenio?: string       // filtro exato (normalizado)
  codigoTUSS?: string     // filtro exato
  ano?: number
  mes?: number
  apenasCanonicos?: boolean  // default true — exclui is_duplicata=true
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export const MESES_LABEL: Record<number, string> = {
  1: 'Jan', 2: 'Fev', 3: 'Mar', 4: 'Abr',
  5: 'Mai', 6: 'Jun', 7: 'Jul', 8: 'Ago',
  9: 'Set', 10: 'Out', 11: 'Nov', 12: 'Dez',
}

export function fmtPeriodo(mes: number, ano: number): string {
  return `${MESES_LABEL[mes] ?? String(mes).padStart(2, '0')}/${String(ano).slice(-2)}`
}

export function fmtBRL(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function confiancaColor(c: string | null): string {
  switch (c) {
    case 'Alta':     return 'text-green-700  bg-green-50  border-green-200'
    case 'Boa':      return 'text-blue-700   bg-blue-50   border-blue-200'
    case 'Moderada': return 'text-yellow-700 bg-yellow-50 border-yellow-200'
    case 'Baixa':    return 'text-orange-700 bg-orange-50 border-orange-200'
    default:         return 'text-gray-500   bg-gray-50   border-gray-200'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main hook
// ─────────────────────────────────────────────────────────────────────────────

export function useValoresTuss(filter: ValoresTussFilter = {}) {
  const [data,    setData]    = useState<ValorTUSS[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const apenasCanonicos = filter.apenasCanonicos ?? true

      let query = supabase
        .from('valores_tuss')
        .select('*')
        .order('Ano',  { ascending: false })
        .order('Mes',  { ascending: false })
        .order('Convenio',   { ascending: true })
        .order('CodigoTUSS', { ascending: true })
        .order('criado_em',  { ascending: false })

      if (apenasCanonicos) {
        query = query.eq('is_duplicata', false)
      }

      if (filter.convenio) {
        query = query.eq('Convenio', filter.convenio)
      }

      if (filter.codigoTUSS) {
        query = query.eq('CodigoTUSS', filter.codigoTUSS)
      }

      if (filter.ano) {
        query = query.eq('Ano', filter.ano)
      }

      if (filter.mes) {
        query = query.eq('Mes', filter.mes)
      }

      const { data: rows, error: err } = await query.limit(2000)

      if (err) throw err

      // Busca de texto livre: filtra client-side em Convenio, CodigoTUSS, Descricao
      const term = filter.search?.trim().toLowerCase()
      const filtered = term
        ? (rows ?? []).filter(r =>
            r.Convenio?.toLowerCase().includes(term) ||
            r.CodigoTUSS?.toLowerCase().includes(term) ||
            r.Descricao?.toLowerCase().includes(term)
          )
        : (rows ?? [])

      setData(filtered)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [
    filter.search,
    filter.convenio,
    filter.codigoTUSS,
    filter.ano,
    filter.mes,
    filter.apenasCanonicos,
  ])

  useEffect(() => { fetch() }, [fetch])

  return { data, loading, error, refetch: fetch }
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived helpers for filter options
// ─────────────────────────────────────────────────────────────────────────────

export function useValoresTussOptions() {
  const [convenios,  setConvenios]  = useState<string[]>([])
  const [codigos,    setCodigos]    = useState<string[]>([])
  const [periodos,   setPeriodos]   = useState<{ ano: number; mes: number; label: string }[]>([])
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('valores_tuss')
        .select('Convenio, CodigoTUSS, Ano, Mes')
        .eq('is_duplicata', false)
        .order('Ano',  { ascending: false })
        .order('Mes',  { ascending: false })
        .limit(5000)

      if (!data) { setLoading(false); return }

      const convSet  = new Set<string>()
      const codSet   = new Set<string>()
      const perSet   = new Map<string, { ano: number; mes: number; label: string }>()

      for (const r of data) {
        if (r.Convenio)   convSet.add(r.Convenio)
        if (r.CodigoTUSS) codSet.add(r.CodigoTUSS)
        const key = `${r.Ano}-${String(r.Mes).padStart(2, '0')}`
        if (!perSet.has(key)) {
          perSet.set(key, { ano: r.Ano, mes: r.Mes, label: fmtPeriodo(r.Mes, r.Ano) })
        }
      }

      setConvenios([...convSet].sort())
      setCodigos([...codSet].sort())
      setPeriodos([...perSet.values()])
      setLoading(false)
    }
    load()
  }, [])

  return { convenios, codigos, periodos, loading }
}
