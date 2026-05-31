'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { TABLES } from '@/lib/config'
import type { Correlacao, StatusCorrelacao, StatusTUSS, MetodoMatch } from '@/lib/types'

const TABLE = TABLES.correlacao

const AUDIT_COLUMNS_EXIST = true

export interface CorrelacoesFilter {
  statusCorrelacao?: StatusCorrelacao[]
  statusTUSS?: StatusTUSS[]
  metodoMatch?: MetodoMatch[]
  pendentesRevisao?: boolean
  search?: string
  /** Busca pelo Nr. Atendimento (PRODUCAO e REPASSE) — usado na página Pesquisa */
  searchNrAtendimento?: string
  /** Busca pelo Procedimento (PRODUCAO e REPASSE) — usado na página Pesquisa */
  searchProcedimento?: string
  /** Busca pela Data de Produção exata (formato DD/MM/YYYY ou YYYY-MM-DD) */
  searchData?: string
  limit?: number
  offset?: number
  /**
   * Quando true, ignora limit/offset e carrega TODOS os registros em batches
   * de 1000 (igual ao dashboard). Use para páginas que precisam de totais exatos.
   */
  loadAll?: boolean
}

/** Aplica cláusulas WHERE em uma query Supabase já iniciada (tipada como any) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(q: any, filter: CorrelacoesFilter): any {
  // Sempre exclui duplicatas e registros desativados da auditoria
  q = q.eq('is_duplicata', false).eq('ativo', true)
  if (filter.statusCorrelacao?.length)  q = q.in('StatusCorrelacao', filter.statusCorrelacao)
  if (filter.statusTUSS?.length)        q = q.in('StatusTUSS', filter.statusTUSS)
  if (filter.metodoMatch?.length)       q = q.in('MetodoMatch', filter.metodoMatch)
  if (filter.pendentesRevisao && AUDIT_COLUMNS_EXIST) q = q.is('decisao_humana', null)
  if (filter.search) {
    q = q.or(
      `Paciente_PRODUCAO.ilike.%${filter.search}%,Paciente_REPASSE.ilike.%${filter.search}%`
    )
  }
  if (filter.searchNrAtendimento) {
    q = q.or(
      `NrAtendimento_PRODUCAO.ilike.%${filter.searchNrAtendimento}%,NrAtendimento_REPASSE.ilike.%${filter.searchNrAtendimento}%`
    )
  }
  if (filter.searchProcedimento) {
    q = q.or(
      `Procedimento_PRODUCAO.ilike.%${filter.searchProcedimento}%,Procedimento_REPASSE.ilike.%${filter.searchProcedimento}%`
    )
  }
  if (filter.searchData) {
    q = q.eq('Data_PRODUCAO', filter.searchData)
  }
  return q
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
      if (filter.loadAll) {
        // ── Batch loading: carrega TODOS os registros em lotes de 1000 ────
        // Necessário quando o resultado total excede o limite padrão do Supabase.
        const BATCH = 1000
        let allRows: Correlacao[] = []
        let from = 0
        while (true) {
          let q = applyFilters(supabase.from(TABLE).select('*'), filter)
          q = q.order('Data_PRODUCAO', { ascending: false }).range(from, from + BATCH - 1)
          const { data: batch, error: err } = await q
          if (err) throw err
          if (!batch || batch.length === 0) break
          allRows = allRows.concat((batch as unknown) as Correlacao[])
          if (batch.length < BATCH) break
          from += BATCH
        }
        setData(allRows)
        setTotal(allRows.length)
      } else {
        // ── Paginação normal ──────────────────────────────────────────────
        let q = applyFilters(supabase.from(TABLE).select('*', { count: 'exact' }), filter)
        q = q
          .order('Data_PRODUCAO', { ascending: false })
          .range(filter.offset ?? 0, (filter.offset ?? 0) + (filter.limit ?? 50) - 1)

        const { data: rows, count, error: err } = await q
        if (err) throw err
        setData(((rows as unknown) as Correlacao[]) ?? [])
        setTotal(count ?? 0)
      }
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
    repasseForaPeriodo: 0,
    procedimentoDivergente: 0,
    pendentesRevisao: 0,
    valorRecuperar: 0,
    statusDistribution: [] as { status: string; total: number; valor: number; valorPago: number }[],
    tussOk: 0,
    tussCobrarCorrelacionados: 0,
    tussCobrarNaoFaturados: 0,
    tussManual: 0,
    tussStatusDistribution: [] as { status: string; total: number; valor: number; valorPago: number }[],
    // ── Filas de trabalho ──────────────────────────────────────────────
    /** Fila 3 (Financeiro): COBRAR_TUSS_* com ValorEstimado calculável */
    faturamentoCobrarComValor: 0,
    /** Fila 4 (Financeiro): CORRELACIONADO + valor pago aberrante + StatusTUSS = OK_* ou null */
    glosasContestacao: 0,
    /** Fila 5 (Financeiro): sem código TUSS definido (lookup incompleto + CORRELACIONAR_MANUAL) */
    lacunasMapeamento: 0,
    /** Fila 6 (Financeiro): código TUSS identificado mas sem histórico de preço */
    tussCodigoSemHistorico: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        // Fetch in batches of 1000 (Supabase default page size)
        let allRows: Array<{
          StatusCorrelacao: string | null
          ValorEstimado_TUSS: number | null
          ValorLiberado_REPASSE: number | null
          MetodoMatch: string | null
          StatusTUSS: string | null
          CodigosTUSS_Esperados: string | null
        }> = []

        let from = 0
        const batchSize = 1000
        while (true) {
          const { data: batch, error } = await supabase
            .from(TABLE)
            .select('StatusCorrelacao, ValorEstimado_TUSS, ValorLiberado_REPASSE, MetodoMatch, StatusTUSS, CodigosTUSS_Esperados')
            .eq('is_duplicata', false)
            .eq('ativo', true)
            .range(from, from + batchSize - 1)

          if (error || !batch || batch.length === 0) break
          allRows = allRows.concat((batch as unknown) as typeof allRows)
          if (batch.length < batchSize) break
          from += batchSize
        }

        if (allRows.length === 0) return

        const byStatus: Record<string, { count: number; valor: number; valorPago: number }> = {}
        let pendentesRevisao          = 0
        let valorRecuperar            = 0
        let tussCodigoSemHistorico    = 0
        let lacunasMapeamento         = 0
        let faturamentoCobrarComValor = 0
        let glosasContestacao         = 0
        let tussOk                    = 0
        let tussCobrarCorrelacionados = 0
        let tussCobrarNaoFaturados    = 0
        let tussManual                = 0

        // StatusTUSS que geram recuperação financeira ativa (mesmos da aba Faturamento)
        const RECOVERY_TUSS = new Set([
          'COBRAR_TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES',
          'COBRAR_TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE',
          'COBRAR_TUSS_NAO_FATURADO_MAPEADO',
          'COBRAR_TUSS_CODIGO_PRINCIPAL_DOWNGRADE',
        ])

        // StatusTUSS que vão para Faturamento (superset, inclui DIVERGENTE)
        const COBRAR_TUSS = new Set([...RECOVERY_TUSS, 'COBRAR_TUSS_CODIGO_PRINCIPAL_DIVERGENTE'])

        for (const row of allRows) {
          const s = row.StatusCorrelacao ?? 'DESCONHECIDO'
          if (!byStatus[s]) byStatus[s] = { count: 0, valor: 0, valorPago: 0 }
          byStatus[s].count++
          byStatus[s].valor     += Number(row.ValorEstimado_TUSS    ?? 0)
          byStatus[s].valorPago += Number(row.ValorLiberado_REPASSE ?? 0)

          if (needsReview({
            StatusCorrelacao: row.StatusCorrelacao ?? undefined,
            MetodoMatch: row.MetodoMatch ?? undefined,
            StatusTUSS: row.StatusTUSS ?? undefined,
          })) pendentesRevisao++

          // ── Valor a Recuperar: mesma lógica da aba Faturamento ──────────────
          // Apenas os 3 StatusTUSS de recuperação ativa (exclui linhas
          // correlacionadas OK, glosas totais, etc. que também têm ValorEstimado_TUSS)
          if (row.StatusTUSS && RECOVERY_TUSS.has(row.StatusTUSS)) {
            const estimado = Number(row.ValorEstimado_TUSS ?? 0)
            const recebido = Number(row.ValorLiberado_REPASSE ?? 0)
            let gap: number
            if (row.StatusTUSS === 'COBRAR_TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES' ||
              row.StatusTUSS === 'COBRAR_TUSS_CODIGO_PRINCIPAL_DOWNGRADE') {
              // Cobrado como simples / downgrade: recuperável = diferença (pode ser negativa — ignora)
              gap = Math.max(0, estimado - recebido)
            } else {
              // Ausente + Não Faturado: recuperável = valor estimado inteiro
              gap = estimado > 0 ? estimado : 0
            }
            valorRecuperar += gap
          }

          // ── Grupos TUSS ─────────────────────────────────────────────────
          const st = row.StatusTUSS ?? ''
          const sc = row.StatusCorrelacao ?? ''
          if (st.startsWith('OK_')) {
            tussOk++
          } else if (st.startsWith('COBRAR_')) {
            if (sc === 'CORRELACIONADO') tussCobrarCorrelacionados++
            else if (sc === 'NAO_FATURADO_NO_REPASSE') tussCobrarNaoFaturados++
          } else if (st.startsWith('CORRELACIONAR_MANUAL_')) {
            tussManual++
          }

          // ── Fila 3: COBRAR_* com valor estimado calculável ──────────────
          if (st && COBRAR_TUSS.has(st) && row.ValorEstimado_TUSS != null) {
            faturamentoCobrarComValor++
          }

          // ── Fila 4: Glosas puras (OK_TUSS_* ou sem status + valor aberrante) ─
          if (sc === 'CORRELACIONADO' && (st === '' || st.startsWith('OK_'))) {
            const rep = Number(row.ValorLiberado_REPASSE ?? 0)
            const est = Number(row.ValorEstimado_TUSS   ?? 0)
            if ((rep === 0 && est > 0) || (rep > 0 && est > 0 && rep < est * 0.95)) {
              glosasContestacao++
            }
          }

          // ── Filas 5 e 6: sub-casos de NAO_FATURADO + COBRAR_NAO_FATURADO_MAPEADO ─
          const isNaoFaturadoMapeadoSemValor =
            row.StatusCorrelacao === 'NAO_FATURADO_NO_REPASSE' &&
            row.StatusTUSS       === 'COBRAR_TUSS_NAO_FATURADO_MAPEADO' &&
            row.ValorEstimado_TUSS == null

          if (isNaoFaturadoMapeadoSemValor) {
            const codigos = (row.CodigosTUSS_Esperados ?? '').trim()
            const temCodigo = codigos !== '' && codigos.toLowerCase() !== 'nan'
            if (temCodigo) {
              tussCodigoSemHistorico++  // Fila 6: código existe, mas sem histórico de preço
            } else {
              lacunasMapeamento++       // Fila 5 (parte): mapeamento incompleto — código ausente
            }
          }

          // ── Fila 5 (parte): combinação sem mapeamento na lookup ──────────
          if (st === 'CORRELACIONAR_MANUAL_TUSS_COMBINACAO_SEM_MAPEAMENTO') {
            lacunasMapeamento++
          }
        }

        const dist = Object.entries(byStatus)
          .map(([status, { count, valor, valorPago }]) => ({ status, total: count, valor, valorPago }))
          .sort((a, b) => b.total - a.total)

        const tussStatusDistribution = [
          { status: 'TUSS_OK',     total: tussOk,                                        valor: 0, valorPago: 0 },
          { status: 'TUSS_COBRAR', total: tussCobrarCorrelacionados + tussCobrarNaoFaturados, valor: 0, valorPago: 0 },
          { status: 'TUSS_MANUAL', total: tussManual,                                     valor: 0, valorPago: 0 },
        ]

        setStats({
          total: allRows.length,
          correlacionados: byStatus['CORRELACIONADO']?.count ?? 0,
          naoFaturados: byStatus['NAO_FATURADO_NO_REPASSE']?.count ?? 0,
          repasseNaoIdentificado: byStatus['REPASSE_NAO_IDENTIFICADO_NA_PRODUCAO']?.count ?? 0,
          repasseForaPeriodo: byStatus['REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO']?.count ?? 0,
          procedimentoDivergente: allRows.filter(r =>
            (r.MetodoMatch as string)?.includes('PROCEDIMENTO_DIVERGENTE')
          ).length,
          pendentesRevisao,
          valorRecuperar,
          statusDistribution: dist,
          tussOk,
          tussCobrarCorrelacionados,
          tussCobrarNaoFaturados,
          tussManual,
          tussStatusDistribution,
          faturamentoCobrarComValor,
          glosasContestacao,
          lacunasMapeamento,
          tussCodigoSemHistorico,
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
    m.includes('PROCEDIMENTO_DIVERGENTE') ||
    s === 'REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO' ||
    m.startsWith('2_FALLBACK_NR-ATENDIMENTO') ||
    m.startsWith('3_FALLBACK_NOME_PARCIAL') ||
    m.startsWith('4_FALLBACK_NOME_COMPLETO') ||
    row.StatusTUSS === 'CORRELACIONAR_MANUAL_TUSS_COMBINACAO_SEM_MAPEAMENTO'
  )
}
