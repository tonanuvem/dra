'use client'

import { Suspense, useState } from 'react'
import { useCarregamentos } from '@/hooks/useCarregamentos'
import { useAuth } from '@/contexts/AuthContext'
import { getStatusCorrelacaoLabel } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { TABLES } from '@/lib/config'
import {
  Layers, CalendarDays, CheckCircle2, Unlink,
  Clock, AlertTriangle, Loader2, Copy, Trash2,
  TrendingUp, BadgeCheck,
} from 'lucide-react'

// ── Helpers ────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtCarregadoEm(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

const STATUS_COLORS: Record<string, string> = {
  CORRELACIONADO:                        'bg-green-500',
  NAO_FATURADO_NO_REPASSE:               'bg-red-500',
  REPASSE_NAO_IDENTIFICADO_NA_PRODUCAO:  'bg-purple-500',
  REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO: 'bg-slate-400',
}

// ── Barra de progresso de revisão ──────────────────────────────
function RevisaoBar({ revisados, total }: { revisados: number; total: number }) {
  const pct = total > 0 ? Math.round((revisados / total) * 100) : 0
  const color = pct >= 80 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-blue-500'
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{revisados.toLocaleString('pt-BR')} revisados</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-400 mt-0.5">
        {(total - revisados).toLocaleString('pt-BR')} pendentes de revisão
      </p>
    </div>
  )
}

