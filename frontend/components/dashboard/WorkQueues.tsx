import Link from 'next/link'
import { AlertTriangle, UserX, Clock, Search, ArrowRight, Tag, FileQuestion } from 'lucide-react'

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
    procedimentoDivergente:  number
    pendentesRevisao:        number
    glosaTotal:              number
    glosaParci:              number
    tussCodigoSemHistorico:  number   // Causa 1+3: código mapeado sem preço histórico
    tussMapeamentoSemCodigo: number   // Causa 2: mapeamento sem código TUSS definido
  }
  /** Exibe itens financeiros (links para Faturamento). false para visualizador/editor */
  showFinancial?: boolean
}

const priorityConfig = {
  alta:  { card: 'border-red-200 bg-red-50 hover:bg-red-100',         dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700 border-red-200'       },
  media: { card: 'border-orange-200 bg-orange-50 hover:bg-orange-100', dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700 border-orange-200' },
  baixa: { card: 'border-yellow-200 bg-yellow-50 hover:bg-yellow-100', dot: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
}

export function WorkQueues({ stats, showFinancial = true }: WorkQueuesProps) {
  // Itens que apontam para /faturamento só são exibidos para financeiro/admin
  const FINANCIAL_HREFS = ['/faturamento', '/faturamento?tab=downgrade']

  const allQueues: WorkQueueItem[] = [
    // ── Alta prioridade ──────────────────────────────────────────────
    {
      title:       'Mapeamento TUSS Incompleto',
      count:       stats.tussMapeamentoSemCodigo,
      description: 'Procedimentos não repassados sem código TUSS definido na tabela de mapeamento — corrigir para viabilizar recuperação',
      href:        '/configuracoes',
      icon:        <FileQuestion className="w-4 h-4" />,
      priority:    'alta',
    },
    {
      title:       'Procedimentos Anatomicamente Divergentes',
      count:       stats.procedimentoDivergente,
      description: 'Endoscopia correlacionada com Colonoscopia — risco alto de falso positivo',
      href:        '/auditoria?filtro=divergente',
      icon:        <AlertTriangle className="w-4 h-4" />,
      priority:    'alta',
    },
    // ── Média prioridade ─────────────────────────────────────────────
    {
      title:       'Revisão de Nomes e Datas',
      count:       stats.pendentesRevisao,
      description: 'Matches por fuzzy, data flexível ou nº atendimento — requer confirmação humana',
      href:        '/auditoria?filtro=fallback',
      icon:        <UserX className="w-4 h-4" />,
      priority:    'media',
    },
    {
      title:       'Códigos TUSS sem Valor de Referência',
      count:       stats.tussCodigoSemHistorico,
      description: 'Procedimentos não repassados com código TUSS identificado mas sem histórico de preço — valor de recuperação não estimável',
      href:        '/faturamento',
      icon:        <Tag className="w-4 h-4" />,
      priority:    'media',
    },
    {
      title:       'Glosas Totais',
      count:       stats.glosaTotal,
      description: 'Procedimentos correlacionados com valor liberado = zero',
      href:        '/auditoria?filtro=glosa_total',
      icon:        <Clock className="w-4 h-4" />,
      priority:    'media',
    },
    // ── Baixa prioridade ─────────────────────────────────────────────
    {
      title:       'Glosas Parciais',
      count:       stats.glosaParci,
      description: 'Valor pago inferior ao estimado — verificar divergência de código',
      href:        '/faturamento?tab=downgrade',
      icon:        <Search className="w-4 h-4" />,
      priority:    'baixa',
    },
  ]

  const queues = showFinancial
    ? allQueues
    : allQueues.filter(q => !FINANCIAL_HREFS.includes(q.href))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-gray-700">Filas de Trabalho</h3>

      <div className="flex flex-col gap-2">
        {queues.map((q) => {
          const cfg = priorityConfig[q.priority]
          return (
            <Link key={q.href + q.title} href={q.href}>
              <div className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${cfg.card}`}>

                {/* Dot prioridade */}
                <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />

                {/* Texto */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-gray-800 leading-snug">{q.title}</span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded border flex-shrink-0 tabular-nums ${cfg.badge}`}>
                      {q.count.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 leading-snug sm:line-clamp-1">
                    {q.description}
                  </p>
                </div>

                <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
