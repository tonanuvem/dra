'use client'

import { useDashboardStats } from '@/hooks/useCorrelacoes'
import { useAuth } from '@/contexts/AuthContext'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { StatusChart } from '@/components/dashboard/StatusChart'
import { WorkQueues } from '@/components/dashboard/WorkQueues'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { formatCurrency } from '@/lib/utils'
import { CheckCircle, XCircle, AlertTriangle, DollarSign, Activity } from 'lucide-react'

export default function DashboardPage() {
  const { stats, loading } = useDashboardStats()
  const { permissions } = useAuth()
  const canFinancial = permissions?.canViewFinancial ?? false

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">

      {/* ── Cabeçalho ──────────────────────────────────── */}
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
          Visão geral do lote de correlação de endoscopia
        </p>
      </div>

      {/* ── KPI Cards ──────────────────────────────────── */}
      {/* Mobile: 2 colunas · Tablet (sm): 3 · Desktop (xl): 6 sem financeiro / xl:5 sem ele */}
      <div className={`grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 ${canFinancial ? 'xl:grid-cols-6' : 'xl:grid-cols-5'}`}>
        <KpiCard
          title="Total de Registros"
          value={loading ? '—' : stats.total.toLocaleString('pt-BR')}
          icon={Activity}
          color="blue"
          loading={loading}
        />
        <KpiCard
          title="Correlacionados"
          value={loading ? '—' : stats.correlacionados.toLocaleString('pt-BR')}
          subtitle="Pagos e conferidos com o repasse"
          pctLabel={stats.total ? `${((stats.correlacionados / stats.total) * 100).toFixed(0)}% do total` : undefined}
          icon={CheckCircle}
          color="green"
          loading={loading}
        />
        <KpiCard
          title="Não Repassados"
          value={loading ? '—' : stats.naoFaturados.toLocaleString('pt-BR')}
          subtitle="Sem correspondência no repasse"
          pctLabel={stats.total ? `${((stats.naoFaturados / stats.total) * 100).toFixed(0)}% do total` : undefined}
          icon={XCircle}
          color="red"
          href={canFinancial ? '/faturamento?tab=nao_faturado' : undefined}
          loading={loading}
        />
        <KpiCard
          title="Pendentes Revisão"
          value={loading ? '—' : stats.pendentesRevisao.toLocaleString('pt-BR')}
          subtitle="Match incerto — ação requerida"
          pctLabel={stats.total ? `${((stats.pendentesRevisao / stats.total) * 100).toFixed(0)}% do total` : undefined}
          icon={AlertTriangle}
          color="purple"
          href="/auditoria"
          loading={loading}
        />
        {/* Card financeiro — visível apenas para financeiro/admin */}
        <PermissionGate require="canViewFinancial">
          <KpiCard
            title="Valor a Recuperar"
            value={loading ? '—' : formatCurrency(stats.valorRecuperar)}
            subtitle="Estimativa via tabela TUSS"
            icon={DollarSign}
            color="blue"
            href="/faturamento"
            loading={loading}
          />
        </PermissionGate>
      </div>

      {/* ── Gráfico + Filas ─────────────────────────────── */}
      {/* Mobile: empilhados · Desktop (lg): lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {loading ? (
          <>
            <div className="bg-white rounded-xl border border-gray-200 p-5 h-72 sm:h-80 animate-pulse" />
            <div className="bg-white rounded-xl border border-gray-200 p-5 h-72 sm:h-80 animate-pulse" />
          </>
        ) : (
          <>
            <StatusChart data={stats.statusDistribution} showFinancial={canFinancial} />
            <WorkQueues stats={stats} showFinancial={canFinancial} />
          </>
        )}
      </div>

      {/* ── Estado vazio ─────────────────────────────────── */}
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
