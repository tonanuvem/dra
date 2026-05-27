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
  green: { bg: 'bg-green-50', border: 'border-green-200', icon: 'text-green-600 bg-green-100', value: 'text-green-700' },
  red: { bg: 'bg-red-50', border: 'border-red-200', icon: 'text-red-600 bg-red-100', value: 'text-red-700' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', icon: 'text-orange-600 bg-orange-100', value: 'text-orange-700' },
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-600 bg-blue-100', value: 'text-blue-700' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', icon: 'text-purple-600 bg-purple-100', value: 'text-purple-700' },
}

export function KpiCard({ title, value, subtitle, icon: Icon, color, href, loading }: KpiCardProps) {
  const c = colorMap[color]
  const inner = (
    <div className={cn('rounded-xl border p-4 flex items-start gap-4 transition-shadow', c.bg, c.border, href && 'hover:shadow-md cursor-pointer')}>
      <div className={cn('rounded-lg p-2.5 flex-shrink-0', c.icon)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-gray-600 leading-tight">{title}</p>
        {loading ? (
          <div className="h-7 w-16 bg-gray-200 rounded animate-pulse mt-1" />
        ) : (
          <p className={cn('text-2xl font-bold mt-0.5 leading-tight', c.value)}>{value}</p>
        )}
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )

  if (href) return <Link href={href}>{inner}</Link>
  return inner
}
