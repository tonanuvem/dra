import Link from 'next/link'
import {
  AlertTriangle, UserX, ArrowRight, Tag, FileQuestion,
  DollarSign, GitMerge, BadgeDollarSign, User, Landmark,
} from 'lucide-react'
import type { Role } from '@/lib/permissions'

interface WorkQueueItem {
  title: string
  count: number
  description: string
  href: string
  icon: React.ReactNode
  priority: 'alta' | 'media' | 'baixa'
  /** Perfil responsável pela fila */
  profile: 'editor' | 'financeiro'
  /** Texto exibido no tooltip técnico (hover) */
  hint: string
}

interface WorkQueuesProps {
  stats: {
    procedimentoDivergente:   number
    pendentesRevisao:         number
    faturamentoCobrarComValor: number
    glosasContestacao:        number
    lacunasMapeamento:        number
    tussCodigoSemHistorico:   number
  }
  role?: Role | null
}

const priorityConfig = {
  alta:  { card: 'border-red-200 bg-red-50 hover:bg-red-100',         dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700 border-red-200'       },
  media: { card: 'border-orange-200 bg-orange-50 hover:bg-orange-100', dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700 border-orange-200' },
  baixa: { card: 'border-yellow-200 bg-yellow-50 hover:bg-yellow-100', dot: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
}

const profileConfig = {
  editor:     { label: 'Editor',     cls: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: <User className="w-3 h-3" /> },
  financeiro: { label: 'Financeiro', cls: 'bg-blue-100 text-blue-800 border-blue-200',       icon: <Landmark className="w-3 h-3" /> },
}

export function WorkQueues({ stats, role }: WorkQueuesProps) {
  const allQueues: WorkQueueItem[] = [
    // ── Editor — Auditoria ──────────────────────────────────────────────
    {
      title:       'Auditoria — Proc. Anatomicamente Divergentes',
      count:       stats.procedimentoDivergente,
      description: 'Endoscopia correlacionada com Colonoscopia — risco alto de falso positivo',
      href:        '/auditoria?filtro=divergente',
      icon:        <AlertTriangle className="w-4 h-4" />,
      priority:    'alta',
      profile:     'editor',
      hint:        'MetodoMatch com sufixo _PROCEDIMENTO_DIVERGENTE',
    },
    {
      title:       'Auditoria — Revisão de Nomes e Datas',
      count:       stats.pendentesRevisao,
      description: 'Matches por fuzzy, data flexível ou nº atendimento — requer confirmação humana',
      href:        '/auditoria?filtro=revisao_nomes',
      icon:        <UserX className="w-4 h-4" />,
      priority:    'media',
      profile:     'editor',
      hint:        'MetodoMatch com 2_FALLBACK_NR-ATENDIMENTO, 3_FALLBACK_NOME_PARCIAL ou 4_FALLBACK_NOME_COMPLETO',
    },
    // ── Financeiro — Faturamento ────────────────────────────────────────
    {
      title:       'Faturamento — Cobranças a Recuperar',
      count:       stats.faturamentoCobrarComValor,
      description: 'Procedimentos com valor TUSS estimado — prontos para gerar formulário de cobrança',
      href:        '/faturamento',
      icon:        <BadgeDollarSign className="w-4 h-4" />,
      priority:    'alta',
      profile:     'financeiro',
      hint:        'StatusTUSS = COBRAR_TUSS_* com ValorEstimado_TUSS calculável',
    },
    {
      title:       'Faturamento — Glosas a Contestar',
      count:       stats.glosasContestacao,
      description: 'Correlacionados com código correto mas valor pago zero ou abaixo do esperado',
      href:        '/faturamento?tab=glosas',
      icon:        <DollarSign className="w-4 h-4" />,
      priority:    'media',
      profile:     'financeiro',
      hint:        'StatusCorrelacao = CORRELACIONADO + ValorLiberado aberrante + StatusTUSS = OK_* ou nulo',
    },
    // ── Financeiro — TUSS ───────────────────────────────────────────────
    {
      title:       'TUSS — Lacunas de Mapeamento',
      count:       stats.lacunasMapeamento,
      description: 'Procedimentos sem código TUSS definido — corrigir para viabilizar recuperação',
      href:        '/mapeamentos-tuss',
      icon:        <GitMerge className="w-4 h-4" />,
      priority:    'alta',
      profile:     'financeiro',
      hint:        'StatusTUSS = CORRELACIONAR_MANUAL_TUSS_COMBINACAO_SEM_MAPEAMENTO ou CodigosTUSS_Esperados vazio',
    },
    {
      title:       'TUSS — Códigos sem Histórico de Preço',
      count:       stats.tussCodigoSemHistorico,
      description: 'Código TUSS identificado mas sem preço histórico cadastrado — valor de recuperação não estimável',
      href:        '/faturamento?tab=sem_historico',
      icon:        <Tag className="w-4 h-4" />,
      priority:    'media',
      profile:     'financeiro',
      hint:        'StatusTUSS = COBRAR_TUSS_NAO_FATURADO_MAPEADO com CodigosTUSS_Esperados preenchido mas ValorEstimado_TUSS nulo',
    },
  ]

  // Filtra filas por perfil do usuário
  const queues = allQueues.filter(q => {
    if (!role || role === 'admin')      return true
    if (role === 'financeiro')          return true          // vê tudo
    if (role === 'editor')              return q.profile === 'editor'
    // visualizador vê as filas de editor (somente leitura)
    return q.profile === 'editor'
  })

  if (queues.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-gray-700">Filas de Trabalho</h3>

      <div className="flex flex-col gap-2">
        {queues.map((q) => {
          const cfg  = priorityConfig[q.priority]
          const prof = profileConfig[q.profile]
          return (
            <Link key={q.href + q.title} href={q.href}>
              <div
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${cfg.card}`}
                title={q.hint}
              >
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
                  {/* Badge de perfil responsável */}
                  <span className={`inline-flex items-center gap-1 mt-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${prof.cls}`}>
                    {prof.icon}
                    {prof.label}
                  </span>
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
