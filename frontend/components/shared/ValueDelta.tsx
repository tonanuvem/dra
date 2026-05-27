import { cn, formatCurrency } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface ValueDeltaProps {
  recebido: number | null
  estimado: number | null
  className?: string
}

export function ValueDelta({ recebido, estimado, className }: ValueDeltaProps) {
  const delta = (estimado ?? 0) - (recebido ?? 0)
  const isNegative = delta < 0
  const isZero = Math.abs(delta) < 0.01

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500 text-xs w-16">Recebido</span>
        <span className="font-medium">{formatCurrency(recebido)}</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500 text-xs w-16">Estimado</span>
        <span className="font-medium">{formatCurrency(estimado)}</span>
      </div>
      {!isZero && (
        <div className={cn(
          'flex items-center gap-1 text-xs font-semibold mt-0.5',
          isNegative ? 'text-orange-600' : 'text-red-600'
        )}>
          {isNegative ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
          {isNegative ? 'Negativo: ' : 'A recuperar: '}
          {formatCurrency(Math.abs(delta))}
        </div>
      )}
    </div>
  )
}
