'use client'

import { useState } from 'react'
import type { Correlacao, DecisaoHumana } from '@/lib/types'
import { formatDate, formatCurrency, getMetodoMatchLabel } from '@/lib/utils'
import { StatusCorrelacaoBadge, StatusTUSSBadge } from '@/components/shared/StatusBadge'
import { SimilarityScore } from '@/components/shared/SimilarityScore'
import { AuditChecklist } from './AuditChecklist'
import { DecisionButtons } from './DecisionButtons'
import { AlertTriangle, ChevronLeft, ChevronRight, User, Calendar, FileText, CreditCard } from 'lucide-react'

interface SplitViewProps {
  items: Correlacao[]
  currentIndex: number
  onNavigate: (index: number) => void
  onDecision: (chave: string, decision: DecisaoHumana) => void
}

function FieldRow({
  label,
  left,
  right,
  diverge,
  icon: Icon,
}: {
  label: string
  left: string | null
  right: string | null
  diverge?: boolean
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className={`grid grid-cols-2 gap-1 py-2.5 border-b border-gray-100 ${diverge ? 'bg-red-50 -mx-4 px-4 rounded' : ''}`}>
      <div>
        <p className="text-xs text-gray-400 flex items-center gap-1">
          {Icon && <Icon className="w-3 h-3" />}
          {label}
        </p>
        <p className={`text-sm font-medium mt-0.5 ${diverge ? 'text-red-700 font-bold' : 'text-gray-900'}`}>
          {left || '—'}
        </p>
      </div>
      <div>
        <p className="text-xs text-gray-400">
          {label} (Repasse)
        </p>
        <p className={`text-sm font-medium mt-0.5 ${diverge ? 'text-red-700 font-bold' : 'text-gray-900'}`}>
          {right || '—'}
        </p>
      </div>
    </div>
  )
}

