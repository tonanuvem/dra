'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { TABLES } from '@/lib/config'

// ── Colunas mínimas necessárias para calcular as estatísticas ──
const SELECT_COLS = [
  'lote_processamento',
  'criado_em',
  'is_duplicata',
  'decisao_humana',
  'Data_PRODUCAO',
  'AbaOrigemDados_PRODUCAO',
  'AbaOrigemDados_REPASSE',
  'StatusCorrelacao',
  'StatusTUSS',
  'ValorLiberado_REPASSE',
  'ValorEstimado_TUSS',
].join(',')

// ── Tipos ──────────────────────────────────────────────────────

export interface LoteStats {
  lote_processamento: string
  /** Timestamp de quando o lote foi inserido no Supabase */
  carregado_em: string
  /** Total de linhas incluindo duplicatas */
  total: number
  /** Linhas únicas (is_duplicata = false) */
  validos: number
  /** Linhas duplicadas (is_duplicata = true) */
  duplicatas: number
  /** Linhas revisadas pelo auditor (decisao_humana IS NOT NULL, is_duplicata=false) */
  revisados: number
  /** Linhas confirmadas (decisao_humana = 'confirmado') */
  confirmados: number
  /** Linhas desvinculadas (decisao_humana = 'desvinculado') */
  desvinculados: number
  /** Linhas válidas ainda sem revisão */
  pendentes: number
  /** Abas de origem formatadas, ex: ["Jan/25", "Fev/25", "Mar/25"] */
  periodos: string[]
  /** Distribuição de StatusCorrelacao entre linhas válidas */
  distribuicaoStatus: Record<string, number>
  /** Soma de ValorLiberado_REPASSE (linhas válidas correlacionadas) */
  valorPago: number
  /** Soma de ValorEstimado_TUSS (linhas válidas com estimativa) */
  valorEstimado: number
  /** Indica se é o lote mais recente */
  isAtual: boolean
}

// ── Helpers ────────────────────────────────────────────────────

const MESES_PT: Record<string, string> = {
  JANEIRO: 'Jan', FEVEREIRO: 'Fev', MARÇO: 'Mar', MARCO: 'Mar',
  ABRIL: 'Abr', MAIO: 'Mai', JUNHO: 'Jun',
  JULHO: 'Jul', AGOSTO: 'Ago', SETEMBRO: 'Set',
  OUTUBRO: 'Out', NOVEMBRO: 'Nov', DEZEMBRO: 'Dez',
}

/**
 * Extrai um rótulo de período legível de AbaOrigemDados_PRODUCAO.
 * "ABA: JANEIRO 2025" → "Jan/25"
 * "ABA: 202501"       → "Jan/25"
 * Retorna null se não reconhecer o formato.
 */
function parsePeriodo(aba: string | null): string | null {
  if (!aba) return null
  const upper = aba.toUpperCase().replace('ABA:', '').trim()

  // Formato "YYYYMM"
  const numMatch = upper.match(/^(\d{4})(\d{2})$/)
  if (numMatch) {
    const ano = numMatch[1].slice(2)
    const mes = parseInt(numMatch[2], 10)
    const mesNomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    return mes >= 1 && mes <= 12 ? `${mesNomes[mes - 1]}/${ano}` : null
  }

  // Formato "MÊS YYYY"
  const textMatch = upper.match(/^([A-ZÁÉÍÓÚÃÂÊÔÇ]+)\s+(\d{4})$/)
  if (textMatch) {
    const mesLabel = MESES_PT[textMatch[1]] ?? null
    const ano = textMatch[2].slice(2)
    return mesLabel ? `${mesLabel}/${ano}` : null
  }

  return null
}

/** Ordena rótulos de período ("Jan/25", "Fev/25" ...) cronologicamente */
function sortPeriodos(periodos: string[]): string[] {
  const mesIdx: Record<string, number> = {
    Jan: 0, Fev: 1, Mar: 2, Abr: 3, Mai: 4, Jun: 5,
    Jul: 6, Ago: 7, Set: 8, Out: 9, Nov: 10, Dez: 11,
  }
  return [...periodos].sort((a, b) => {
    const [mA, yA] = a.split('/')
    const [mB, yB] = b.split('/')
    const yearDiff = parseInt(yA) - parseInt(yB)
    if (yearDiff !== 0) return yearDiff
    return (mesIdx[mA] ?? 0) - (mesIdx[mB] ?? 0)
  })
}