// ── Mini gráfico de status (barras horizontais) ────────────────
function StatusMiniBar({ dist, total }: { dist: Record<string, number>; total: number }) {
  if (total === 0) return null
  const entries = Object.entries(dist).sort((a, b) => b[1] - a[1])
  return (
    <div className="space-y-1.5">
      {entries.map(([status, count]) => {
        const pct = Math.round((count / total) * 100)
        const color = STATUS_COLORS[status] ?? 'bg-slate-300'
        const label = getStatusCorrelacaoLabel(status as never) ?? status
        return (
          <div key={status} className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
            <span className="text-gray-600 truncate flex-1 min-w-0">{label}</span>
            <span className="text-gray-500 tabular-nums flex-shrink-0">
              {count.toLocaleString('pt-BR')}
              <span className="text-gray-400 ml-1">({pct}%)</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Card de lote ───────────────────────────────────────────────
function LoteCard({ lote, canDelete, onDelete }: {
  lote: ReturnType<typeof useCarregamentos>['lotes'][number]
  canDelete: boolean
  onDelete: (lote: string) => Promise<void>
}) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!window.confirm(`Deletar lote "${lote.lote_processamento}"?\nEssa ação é irreversível.`)) return
    setDeleting(true)
    try {
      await onDelete(lote.lote_processamento)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${
      lote.isAtual ? 'border-blue-300 shadow-sm' : 'border-gray-200'
    }`}>
      {/* Header do card */}
      <div className={`px-5 py-3 flex items-center justify-between ${
        lote.isAtual ? 'bg-blue-50 border-b border-blue-200' : 'bg-gray-50 border-b border-gray-200'
      }`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <Layers className={`w-4 h-4 flex-shrink-0 ${lote.isAtual ? 'text-blue-600' : 'text-gray-400'}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900 font-mono">
                {lote.lote_processamento}
              </span>
              {lote.isAtual && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-600 text-white flex-shrink-0">
                  ATUAL
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
              <CalendarDays className="w-3 h-3" />
              <span>Carregado em {fmtCarregadoEm(lote.carregado_em)}</span>
            </div>
          </div>
        </div>

        {canDelete && !lote.isAtual && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Deletar lote (apenas admin)"
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 disabled:opacity-40"
          >
            {deleting
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Trash2 className="w-4 h-4" />
            }
          </button>
        )}
      </div>

      {/* Corpo do card */}
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">

        {/* Coluna 1: Contagens */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Registros</p>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600">Total inserido</span>
              <span className="text-sm font-bold text-gray-900 tabular-nums">
                {lote.total.toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600">Únicos (válidos)</span>
              <span className="text-sm font-semibold text-green-700 tabular-nums">
                {lote.validos.toLocaleString('pt-BR')}
              </span>
            </div>
            {lote.duplicatas > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600 flex items-center gap-1">
                  <Copy className="w-3 h-3 text-orange-400" />
                  Duplicatas
                </span>
                <span className="text-sm font-semibold text-orange-600 tabular-nums">
                  {lote.duplicatas.toLocaleString('pt-BR')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Coluna 2: Períodos */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Períodos</p>
          {lote.periodos.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {lote.periodos.map(p => (
                <span
                  key={p}
                  className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-medium"
                >
                  {p}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">Sem informação de período</p>
          )}
        </div>

        {/* Coluna 3: Revisão */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Revisão Humana</p>
          <RevisaoBar revisados={lote.revisados} total={lote.validos} />
          <div className="flex gap-3 pt-1">
            <div className="flex items-center gap-1 text-xs text-green-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{lote.confirmados.toLocaleString('pt-BR')} confirmados</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Unlink className="w-3.5 h-3.5" />
              <span>{lote.desvinculados.toLocaleString('pt-BR')} desvinculados</span>
            </div>
          </div>
        </div>

        {/* Coluna 4: Status + Financeiro */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Distribuição de Status
          </p>
          <StatusMiniBar dist={lote.distribuicaoStatus} total={lote.validos} />
          {(lote.valorPago > 0 || lote.valorEstimado > 0) && (
            <div className="pt-2 border-t border-gray-100 space-y-1">
              {lote.valorPago > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 flex items-center gap-1">
                    <BadgeCheck className="w-3 h-3 text-green-500" />
                    Pago (repasse)
                  </span>
                  <span className="font-semibold text-green-700 tabular-nums">
                    {fmtBRL(lote.valorPago)}
                  </span>
                </div>
              )}
              {lote.valorEstimado > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-blue-500" />
                    Estimado (TUSS)
                  </span>
                  <span className="font-semibold text-blue-700 tabular-nums">
                    {fmtBRL(lote.valorEstimado)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────
function CarregamentosContent() {
  const { lotes, loading, error, refetch } = useCarregamentos()
  const { permissions } = useAuth()

  async function handleDeleteLote(loteProcessamento: string) {
    await supabase
      .from(TABLES.correlacao)
      .delete()
      .eq('lote_processamento', loteProcessamento)
    await refetch()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700">
        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold">Erro ao carregar histórico de lotes</p>
          <p className="text-xs mt-0.5 text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  if (lotes.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <Layers className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium text-gray-500">Nenhum carregamento encontrado</p>
        <p className="text-sm mt-1">
          Use o botão <strong>"Recarregar Dados no Supabase"</strong> no app Python para
          carregar o primeiro lote.
        </p>
      </div>
    )
  }

  // Totais agregados
  const totalRegistros = lotes.reduce((s, l) => s + l.validos, 0)
  const totalRevisados = lotes.reduce((s, l) => s + l.revisados, 0)
  const totalPendentes = lotes.reduce((s, l) => s + l.pendentes, 0)

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Carregamentos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {lotes.length} {lotes.length === 1 ? 'lote' : 'lotes'} ·{' '}
            {totalRegistros.toLocaleString('pt-BR')} registros únicos
          </p>
        </div>

        {/* Resumo rápido */}
        <div className="hidden sm:flex items-center gap-4">
          <div className="text-right">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Revisados</p>
            <p className="text-sm font-bold text-green-700">
              {totalRevisados.toLocaleString('pt-BR')}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide flex items-center gap-1 justify-end">
              <Clock className="w-3 h-3" />
              Pendentes
            </p>
            <p className="text-sm font-bold text-orange-600">
              {totalPendentes.toLocaleString('pt-BR')}
            </p>
          </div>
        </div>
      </div>

      {/* Cards de lotes */}
      <div className="space-y-4">
        {lotes.map(lote => (
          <LoteCard
            key={lote.lote_processamento}
            lote={lote}
            canDelete={permissions?.canManageUsers ?? false}
            onDelete={handleDeleteLote}
          />
        ))}
      </div>
    </div>
  )
}

export default function CarregamentosPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      }
    >
      <CarregamentosContent />
    </Suspense>
  )
}
