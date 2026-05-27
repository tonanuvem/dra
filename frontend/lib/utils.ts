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
  if (status.includes('GLOSA_TOTAL')) return 'bg-red-100 text-red-800'
  if (status.includes('GLOSA_PARCIAL')) return 'bg-orange-100 text-orange-800'
  if (status.includes('DIVERGENTE')) return 'bg-red-100 text-red-800'
  if (status.includes('FALLBACK') || status.includes('NR_ATENDIMENTO') || status.includes('VIA_NR')) return 'bg-yellow-100 text-yellow-800'
  if (status === 'NAO_FATURADO_NO_REPASSE') return 'bg-red-100 text-red-800'
  if (status.includes('REPASSE_NAO_IDENTIFICADO')) return 'bg-purple-100 text-purple-800'
  if (status.includes('DATA_FORA')) return 'bg-blue-100 text-blue-800'
  if (status.includes('ADICIONAL')) return 'bg-teal-100 text-teal-800'
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
  const labels: Record<string, string> = {
    '1_NOME_COMPLETO_DATA_PROCEDIMENTO': 'Nome completo',
    '2_FALLBACK_NR-ATENDIMENTO_DATA_PROCEDIMENTO': 'Nr. Atendimento',
    '3_FALLBACK_NOME_PARCIAL_FUZZY_DATA_FIXA': 'Nome fuzzy',
    '4_FALLBACK_NOME_COMPLETO_DATA-FLEXIVEL': 'Data flexível',
    '5_FALLBACK_PROCEDIMENTO_ADICIONAL_PROCEDIMENTO_ADICIONAL': 'Proc. adicional',
    'SEM_MATCH': 'Sem match',
  }
  return labels[metodo] ?? metodo
}

export function getStatusCorrelacaoLabel(status: StatusCorrelacao | null): string {
  if (!status) return '—'
  const labels: Record<string, string> = {
    'CORRELACIONADO':                                             'Pago e Conferido',
    'CORRELACIONADO_COM_GLOSA_TOTAL':                            'Glosado – Valor Zerado',
    'CORRELACIONADO_COM_GLOSA_PARCIAL':                          'Pago a Menor – Glosa Parcial',
    'CORRELACIONADO_FALLBACK_1':                                 'Pago – Nome com Variação Gráfica (Conferir)',
    'CORRELACIONADO_FALLBACK_2':                                 'Pago – Vinculado com Data Diferente (Conferir)',
    'CORRELACIONADO_VIA_NR_ATENDIMENTO':                         'Pago – Identificado pelo Nº de Atendimento',
    'CORRELACIONADO_PROCEDIMENTO_DIVERGENTE':                    'Pago com Código de Procedimento Diferente',
    'CORRELACIONADO_FALLBACK_1_PROCEDIMENTO_DIVERGENTE':         'Nome com Variação + Proc. Diferente (Revisar)',
    'CORRELACIONADO_FALLBACK_2_PROCEDIMENTO_DIVERGENTE':         'Data Diferente + Proc. Divergente (Revisar)',
    'CORRELACIONADO_VIA_NR_ATENDIMENTO_PROCEDIMENTO_DIVERGENTE': 'Nº Atend. + Proc. Diferente (Revisar)',
    'CORRELACIONADO_PROCEDIMENTO_ADICIONAL':                     'Pago como Procedimento Adicional do Episódio',
    'NAO_FATURADO_NO_REPASSE':                                   'Procedimento não Cobrado pelo Hospital',
    'REPASSE_NAO_IDENTIFICADO_NA_PRODUCAO':                      'Cobrado pelo Hospital sem Registro na Produção',
    'REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO':                     'Cobrança Fora do Período Analisado',
  }
  return labels[status] ?? status
}

export function getRiskLevel(status: StatusCorrelacao | null, metodo: MetodoMatch | null): 'alto' | 'medio' | 'baixo' | null {
  if (!status) return null
  if (status.includes('DIVERGENTE') || metodo === '3_FALLBACK_NOME_PARCIAL_FUZZY_DATA_FIXA') return 'alto'
  if (metodo === '4_FALLBACK_NOME_COMPLETO_DATA-FLEXIVEL' || metodo === '2_FALLBACK_NR-ATENDIMENTO_DATA_PROCEDIMENTO') return 'medio'
  if (status === 'REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO') return 'baixo'
  return null
}

export function needsHumanReview(row: { StatusCorrelacao: StatusCorrelacao | null; MetodoMatch: MetodoMatch | null; StatusTUSS: StatusTUSS | null }): boolean {
  const reviewStatuses: Array<StatusCorrelacao> = [
    'CORRELACIONADO_PROCEDIMENTO_DIVERGENTE',
    'CORRELACIONADO_FALLBACK_1_PROCEDIMENTO_DIVERGENTE',
    'CORRELACIONADO_FALLBACK_2_PROCEDIMENTO_DIVERGENTE',
    'CORRELACIONADO_VIA_NR_ATENDIMENTO_PROCEDIMENTO_DIVERGENTE',
    'CORRELACIONADO_FALLBACK_1',
    'CORRELACIONADO_FALLBACK_2',
    'REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO',
  ]
  const reviewMetodos: Array<MetodoMatch> = [
    '2_FALLBACK_NR-ATENDIMENTO_DATA_PROCEDIMENTO',
    '3_FALLBACK_NOME_PARCIAL_FUZZY_DATA_FIXA',
    '4_FALLBACK_NOME_COMPLETO_DATA-FLEXIVEL',
  ]
  if (row.StatusCorrelacao && reviewStatuses.includes(row.StatusCorrelacao)) return true
  if (row.MetodoMatch && reviewMetodos.includes(row.MetodoMatch)) return true
  if (row.StatusTUSS === 'TUSS_COMBINACAO_SEM_MAPEAMENTO') return true
  return false
}
