'use client'

import { useDashboardStats } from '@/hooks/useCorrelacoes'
import { useAuth } from '@/contexts/AuthContext'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { StatusChart } from '@/components/dashboard/StatusChart'
import { WorkQueues } from '@/components/dashboard/WorkQueues'
import { formatCurrency } from '@/lib/utils'
import {
  CheckCircle, XCircle, AlertTriangle, DollarSign, Activity,
  Clock, TrendingDown, HelpCircle, FileQuestion,
} from 'lucide-react'

export default function DashboardPage() {
  const { stats, loading } = useDashboardStats()
  const { permissions } = useAuth()
  const canFinancial = permissions?.canViewFinancial ?? false

  const pct = (n: number) =>
    stats.total ? `${((n / stats.total) * 100).toFixed(0)}% do total` : undefined

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">

      {/* ── Cabeçalho ──────────────────────────────────── */}
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
          Visão geral do lote de correlação de endoscopia
        </p>
      </div>

      {/* ── SEÇÃO 1: Visão Geral do Lote ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(160px,200px)_1fr] gap-4">

        {/* Total de Registros */}
        <KpiCard
          title="Total de Registros"
          value={loading ? '—' : stats.total.toLocaleString('pt-BR')}
          icon={Activity}
          color="blue"
          loading={loading}
        />

        {/* Tabela Correlacionada — 4 sub-cards */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3">
          <h3 className="text-xs sm:text-sm font-semibold text-gray-600">Tabela Correlacionada</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
            <KpiCard
              title="Registros Correlacionados na Produção e Repasse"
              value={loading ? '—' : stats.correlacionados.toLocaleString('pt-BR')}
              subtitle="Identificados e conferidos nos dois sistemas"
              pctLabel={pct(stats.correlacionados)}
              icon={CheckCircle}
              color="green"
              loading={loading}
            />
            <KpiCard
              title="Não Faturado no Repasse"
              value={loading ? '—' : stats.naoFaturados.toLocaleString('pt-BR')}
              subtitle="Sem correspondência no repasse"
              pctLabel={pct(stats.naoFaturados)}
              icon={XCircle}
              color="red"
              href={canFinancial ? '/faturamento?tab=nao_faturado' : undefined}
              loading={loading}
            />
            <KpiCard
              title="Pago sem Registro na Produção"
              value={loading ? '—' : stats.repasseNaoIdentificado.toLocaleString('pt-BR')}
              subtitle="Pago pelo Hospital — ausente na produção"
              pctLabel={pct(stats.repasseNaoIdentificado)}
              icon={FileQuestion}
              color="purple"
              href="/auditoria"
              loading={loading}
            />
            <KpiCard
              title="Cobrança Fora do Período"
              value={loading ? '—' : stats.repasseForaPeriodo.toLocaleString('pt-BR')}
              subtitle="Repasse fora do período analisado"
              icon={Clock}
              color="orange"
              loading={loading}
            />
          </div>
        </div>
      </div>

      {/* ── SEÇÃO 2: Verificação TUSS do Repasse ─────────────────────────── */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs sm:text-sm font-semibold text-gray-600">Verificação TUSS do Repasse</h3>
        <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 ${canFinancial ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
          <KpiCard
            title="Código TUSS Pago e Conferido"
            value={loading ? '—' : stats.tussOk.toLocaleString('pt-BR')}
            subtitle="Faturamento sem divergências — sem ação necessária"
            pctLabel={pct(stats.tussOk)}
            icon={CheckCircle}
            color="green"
            loading={loading}
          />
          <KpiCard
            title="Pagamentos a Menor em Proc. Correlacionados"
            value={loading ? '—' : stats.tussCobrarCorrelacionados.toLocaleString('pt-BR')}
            subtitle="Correlacionado com código TUSS inferior ou ausente"
            pctLabel={pct(stats.tussCobrarCorrelacionados)}
            icon={TrendingDown}
            color="orange"
            loading={loading}
          />
          <KpiCard
            title="Procedimentos Não Cobrados"
            value={loading ? '—' : stats.tussCobrarNaoFaturados.toLocaleString('pt-BR')}
            subtitle="Não faturados com código TUSS identificado"
            pctLabel={pct(stats.tussCobrarNaoFaturados)}
            icon={XCircle}
            color="red"
            href={canFinancial ? '/faturamento?tab=nao_faturado' : undefined}
            loading={loading}
          />
          <KpiCard
            title="Análise Manual Necessária"
            value={loading ? '—' : stats.tussManual.toLocaleString('pt-BR')}
            subtitle="Repasse sem produção ou mapeamento TUSS ausente"
            pctLabel={pct(stats.tussManual)}
            icon={HelpCircle}
            color="yellow"
            loading={loading}
          />
          {canFinancial && (
            <KpiCard
              title="Valor a Recuperar"
              value={loading ? '—' : formatCurrency(stats.valorRecuperar)}
              subtitle="Estimativa via tabela TUSS"
              icon={DollarSign}
              color="blue"
              href="/faturamento"
              loading={loading}
            />
          )}
        </div>
      </div>

      {/* ── SEÇÃO 3: Filas de Trabalho ────────────────────────────────────── */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-5 h-64 animate-pulse" />
      ) : (
        <WorkQueues stats={stats} showFinancial={canFinancial} />
      )}

      {/* ── SEÇÃO 4: Análises Gráficas ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {loading ? (
          <>
            <div className="bg-white rounded-xl border border-gray-200 p-5 h-72 sm:h-80 animate-pulse" />
            <div className="bg-white rounded-xl border border-gray-200 p-5 h-72 sm:h-80 animate-pulse" />
          </>
        ) : (
          <>
            <StatusChart data={stats.statusDistribution} showFinancial={canFinancial} />
            <StatusChart data={stats.tussStatusDistribution} mode="tuss" showFinancial={false} />
          </>
        )}
      </div>

      {/* ── Estado vazio ──────────────────────────────────────────────────── */}
      {!loading && stats.total === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 sm:p-6 text-center">
          <AlertTriangle className="w-7 h-7 sm:w-8 sm:h-8 text-yellow-500 mx-auto mb-2" />
          <p className="font-medium text-yellow-800 text-sm sm:text-base">Nenhum dado encontrado</p>
          <p className="text-xs sm:text-sm text-yellow-600 mt-1">
            A tabela{' '}
            <code className="bg-yellow-100 px-1 rounded">correlacao_endoscopia</code>{' '}
            está vazia ou o acesso está bloqueado por RLS.
            Execute a migration SQL para carregar os dados.
          </p>
        </div>
      )}
    </div>
  )
}
