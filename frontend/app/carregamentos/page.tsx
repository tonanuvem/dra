'use client'

import { Suspense, useState } from 'react'
import { useCarregamentos } from '@/hooks/useCarregamentos'
import { useAuth } from '@/contexts/AuthContext'
import { getStatusCorrelacaoLabel } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { TABLES } from '@/lib/config'
import {
  Layers, CalendarDays, CheckCircle2, Unlink,
  Clock, AlertTriangle, Loader2, Copy, Ban,
  TrendingUp, BadgeCheck, RefreshCw, X, ChevronDown,
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

// ── Modal de Invalidação ───────────────────────────────────────
function InvalidarModal({
  lote,
  isOpen,
  onClose,
  onConfirm,
}: {
  lote: string
  isOpen: boolean
  onClose: () => void
  onConfirm: (motivo: string) => Promise<void>
}) {
  const [motivo, setMotivo]     = useState('')
  const [loading, setLoading]   = useState(false)
  const [erro, setErro]         = useState<string | null>(null)

  async function handleConfirm() {
    if (!motivo.trim()) { setErro('Informe o motivo da invalidação.'); return }
    setLoading(true)
    setErro(null)
    try {
      await onConfirm(motivo.trim())
      setMotivo('')
      onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao invalidar carga.')
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    if (loading) return
    setMotivo('')
    setErro(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
              <Ban className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Invalidar Carga</p>
              <p className="text-xs text-gray-500 font-mono">{lote}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            Os registros desta carga serão <strong>desativados</strong> e
            deixarão de aparecer na auditoria e no dashboard.
            Os dados <strong>não serão apagados</strong> e ficam preservados
            para fins de auditoria.
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Motivo da invalidação <span className="text-red-500">*</span>
            </label>
            <textarea
              value={motivo}
              onChange={e => { setMotivo(e.target.value); setErro(null) }}
              disabled={loading}
              rows={3}
              placeholder="Descreva o problema encontrado na carga (ex: arquivo duplicado, período incorreto, regras divergentes…)"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 resize-none disabled:opacity-50"
            />
            {erro && (
              <p className="text-xs text-red-600 mt-1">{erro}</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !motivo.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Invalidar Carga
          </button>
        </div>
      </div>
    </div>
  )
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

// ── Mini gráfico de status ─────────────────────────────────────
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
function LoteCard({ lote, canInvalidar, onInvalidar }: {
  lote: ReturnType<typeof useCarregamentos>['lotes'][number]
  canInvalidar: boolean
  onInvalidar: (lote: string) => void
}) {
  const isInvalidado = lote.status === 'invalidado'
  const [showHistorico, setShowHistorico] = useState(false)

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${
      isInvalidado
        ? 'border-red-200 opacity-75'
        : lote.isAtual
          ? 'border-blue-300 shadow-sm'
          : 'border-gray-200'
    }`}>
      {/* Header do card */}
      <div className={`px-5 py-3 flex items-center justify-between ${
        isInvalidado
          ? 'bg-red-50 border-b border-red-200'
          : lote.isAtual
            ? 'bg-blue-50 border-b border-blue-200'
            : 'bg-gray-50 border-b border-gray-200'
      }`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <Layers className={`w-4 h-4 flex-shrink-0 ${
            isInvalidado ? 'text-red-400' : lote.isAtual ? 'text-blue-600' : 'text-gray-400'
          }`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900 font-mono">
                {lote.lote_processamento}
              </span>
              {lote.isAtual && !isInvalidado && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-600 text-white flex-shrink-0">
                  ATUAL
                </span>
              )}
              {isInvalidado && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-600 text-white flex-shrink-0">
                  INVALIDADO
                </span>
              )}
              {lote.supersedidos > 0 && !isInvalidado && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 flex-shrink-0">
                  {lote.supersedidos} supersedidos
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
              <CalendarDays className="w-3 h-3" />
              <span>Carregado em {fmtCarregadoEm(lote.carregado_em)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Detalhes de invalidação */}
          {isInvalidado && lote.motivoInvalidade && (
            <button
              onClick={() => setShowHistorico(v => !v)}
              className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${showHistorico ? 'rotate-180' : ''}`} />
              Ver motivo
            </button>
          )}

          {/* Botão invalidar — apenas para lotes ativos e não-admin */}
          {canInvalidar && !isInvalidado && (
            <button
              onClick={() => onInvalidar(lote.lote_processamento)}
              title="Invalidar carga (apenas admin)"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 border border-gray-200 hover:border-red-200 transition-colors"
            >
              <Ban className="w-3.5 h-3.5" />
              Invalidar
            </button>
          )}
        </div>
      </div>

      {/* Faixa de motivo de invalidação */}
      {isInvalidado && showHistorico && lote.motivoInvalidade && (
        <div className="px-5 py-2.5 bg-red-50 border-b border-red-100 text-xs text-red-700">
          <span className="font-semibold">Motivo: </span>
          {lote.motivoInvalidade}
          {lote.invalidadoEm && (
            <span className="text-red-500 ml-2">
              — {fmtCarregadoEm(lote.invalidadoEm)}
            </span>
          )}
        </div>
      )}

      {/* Corpo do card */}
      <div className={`p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 ${
        isInvalidado ? 'opacity-60' : ''
      }`}>

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
            {lote.supersedidos > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 text-slate-400" />
                  Supersedidos
                </span>
                <span className="text-sm font-semibold text-slate-500 tabular-nums">
                  {lote.supersedidos.toLocaleString('pt-BR')}
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
          {isInvalidado ? (
            <p className="text-xs text-gray-400 italic">Carga invalidada — dados fora da auditoria</p>
          ) : (
            <>
              <RevisaoBar revisados={lote.revisados} total={lote.validos - lote.supersedidos} />
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
            </>
          )}
        </div>

        {/* Coluna 4: Status + Financeiro */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Distribuição de Status
          </p>
          {isInvalidado ? (
            <p className="text-xs text-gray-400 italic">—</p>
          ) : (
            <>
              <StatusMiniBar dist={lote.distribuicaoStatus} total={lote.validos - lote.supersedidos} />
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────
function CarregamentosContent() {
  const { lotes, loading, error, refetch } = useCarregamentos()
  const { permissions, user }              = useAuth()

  const [modalLote, setModalLote] = useState<string | null>(null)

  // ── Invalidação de carga ───────────────────────────────────
  async function handleInvalidar(loteId: string, motivo: string) {
    if (!user?.id) throw new Error('Usuário não autenticado.')

    // 1. Conta registros ativos que serão afetados
    const { count: totalAfetados } = await supabase
      .from(TABLES.correlacao)
      .select('id', { count: 'exact', head: true })
      .eq('lote_processamento', loteId)
      .eq('ativo', true)

    // 2. Registra a operação (livro imutável de auditoria)
    const { data: op, error: opErr } = await supabase
      .from('operacoes_rollback')
      .insert({
        tipo:           'invalidacao',
        lote_id:        loteId,
        executado_por:  user.id,
        motivo,
        total_afetados: totalAfetados ?? 0,
      })
      .select('id')
      .single()
    if (opErr) throw opErr

    // 3. Desativa todos os registros ativos do lote
    const { error: updErr } = await supabase
      .from(TABLES.correlacao)
      .update({
        ativo:              false,
        desativado_em:      new Date().toISOString(),
        desativado_por:     user.id,
        motivo_desativacao: motivo,
        rollback_operacao_id: op.id,
      })
      .eq('lote_processamento', loteId)
      .eq('ativo', true)
    if (updErr) throw updErr

    // 4. Atualiza status do lote no registro central
    const { error: lcErr } = await supabase
      .from('lotes_carga')
      .update({
        status:               'invalidado',
        invalidado_em:        new Date().toISOString(),
        invalidado_por:       user.id,
        motivo_invalidade:    motivo,
        rollback_operacao_id: op.id,
      })
      .eq('lote_id', loteId)
    if (lcErr) throw lcErr

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

  // Totais agregados (apenas lotes ativos)
  const lotesAtivos     = lotes.filter(l => l.status === 'ativo')
  const totalRegistros  = lotesAtivos.reduce((s, l) => s + l.validos, 0)
  const totalRevisados  = lotesAtivos.reduce((s, l) => s + l.revisados, 0)
  const totalPendentes  = lotesAtivos.reduce((s, l) => s + l.pendentes, 0)
  const invalidados     = lotes.filter(l => l.status === 'invalidado').length

  return (
    <>
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Carregamentos</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {lotesAtivos.length} {lotesAtivos.length === 1 ? 'lote ativo' : 'lotes ativos'}{' '}
              {invalidados > 0 && (
                <span className="text-red-500">· {invalidados} invalidado{invalidados > 1 ? 's' : ''}</span>
              )}
              {' '}· {totalRegistros.toLocaleString('pt-BR')} registros únicos ativos
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
              canInvalidar={permissions?.canManageUsers ?? false}
              onInvalidar={loteId => setModalLote(loteId)}
            />
          ))}
        </div>
      </div>

      {/* Modal de invalidação */}
      {modalLote && (
        <InvalidarModal
          lote={modalLote}
          isOpen={true}
          onClose={() => setModalLote(null)}
          onConfirm={motivo => handleInvalidar(modalLote, motivo)}
        />
      )}
    </>
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
