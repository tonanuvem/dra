import { cn } from '@/lib/utils'

interface SimilarityScoreProps {
  score: number | null
  label?: string
  className?: string
}

export function SimilarityScore({ score, label, className }: SimilarityScoreProps) {
  if (score == null) return <span className="text-gray-400 text-sm">—</span>

  const pct = Math.round(score * 100)
  const colorClass =
    score >= 0.9 ? 'bg-green-100 text-green-800' :
    score >= 0.7 ? 'bg-yellow-100 text-yellow-800' :
    'bg-red-100 text-red-800'

  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold', colorClass, className)}>
      {label && <span className="font-normal text-xs opacity-70">{label}</span>}
      {pct}%
    </span>
  )
}
