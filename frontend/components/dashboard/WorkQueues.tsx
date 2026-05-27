import Link from 'next/link'
import { AlertTriangle, UserX, Clock, Search, ArrowRight } from 'lucide-react'

interface WorkQueueItem {
  title: string
  count: number
  description: string
  href: string
  icon: React.ReactNode
  priority: 'alta' | 'media' | 'baixa'
}

interface WorkQueuesProps {
  stats: {
    procedimentoDivergente: number
    pendentesRevisao: number
    glosaTotal: number
    glosaParci: number
  }
}

const priorityColors = {
  alta: 'border-red-200 bg-red-50 hover:bg-red-100',
  media: 'border-orange-200 bg-orange-50 hover:bg-orange-100',
  baixa: 'border-yellow-200 bg-yellow-50 hover:bg-yellow-100',
}

const priorityDot = {
  alta: 'bg-red-500',
  media: 'bg-orange-500',
  baixa: 'bg-yellow-500',
}

export function WorkQueues({ stats }: WorkQueuesProps) {
  const queues: WorkQueueItem[] = [
    {
      title: 'Procedimentos Anatomicamente Divergentes',
      count: stats.procedimentoDivergente,
      description: 'Endoscopia correlacionada com Colonoscopia — risco alto de falso positivo',
      href: '/auditoria?filtro=divergente',
      icon: <AlertTriangle className="w-4 h-4" />,
      priority: 'alta',
    },
    {
      title: 'Revisão de Nomes e Datas',
      count: stats.pendentesRevisao,
      description: 'Matches por fuzzy, data flexível ou nr. atendimento — requer confirmação humana',
      href: '/auditoria?filtro=fallback',
      icon: <UserX className="w-4 h-4" />,
      priority: 'media',
    },
    {
      title: 'Glosas Totais',
      count: stats.glosaTotal,
      description: 'Procedimentos correlacionados com valor liberado = zero',
      href: '/auditoria?filtro=glosa_total',
      icon: <Clock className="w-4 h-4" />,
      priority: 'media',
    },
    {
      title: 'Glosas Parciais',
      count: stats.glosaParci,
      description: 'Valor pago inferior ao estimado — verificar divergência de código',
      href: '/faturamento?tab=downgrade',
      icon: <Search className="w-4 h-4" />,
      priority: 'baixa',
    },
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Filas de Trabalho</h3>
      <div className="space-y-2">
        {queues.map((q) => (
          <Link key={q.href} href={q.href}>
            <div className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${priorityColors[q.priority]}`}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityDot[q.priority]}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">{q.title}</span>
                  <span className="text-xs font-bold text-gray-700 bg-white px-1.5 py-0.5 rounded border">
                    {q.count.toLocaleString('pt-BR')}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{q.description}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
