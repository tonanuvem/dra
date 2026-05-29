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
  // OK
  'OK_TUSS_PROC_PRINCIPAL_OK':                           'Código TUSS Correto',
  'OK_TUSS_ADICIONAL_INCORPORADO_NO_PRINCIPAL':          'Adicional Incorporado ao Código Principal',
  'OK_TUSS_PROC_ADICIONAL_RECONHECIDO':                  'Adicional Faturado com Código Correto',
  'OK_TUSS_TODOS_CODIGOS_ADICIONAIS_FATURADOS':          'Todos os Adicionais com Código Correto',
  'OK_TUSS_CODIGO_PRINCIPAL_UPGRADE':                    'Repasse com Código Superior ao Esperado',
  // COBRAR
  'COBRAR_TUSS_CODIGO_PRINCIPAL_DIVERGENTE':             'Código do Proc. Principal Diverge do Esperado',
  'COBRAR_TUSS_CODIGO_PRINCIPAL_DOWNGRADE':              'Repasse com Código Mais Simples – Cobrar Diferença',
  'COBRAR_TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES':     'Subcobrança: Adicional Faturado como Simples',
  'COBRAR_TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE':     'Código Adicional Não Encontrado no Repasse',
  'COBRAR_TUSS_NAO_FATURADO_MAPEADO':                   'Não Cobrado – Código TUSS Identificado (Recuperável)',
  // CORRELACIONAR_MANUAL
  'CORRELACIONAR_MANUAL_TUSS_REPASSE_SEM_PRODUCAO':      'Cobrança no Repasse sem Registro de Produção',
  'CORRELACIONAR_MANUAL_TUSS_COMBINACAO_SEM_MAPEAMENTO': 'Combinação de Procedimentos sem Mapeamento TUSS',
}

export function StatusTUSSBadge({ status, className }: StatusTUSSBadgeProps) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', getStatusTUSSColor(status), className)}>
      {status ? (tussLabels[status] ?? status) : '—'}
    </span>
  )
}
