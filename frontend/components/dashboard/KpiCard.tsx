import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'

interface KpiCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  color: 'green' | 'red' | 'orange' | 'blue' | 'purple'
  href?: string
  loading?: boolean
}

const colorMap = {
  green:  { bg: 'bg-green-50',  border: 'border-green-200',  icon: 'text-green-600 bg-green-100',  value: 'text-green-700'  },
  red:    { bg: 'bg-red-50',    border: 'border-red-200',    icon: 'text-red-600 bg-red-100',      value: 'text-red-700'    },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', icon: 'text-orange-600 bg-orange-100',value: 'text-orange-700' },
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   icon: 'text-blue-600 bg-blue-100',    value: 'text-blue-700'   },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', icon: 'text-purple-600 bg-purple-100',value: 'text-purple-700' },
}

export function KpiCard({ title, value, subtitle, icon: Icon, color, href, loading }: KpiCardProps) {
  const c = colorMap[color]

  const strValue  = String(value)
  const isMonetary = strValue.startsWith('R$')
  // Escala da fonte baseada no comprimento do valor monetário
  const valueClass = isMonetary
    ? strValue.length > 14
      ? 'text-sm sm:text-base lg:text-lg'   // ex: R$ 1.173.365,14  (≥15 chars)
      : strValue.length > 10
        ? 'text-base sm:text-lg lg:text-xl'  // ex: R$ 12.345,67    (11-14 chars)
        : 'text-lg sm:text-xl lg:text-2xl'   // ex: R$ 123,45       (≤10 chars)
    : 'text-xl sm:text-2xl'                  // contagens numéricas

  const inner = (
    <div className={cn(
      'rounded-xl border p-3 sm:p-4 flex items-start gap-3 transition-shadow h-full',
      c.bg, c.border,
      href && 'hover:shadow-md cursor-pointer active:scale-[0.98]',
    )}>
      {/* Ícone */}
      <div className={cn('rounded-lg p-2 flex-shrink-0', c.icon)}>
        <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
      </div>

      {/* Conteúdo */}
      <div className="min-w-0 flex-1">
        <p className="text-xs sm:text-sm text-gray-600 leading-tight">{title}</p>

        {loading ? (
          <div className="h-6 sm:h-7 w-16 bg-gray-200 rounded animate-pulse mt-1" />
        ) : (
          <p className={cn(
            'font-bold mt-0.5 leading-tight tabular-nums break-all',
            valueClass,
            c.value,
          )}>
            {value}
          </p>
        )}

        {subtitle && (
          <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 leading-tight">{subtitle}</p>
        )}
      </div>
    </div>
  )

  if (href) return <Link href={href} className="block h-full">{inner}</Link>
  return inner
}
