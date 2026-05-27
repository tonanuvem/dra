import { cn, getStatusCorrelacaoColor, getStatusCorrelacaoLabel, getStatusTUSSColor } from '@/lib/utils'
import type { StatusCorrelacao, StatusTUSS } from '@/lib/types'

interface StatusCorrelacaoBadgeProps {
  status: StatusCorrelacao | null
  className?: string
}

export function StatusCorrelacaoBadge({ status, className }: StatusCorrelacaoBadgeProps) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', getStatusCorrelacaoColor(status), className)}>
      {getStatusCorrelacaoLabel(status)}
    </span>
  )
}

interface StatusTUSSBadgeProps {
  status: StatusTUSS | null
  className?: string
}

const tussLabels: Record<string, string> = {
  'TUSS_PROC_PRINCIPAL_OK': 'OK',
  'TUSS_ADICIONAL_INCORPORADO_NO_PRINCIPAL': 'Adicional Incorporado',
  'TUSS_PROC_ADICIONAL_RECONHECIDO': 'Adicional OK',
  'TUSS_TODOS_CODIGOS_ADICIONAIS_FATURADOS': 'Todos OK',
  'TUSS_CODIGO_PRINCIPAL_DIVERGENTE': 'Cód. Divergente',
  'TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES': 'Cobrado Simples',
  'TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE': 'Cód. Ausente',
  'TUSS_NAO_FATURADO_MAPEADO': 'Não Faturado',
  'TUSS_REPASSE_SEM_PRODUCAO': 'Repasse s/ Prod.',
  'TUSS_COMBINACAO_SEM_MAPEAMENTO': 'Sem Mapeamento',
}

export function StatusTUSSBadge({ status, className }: StatusTUSSBadgeProps) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', getStatusTUSSColor(status), className)}>
      {status ? (tussLabels[status] ?? status) : '—'}
    </span>
  )
}
