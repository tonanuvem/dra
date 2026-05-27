'use client'

import { useState } from 'react'
import { CheckSquare, Square } from 'lucide-react'

interface CheckItem {
  id: string
  label: string
  autoCheck?: boolean
}

interface AuditChecklistProps {
  items: CheckItem[]
  onAllChecked?: (allChecked: boolean) => void
}

export function AuditChecklist({ items, onAllChecked }: AuditChecklistProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(items.map(i => [i.id, i.autoCheck ?? false]))
  )

  const toggle = (id: string) => {
    const next = { ...checked, [id]: !checked[id] }
    setChecked(next)
    onAllChecked?.(Object.values(next).every(Boolean))
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Checklist de Revisão</p>
      {items.map(item => (
        <button
          key={item.id}
          onClick={() => toggle(item.id)}
          className="flex items-center gap-2 w-full text-left text-sm hover:bg-gray-50 rounded p-1.5 transition-colors"
        >
          {checked[item.id]
            ? <CheckSquare className="w-4 h-4 text-green-600 flex-shrink-0" />
            : <Square className="w-4 h-4 text-gray-400 flex-shrink-0" />}
          <span className={checked[item.id] ? 'text-gray-500 line-through' : 'text-gray-700'}>
            {item.label}
          </span>
        </button>
      ))}
    </div>
  )
}
