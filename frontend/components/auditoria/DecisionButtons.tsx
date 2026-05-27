'use client'

import { useState } from 'react'
import { CheckCircle, Unlink, Loader2, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { TABLES } from '@/lib/config'
import { useAuth } from '@/contexts/AuthContext'
import type { DecisaoHumana } from '@/lib/types'

interface DecisionButtonsProps {
  chaveCorrelacao: string
  currentDecision: DecisaoHumana
  onDecision: (decision: DecisaoHumana) => void
}

export function DecisionButtons({ chaveCorrelacao, currentDecision, onDecision }: DecisionButtonsProps) {
  const [loading, setLoading] = useState(false)
  const { permissions } = useAuth()

  // Visualizador: mostra estado atual (read-only) mas não pode alterar
  if (!permissions?.canEdit) {
    return currentDecision ? (
      <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
        currentDecision === 'confirmado'
          ? 'bg-green-50 text-green-700 border border-green-200'
          : 'bg-gray-100 text-gray-600 border border-gray-200'
      }`}>
        <CheckCircle className="w-4 h-4" />
        {currentDecision === 'confirmado' ? 'Correlação confirmada' : 'Registro desvinculado'}
      </div>
    ) : (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-gray-400 bg-gray-50 border border-gray-200">
        <Lock className="w-3.5 h-3.5" />
        Sem permissão para editar
      </div>
    )
  }

  const decide = async (decision: 'confirmado' | 'desvinculado') => {
    setLoading(true)
    try {
      const newStatus = decision === 'desvinculado' ? 'NAO_FATURADO_NO_REPASSE' : undefined
      const update = {
        decisao_humana: decision,
        revisado_em: new Date().toISOString(),
        ...(newStatus ? { StatusCorrelacao: newStatus } : {}),
      }

      await supabase
        .from(TABLES.correlacao)
        .update(update as object)
        .eq('ChaveCorrelacao', chaveCorrelacao)

      onDecision(decision)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (currentDecision) {
    return (
      <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
        currentDecision === 'confirmado' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-600 border border-gray-200'
      }`}>
        <CheckCircle className="w-4 h-4" />
        {currentDecision === 'confirmado' ? 'Correlação confirmada' : 'Registro desvinculado'}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      <button
        onClick={() => decide('confirmado')}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
      >
        <CheckCircle className="w-4 h-4" />
        Confirmar Correlação
      </button>
      <button
        onClick={() => decide('desvinculado')}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white hover:bg-red-50 text-red-600 border border-red-200 text-sm font-medium transition-colors disabled:opacity-50"
      >
        <Unlink className="w-4 h-4" />
        Desvincular Registros
      </button>
    </div>
  )
}
