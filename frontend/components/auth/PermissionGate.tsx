'use client'

import { useAuth } from '@/contexts/AuthContext'
import type { Permissions } from '@/lib/permissions'

interface PermissionGateProps {
  /** Permissão necessária para exibir o conteúdo */
  require: keyof Permissions
  /** O que mostrar quando não tem permissão (padrão: nada) */
  fallback?: React.ReactNode
  children: React.ReactNode
}

/**
 * Oculta conteúdo baseado na permissão do usuário logado.
 *
 * @example
 * <PermissionGate require="canViewFinancial">
 *   <KpiCard title="Valor a Recuperar" ... />
 * </PermissionGate>
 *
 * <PermissionGate require="canEdit" fallback={<span>Somente leitura</span>}>
 *   <button>Salvar</button>
 * </PermissionGate>
 */
export function PermissionGate({ require, fallback = null, children }: PermissionGateProps) {
  const { permissions, loading } = useAuth()

  // Durante carregamento não pisca conteúdo indevido
  if (loading) return null

  if (!permissions || !permissions[require]) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
