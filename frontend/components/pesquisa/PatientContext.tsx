'use client'

import { useCorrelacoes } from '@/hooks/useCorrelacoes'
import { StatusCorrelacaoBadge, StatusTUSSBadge } from '@/components/shared/StatusBadge'
import { formatDate } from '@/lib/utils'
import type { Correlacao } from '@/lib/types'
import { Loader2, Users } from 'lucide-react'

interface PatientContextProps {
  /** Nr. Atendimento do registro atual — eixo principal de busca */
  nrAtendimento: string | null
  /** ChaveCorrelacao do registro atual — excluído da lista */
  currentChave: string
  /** Callback ao clicar em outro registro */
  onSelect: (item: Correlacao) => void
}

export function PatientContext({ nrAtendimento, currentChave, onSelect }: PatientContextProps) {
  const { data, loading } = useCorrelacoes(
    nrAtendimento
      ? { searchNrAtendimento: nrAtendimento, limit: 10 }
      : { limit: 0 }   // nada se não tiver nr. atendimento
  )

  // Exclui o registro atual da lista
  const outros = data.filter(r => r.ChaveCorrelacao !== currentChave)

  if (!nrAtendimento) {
    return (
      <p className="text-xs text-gray-400 italic">Nr. de Atendimento não disponível.</p>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Buscando registros do atendimento…
      </div>
    )
  }

  if (outros.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic">
        Nenhum outro registro para o Nr. Atendimento <span className="font-mono">{nrAtendimento}</span>.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-gray-500">
        <span className="font-mono font-semibold">{nrAtendimento}</span> — {outros.length} outro{outros.length > 1 ? 's' : ''} registro{outros.length > 1 ? 's' : ''} no lote:
      </p>
      <div className="flex flex-col gap-1">
        {outros.map(r => (
          <button
            key={r.ChaveCorrelacao}
            onClick={() => onSelect(r)}
            className="flex items-center gap-2 text-left px-3 py-2 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-colors text-xs"
          >
            <Users className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-medium text-gray-800 truncate block">
                {r.Procedimento_PRODUCAO || r.Procedimento_REPASSE || '—'}
              </span>
              <span className="text-gray-400">{formatDate(r.Data_PRODUCAO)}</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <StatusCorrelacaoBadge status={r.StatusCorrelacao} />
              <StatusTUSSBadge status={r.StatusTUSS} />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
