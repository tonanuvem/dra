import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { StatusCorrelacao, StatusTUSS, MetodoMatch } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  // handle dd/mm/yyyy or yyyy-mm-dd
  if (date.includes('/')) return date
  const d = new Date(date)
  return d.toLocaleDateString('pt-BR')
}

export function getStatusCorrelacaoColor(status: StatusCorrelacao | null): string {
  if (!status) return 'bg-gray-100 text-gray-600'
  if (status === 'CORRELACIONADO') return 'bg-green-100 text-green-800'
  if (status === 'NAO_FATURADO_NO_REPASSE') return 'bg-red-100 text-red-800'
  if (status === 'REPASSE_NAO_IDENTIFICADO_NA_PRODUCAO') return 'bg-purple-100 text-purple-800'
  if (status === 'REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO') return 'bg-blue-100 text-blue-800'
  return 'bg-gray-100 text-gray-600'
}

export function getStatusTUSSColor(status: StatusTUSS | null): string {
  if (!status) return 'bg-gray-100 text-gray-600'
  if (status.includes('OK') || status.includes('RECONHECIDO') || status.includes('FATURADOS') || status.includes('INCORPORADO')) {
    return 'bg-green-100 text-green-800'
  }
  if (status.includes('DIVERGENTE') || status.includes('AUSENTE') || status.includes('COBRADO_COMO_SIMPLES')) {
    return 'bg-orange-100 text-orange-800'
  }
  if (status === 'TUSS_NAO_FATURADO_MAPEADO') return 'bg-red-100 text-red-800'
  if (status.includes('SEM_PRODUCAO') || status.includes('SEM_MAPEAMENTO')) return 'bg-gray-100 text-gray-600'
  return 'bg-gray-100 text-gray-600'
}

export function getMetodoMatchLabel(metodo: MetodoMatch | null): string {
  if (!metodo) return '—'
  const m = metodo as string
  const isDivergente = m.includes('PROCEDIMENTO_DIVERGENTE')
  const base = isDivergente ? m.replace('_PROCEDIMENTO_DIVERGENTE', '') : m
  const baseLabels: Record<string, string> = {
    '1_NOME_COMPLETO_DATA_PROCEDIMENTO':       'Nome completo',
    '2_FALLBACK_NR-ATENDIMENTO_DATA_PROCEDIMENTO': 'Nr. Atendimento',
    '3_FALLBACK_NOME_PARCIAL_FUZZY_DATA_FIXA': 'Nome fuzzy',
    '4_FALLBACK_NOME_COMPLETO_DATA-FLEXIVEL':  'Data flexível',
    '5_FALLBACK_COMPANION_PROCEDIMENTO_ADICIONAL': 'Proc. adicional',
    'SEM_MATCH': 'Sem match',
  }
  const label = baseLabels[base] ?? base
  return isDivergente ? `${label} • Proc. Divergente` : label
}

export function getStatusCorrelacaoLabel(status: StatusCorrelacao | null): string {
  if (!status) return '—'
  const labels: Record<string, string> = {
    'CORRELACIONADO':                        'Pago e Conferido',
    'NAO_FATURADO_NO_REPASSE':               'Procedimento não Repassado pelo Hospital',
    'REPASSE_NAO_IDENTIFICADO_NA_PRODUCAO':  'Pago pelo Hospital sem Registro na Produção',
    'REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO': 'Cobrança Fora do Período Analisado',
  }
  return labels[status] ?? status
}

export function getRiskLevel(status: StatusCorrelacao | null, metodo: MetodoMatch | null): 'alto' | 'medio' | 'baixo' | null {
  if (!status) return null
  const m = metodo as string ?? ''
  if (m.includes('PROCEDIMENTO_DIVERGENTE') || metodo === '3_FALLBACK_NOME_PARCIAL_FUZZY_DATA_FIXA') return 'alto'
  if (metodo === '4_FALLBACK_NOME_COMPLETO_DATA-FLEXIVEL' || metodo === '2_FALLBACK_NR-ATENDIMENTO_DATA_PROCEDIMENTO') return 'medio'
  if (status === 'REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO') return 'baixo'
  return null
}

export function needsHumanReview(row: { StatusCorrelacao: StatusCorrelacao | null; MetodoMatch: MetodoMatch | null; StatusTUSS: StatusTUSS | null }): boolean {
  const m = (row.MetodoMatch as string) ?? ''
  const reviewMetodos = [
    '2_FALLBACK_NR-ATENDIMENTO_DATA_PROCEDIMENTO',
    '3_FALLBACK_NOME_PARCIAL_FUZZY_DATA_FIXA',
    '4_FALLBACK_NOME_COMPLETO_DATA-FLEXIVEL',
  ]
  if (row.StatusCorrelacao === 'REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO') return true
  if (m.includes('PROCEDIMENTO_DIVERGENTE')) return true
  if (reviewMetodos.some(r => m.startsWith(r))) return true
  if (row.StatusTUSS === 'TUSS_COMBINACAO_SEM_MAPEAMENTO') return true
  return false
}