export function SplitView({ items, currentIndex, onNavigate, onDecision }: SplitViewProps) {
  const item = items[currentIndex]
  if (!item) return null

  // ── Irmãos do mesmo atendimento (mesmo NrAtendimento_PRODUCAO) ──────────────
  const nrAtend = item.NrAtendimento_PRODUCAO
  const encounterSiblings = nrAtend
    ? items.reduce<Array<{ index: number; item: Correlacao }>>((acc, r, i) => {
        if (r.NrAtendimento_PRODUCAO === nrAtend) acc.push({ index: i, item: r })
        return acc
      }, [])
    : []
  const hasEncounter = encounterSiblings.length > 1

  const isDivergente = (item.MetodoMatch as string)?.includes('PROCEDIMENTO_DIVERGENTE')
  const isFuzzy = item.MetodoMatch === '3_FALLBACK_NOME_PARCIAL_FUZZY_DATA_FIXA'
  const isNrAtendimento = item.MetodoMatch === '2_FALLBACK_NR-ATENDIMENTO_DATA_PROCEDIMENTO'

  const procedureDiverge = !!isDivergente
  const nameDiverge = isFuzzy || isNrAtendimento

  const checklistItems = [
    { id: 'nome', label: 'O nome do paciente se refere à mesma pessoa?', autoCheck: !nameDiverge },
    { id: 'data', label: 'A data é compatível com o mesmo episódio?', autoCheck: item.Data_PRODUCAO === item.Data_REPASSE },
    { id: 'proc', label: 'O procedimento é coerente clinicamente?', autoCheck: !procedureDiverge },
    { id: 'conv', label: 'O convênio coincide entre os dois arquivos?', autoCheck: item.Convenio_PRODUCAO === item.Convenio_REPASSE },
    { id: 'valor', label: 'O valor liberado é compatível com o procedimento?', autoCheck: false },
  ]

  const [localDecision, setLocalDecision] = useState<DecisaoHumana>(item.decisao_humana)

  const handleDecision = (decision: DecisaoHumana) => {
    setLocalDecision(decision)
    onDecision(item.ChaveCorrelacao, decision)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-3">
          {isDivergente && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" />
              Procedimento Divergente
            </div>
          )}
          {isFuzzy && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" />
              Nome Aproximado (Fuzzy)
            </div>
          )}
          {isNrAtendimento && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" />
              Match por Nr. Atendimento
            </div>
          )}
          <StatusCorrelacaoBadge status={item.StatusCorrelacao} />
          <StatusTUSSBadge status={item.StatusTUSS} />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {currentIndex + 1} de {items.length}
          </span>
          <button
            onClick={() => onNavigate(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => onNavigate(currentIndex + 1)}
            disabled={currentIndex === items.length - 1}
            className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Faixa de navegação do atendimento (múltiplos procedimentos) ───── */}
      {hasEncounter && (
        <div className="px-5 py-2 border-b border-blue-100 bg-blue-50/40 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max">
            <span className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider flex-shrink-0 whitespace-nowrap">
              Atend. {nrAtend} · {encounterSiblings.length} proc.
            </span>
            <div className="flex items-center gap-1">
              {encounterSiblings.map(({ index: sibIdx, item: sib }) => {
                const isCurrent = sibIdx === currentIndex
                const tussGroup = sib.StatusTUSS?.startsWith('OK_') ? 'ok'
                  : sib.StatusTUSS?.startsWith('COBRAR_') ? 'cobrar'
                  : sib.StatusTUSS?.startsWith('CORRELACIONAR_MANUAL_') ? 'manual'
                  : null
                return (
                  <button
                    key={sib.ChaveCorrelacao}
                    onClick={() => !isCurrent && onNavigate(sibIdx)}
                    disabled={isCurrent}
                    title={sib.Procedimento_PRODUCAO || sib.Procedimento_REPASSE || undefined}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all flex-shrink-0 ${
                      isCurrent
                        ? 'bg-blue-600 text-white shadow-sm cursor-default'
                        : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-700 cursor-pointer'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      isCurrent         ? 'bg-white/70'   :
                      tussGroup === 'ok'     ? 'bg-green-500'  :
                      tussGroup === 'cobrar' ? 'bg-red-500'    :
                      tussGroup === 'manual' ? 'bg-yellow-500' :
                      'bg-gray-400'
                    }`} />
                    <span className="max-w-[110px] truncate">
                      {sib.Procedimento_PRODUCAO || sib.Procedimento_REPASSE || '—'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 divide-x divide-gray-200">
        {/* Left: Comparison */}
        <div className="col-span-2 p-5">
          <div className="grid grid-cols-2 gap-1 mb-3">
            <div className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded text-center">PRODUÇÃO (Clínica)</div>
            <div className="text-xs font-bold text-green-700 bg-green-50 px-3 py-1.5 rounded text-center">REPASSE (Hospital)</div>
          </div>

          <FieldRow
            label="Paciente"
            left={item.Paciente_PRODUCAO}
            right={item.Paciente_REPASSE}
            diverge={nameDiverge}
            icon={User}
          />
          <FieldRow
            label="Data"
            left={formatDate(item.Data_PRODUCAO)}
            right={formatDate(item.Data_REPASSE)}
            diverge={item.Data_PRODUCAO !== item.Data_REPASSE}
            icon={Calendar}
          />
          <FieldRow
            label="Procedimento"
            left={item.Procedimento_PRODUCAO}
            right={item.Procedimento_REPASSE}
            diverge={procedureDiverge}
            icon={FileText}
          />
          <FieldRow
            label="Convênio"
            left={item.Convenio_PRODUCAO}
            right={item.Convenio_REPASSE}
            diverge={item.Convenio_PRODUCAO !== item.Convenio_REPASSE}
          />
          <FieldRow
            label="Nr. Atendimento"
            left={item.NrAtendimento_PRODUCAO ?? '—'}
            right={item.NrAtendimento_REPASSE ?? '—'}
            icon={CreditCard}
          />

          <div className="grid grid-cols-2 gap-1 py-2.5 mt-1">
            <div>
              <p className="text-xs text-gray-400">Adicional (Produção)</p>
              <p className="text-sm text-gray-700">{item.ProcedimentosAdicionais_PRODUCAO || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Código TUSS (Repasse)</p>
              <p className="text-sm font-mono text-gray-900">{item.CodigoTUSS_REPASSE || '—'}</p>
              <p className="text-xs text-gray-500">{formatCurrency(item.ValorLiberado_REPASSE)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Método:</span>
              <span className="text-xs font-medium text-gray-700">{getMetodoMatchLabel(item.MetodoMatch)}</span>
            </div>
            <SimilarityScore score={item.SimilaridadeProcedimento} label="Proc." />
            {item.ValorEstimado_TUSS && (
              <div className="ml-auto text-right">
                <p className="text-xs text-gray-500">Estimativa TUSS</p>
                <p className="text-sm font-bold text-blue-700">{formatCurrency(item.ValorEstimado_TUSS)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Checklist + Decision */}
        <div className="p-5 bg-gray-50 flex flex-col gap-5">
          <AuditChecklist items={checklistItems} />

          <div className="border-t border-gray-200 pt-4">
            <DecisionButtons
              id={item.id}
              chaveCorrelacao={item.ChaveCorrelacao}
              currentDecision={localDecision}
              onDecision={handleDecision}
            />
          </div>

          {item.CodigosTUSS_Esperados && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs">
              <p className="font-semibold text-blue-800 mb-1">Código TUSS Esperado</p>
              <p className="font-mono text-blue-700">{item.CodigosTUSS_Esperados}</p>
              {item.DescricaoTUSS && <p className="text-blue-600 mt-0.5">{item.DescricaoTUSS}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