/** Formata lote_processamento para exibição: "20260527_181451" → "27/05/2026 18:14" */
export function formatLote(lote: string): string {
  const m = lote.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/)
  if (!m) return lote
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`
}

// ── Hook principal ─────────────────────────────────────────────

export function useCarregamentos() {
  const [lotes, setLotes]   = useState<LoteStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  async function load() {
      setLoading(true)
      setError(null)
      try {
        // Carrega todas as linhas com as colunas mínimas
        const BATCH = 1000
        let allRows: Array<Record<string, unknown>> = []
        let from = 0
        while (true) {
          const { data, error: err } = await supabase
            .from(TABLES.correlacao)
            .select(SELECT_COLS)
            .range(from, from + BATCH - 1)
          if (err) throw err
          if (!data || data.length === 0) break
          allRows = allRows.concat(data as Array<Record<string, unknown>>)
          if (data.length < BATCH) break
          from += BATCH
        }

        if (allRows.length === 0) {
          setLotes([])
          return
        }

        // Agrupa por lote_processamento
        const byLote = new Map<string, typeof allRows>()
        for (const row of allRows) {
          const lote = (row.lote_processamento as string) ?? 'desconhecido'
          if (!byLote.has(lote)) byLote.set(lote, [])
          byLote.get(lote)!.push(row)
        }

        // Calcula estatísticas por lote
        const lotesOrdenados = [...byLote.keys()].sort().reverse() // mais recente primeiro

        const result: LoteStats[] = lotesOrdenados.map((lote, idx) => {
          const rows = byLote.get(lote)!

          const validos     = rows.filter(r => !r.is_duplicata)
          const duplicatas  = rows.filter(r =>  r.is_duplicata)
          const revisados   = validos.filter(r => r.decisao_humana != null)
          const confirmados = validos.filter(r => r.decisao_humana === 'confirmado')
          const desvinculados = validos.filter(r => r.decisao_humana === 'desvinculado')

          // Períodos (abas de origem da PRODUÇÃO)
          const periodoSet = new Set<string>()
          for (const r of validos) {
            const p = parsePeriodo(r['AbaOrigemDados_PRODUCAO'] as string)
            if (p) periodoSet.add(p)
          }

          // Distribuição de StatusCorrelacao
          const distStatus: Record<string, number> = {}
          for (const r of validos) {
            const s = (r.StatusCorrelacao as string) ?? 'DESCONHECIDO'
            distStatus[s] = (distStatus[s] ?? 0) + 1
          }

          // Valores financeiros
          const valorPago = validos.reduce(
            (acc, r) => acc + (Number(r['ValorLiberado_REPASSE']) || 0), 0
          )
          const valorEstimado = validos.reduce(
            (acc, r) => acc + (Number(r['ValorEstimado_TUSS']) || 0), 0
          )

          // criado_em mínimo como timestamp de carregamento
          const carregado_em = rows
            .map(r => r.criado_em as string)
            .filter(Boolean)
            .sort()[0] ?? lote

          return {
            lote_processamento: lote,
            carregado_em,
            total:       rows.length,
            validos:     validos.length,
            duplicatas:  duplicatas.length,
            revisados:   revisados.length,
            confirmados: confirmados.length,
            desvinculados: desvinculados.length,
            pendentes:   validos.length - revisados.length,
            periodos:    sortPeriodos([...periodoSet]),
            distribuicaoStatus: distStatus,
            valorPago,
            valorEstimado,
            isAtual: idx === 0,
          }
        })

        setLotes(result)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao carregar lotes')
      } finally {
        setLoading(false)
      }
  }

  useEffect(() => { load() }, [])

  return { lotes, loading, error, refetch: load }
}
