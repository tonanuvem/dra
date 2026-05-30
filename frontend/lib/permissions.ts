// ── Roles e permissões do sistema ─────────────────────────────
// Fonte única de verdade para frontend e AuthContext.
// O backend (app.py) replica a mesma lógica em Python.

export type Role = 'visualizador' | 'editor' | 'financeiro' | 'admin'

export interface Permissions {
  /** Pode editar registros (decisão humana, notas de revisão) */
  canEdit: boolean
  /** Vê valores financeiros (R$, Valor a Recuperar, aba Faturamento) */
  canViewFinancial: boolean
  /** Pode criar, editar e desativar usuários */
  canManageUsers: boolean
}

export const ROLE_PERMISSIONS: Record<Role, Permissions> = {
  visualizador: { canEdit: false, canViewFinancial: false, canManageUsers: false },
  editor:       { canEdit: true,  canViewFinancial: false, canManageUsers: false },
  financeiro:   { canEdit: true,  canViewFinancial: true,  canManageUsers: false },
  admin:        { canEdit: true,  canViewFinancial: true,  canManageUsers: true  },
}

export const ROLE_LABELS: Record<Role, string> = {
  visualizador: 'Visualizador',
  editor:       'Editor',
  financeiro:   'Financeiro',
  admin:        'Admin',
}

export const ROLE_COLORS: Record<Role, string> = {
  visualizador: 'bg-gray-100 text-gray-600 border-gray-200',
  editor:       'bg-yellow-100 text-yellow-800 border-yellow-200',
  financeiro:   'bg-blue-100 text-blue-800 border-blue-200',
  admin:        'bg-red-100 text-red-800 border-red-200',
}

/** Rotas que exigem cada permissão (para guard de navegação) */
export const PROTECTED_ROUTES: Record<keyof Permissions, string[]> = {
  canEdit:          ['/mapeamentos-tuss'], // redireciona para /dashboard se visualizador
  canViewFinancial: ['/faturamento'],      // redireciona para /dashboard se não tem acesso
  canManageUsers:   ['/configuracoes'],   // redireciona para /dashboard se não é admin
}
