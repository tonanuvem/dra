'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { TABLES } from '@/lib/config'
import type { Correlacao, StatusCorrelacao, StatusTUSS, MetodoMatch } from '@/lib/types'

const TABLE = TABLES.correlacao

// Columns that may not exist yet (added via migration)
const AUDIT_COLUMNS_EXIST = false // set to true after running supabase-migration.sql

export interface CorrelacoesFilter {
  statusCorrelacao?: StatusCorrelacao[]
  statusTUSS?: StatusTUSS[]
  metodoMatch?: MetodoMatch[]
  pendentesRevisao?: boolean
  search?: string
  limit?: number
  offset?: number
}

export function useCorrelacoes(filter: CorrelacoesFilter = {}) {
  const [data, setData] = useState<Correlacao[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase.from(TABLE).select('*', { count: 'exact' })

      if (filter.statusCorrelacao?.length) {
        query = query.in('StatusCorrelacao', filter.statusCorrelacao)
      }
      if (filter.statusTUSS?.length) {
        query = query.in('StatusTUSS', filter.statusTUSS)
      }
      if (filter.metodoMatch?.length) {
        query = query.in('MetodoMatch', filter.metodoMatch)
      }
      // Only filter by decisao_humana if column exists
      if (filter.pendentesRevisao && AUDIT_COLUMNS_EXIST) {
        query = query.is('decisao_humana', null)
      }
      if (filter.search) {
        query = query.or(
          `Paciente_PRODUCAO.ilike.%${filter.search}%,Paciente_REPASSE.ilike.%${filter.search}%`
        )
      }

      query = query
        .order('Data_PRODUCAO', { ascending: false })
        .range(filter.offset ?? 0, (filter.offset ?? 0) + (filter.limit ?? 50) - 1)

      const { data: rows, count, error: err } = await query

      if (err) throw err
      setData(((rows as unknown) as Correlacao[]) ?? [])
      setTotal(count ?? 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [JSON.stringify(filter)])

  useEffect(() => { fetch() }, [fetch])

  return { data, total, loading, error, refetch: fetch }
}

export function useDashboardStats() {
  const [stats, setStats] = useState({
    total: 0,
    correlacionados: 0,
    naoFaturados: 0,
    repasseNaoIdentificado: 0,
    glosaTotal: 0,
    glosaParci: 0,
    procedimentoDivergente: 0,
    pendentesRevisao: 0,
    valorRecuperar: 0,
    statusDistribution: [] as { status: string; total: number; valor: number }[],
    // ── Filas TUSS ───────────────────────────────────────
    // Causa 1+3: código identificado mas sem histórico de preço
    tussCodigoSemHistorico: 0,
    // Causa 2: mapeamento sem código TUSS definido
    tussMapeamentoSemCodigo: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        // Fetch in batches of 1000 (Supabase default page size)
        let allRows: Array<{
          StatusCorrelacao: string | null
          ValorEstimado_TUSS: number | null
          MetodoMatch: string | null
          StatusTUSS: string | null
          CodigosTUSS_Esperados: string | null
        }> = []

        let from = 0
        const batchSize = 1000
        while (true) {
          const { data: batch, error } = await supabase
            .from(TABLE)
            .select('StatusCorrelacao, ValorEstimado_TUSS, MetodoMatch, StatusTUSS, CodigosTUSS_Esperados')
            .range(from, from + batchSize - 1)

          if (error || !batch || batch.length === 0) break
          allRows = allRows.concat((batch as unknown) as typeof allRows)
          if (batch.length < batchSize) break
          from += batchSize
        }

        if (allRows.length === 0) return

        const byStatus: Record<string, { count: number; valor: number }> = {}
        let pendentesRevisao      = 0
        let valorRecuperar        = 0
        let tussCodigoSemHistorico = 0  // Causa 1+3: código mapeado mas sem preço histórico
        let tussMapeamentoSemCodigo = 0 // Causa 2: mapeamento existe mas código TUSS vazio

        for (const row of allRows) {
          const s = row.StatusCorrelacao ?? 'DESCONHECIDO'
          if (!byStatus[s]) byStatus[s] = { count: 0, valor: 0 }
          byStatus[s].count++
          byStatus[s].valor += Number(row.ValorEstimado_TUSS ?? 0)

          if (needsReview({
            StatusCorrelacao: row.StatusCorrelacao ?? undefined,
            MetodoMatch: row.MetodoMatch ?? undefined,
            StatusTUSS: row.StatusTUSS ?? undefined,
          })) pendentesRevisao++

          if (Number(row.ValorEstimado_TUSS ?? 0) > 0) {
            valorRecuperar += Number(row.ValorEstimado_TUSS)
          }

          // ── Filas TUSS: apenas NAO_FATURADO_NO_REPASSE + TUSS_NAO_FATURADO_MAPEADO sem valor
          const isNaoFaturadoMapeado =
            row.StatusCorrelacao === 'NAO_FATURADO_NO_REPASSE' &&
            row.StatusTUSS       === 'TUSS_NAO_FATURADO_MAPEADO' &&
            row.ValorEstimado_TUSS == null

          if (isNaoFaturadoMapeado) {
            const codigos = (row.CodigosTUSS_Esperados ?? '').trim()
            const temCodigo = codigos !== '' && codigos.toLowerCase() !== 'nan'
            if (temCodigo) {
              tussCodigoSemHistorico++   // código existe, mas sem histórico de preço
            } else {
              tussMapeamentoSemCodigo++  // mapeamento incompleto: código ausente
            }
          }
        }

        const dist = Object.entries(byStatus)
          .map(([status, { count, valor }]) => ({ status, total: count, valor }))
          .sort((a, b) => b.total - a.total)

        setStats({
          total: allRows.length,
          correlacionados: byStatus['CORRELACIONADO']?.count ?? 0,
          naoFaturados: byStatus['NAO_FATURADO_NO_REPASSE']?.count ?? 0,
          repasseNaoIdentificado: byStatus['REPASSE_NAO_IDENTIFICADO_NA_PRODUCAO']?.count ?? 0,
          glosaTotal: byStatus['CORRELACIONADO_COM_GLOSA_TOTAL']?.count ?? 0,
          glosaParci: byStatus['CORRELACIONADO_COM_GLOSA_PARCIAL']?.count ?? 0,
          procedimentoDivergente: byStatus['CORRELACIONADO_PROCEDIMENTO_DIVERGENTE']?.count ?? 0,
          pendentesRevisao,
          valorRecuperar,
          statusDistribution: dist,
          tussCodigoSemHistorico,
          tussMapeamentoSemCodigo,
        })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return { stats, loading }
}

function needsReview(row: { StatusCorrelacao?: string; MetodoMatch?: string; StatusTUSS?: string }) {
  const s = row.StatusCorrelacao ?? ''
  const m = row.MetodoMatch ?? ''
  return (
    s.includes('DIVERGENTE') ||
    s === 'CORRELACIONADO_FALLBACK_1' ||
    s === 'CORRELACIONADO_FALLBACK_2' ||
    s === 'REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO' ||
    m === '2_FALLBACK_NR-ATENDIMENTO_DATA_PROCEDIMENTO' ||
    m === '3_FALLBACK_NOME_PARCIAL_FUZZY_DATA_FIXA' ||
    m === '4_FALLBACK_NOME_COMPLETO_DATA-FLEXIVEL' ||
    row.StatusTUSS === 'TUSS_COMBINACAO_SEM_MAPEAMENTO'
  )
}
