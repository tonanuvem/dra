'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ClipboardCheck, FileText,
  Settings, Stethoscope, Menu, X, LogOut, ChevronDown,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/permissions'

// ── Itens de navegação com permissão necessária ───────────────
const navItems = [
  { href: '/dashboard',     label: 'Dashboard',     icon: LayoutDashboard, permission: null               },
  { href: '/auditoria',     label: 'Auditoria',     icon: ClipboardCheck,  permission: null               },
  { href: '/faturamento',   label: 'Faturamento',   icon: FileText,        permission: 'canViewFinancial' },
  { href: '/configuracoes', label: 'Configurações', icon: Settings,        permission: 'canManageUsers'   },
] as const

export function Sidebar() {
  const pathname    = usePathname()
  const { profile, role, permissions, signOut } = useAuth()
  const [mobileOpen,   setMobileOpen]   = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  // Fecha sidebar ao mudar de rota no mobile
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Impede scroll do body quando sidebar mobile está aberta
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  // Filtra itens de nav baseado nas permissões do usuário
  const visibleItems = navItems.filter(item => {
    if (!item.permission) return true
    return permissions?.[item.permission as keyof typeof permissions] ?? false
  })

  const displayName  = profile?.nome || profile?.email || '—'
  const roleLabel    = role ? ROLE_LABELS[role] : ''
  const roleColor    = role ? ROLE_COLORS[role]  : ''

  async function handleSignOut() {
    await signOut()
  }

  return (
    <>
      {/* ── Topbar mobile ──────────────────────────────── */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 bg-slate-900 text-white flex items-center gap-3 px-4 shadow-lg"
        style={{ height: 'var(--mobile-topbar-height)' }}
      >
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Stethoscope className="w-5 h-5 text-blue-400" />
          <div>
            <p className="text-sm font-bold leading-tight">Endoscopia</p>
            <p className="text-[10px] text-slate-400 leading-tight">Auditoria de Faturamento</p>
          </div>
        </div>
      </div>

      {/* ── Overlay mobile ─────────────────────────────── */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ────────────────────────────────────── */}
      <aside
        className={`sidebar fixed top-0 left-0 h-full bg-slate-900 text-white flex flex-col z-50${
          mobileOpen ? ' sidebar-open' : ''
        }`}
      >
        {/* ── Header ─────────────────────────────────── */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Stethoscope className="w-6 h-6 text-blue-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight truncate">Endoscopia</p>
              <p className="text-xs text-slate-400 leading-tight truncate">Auditoria de Faturamento</p>
            </div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            aria-label="Fechar menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Navegação ──────────────────────────────── */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* ── Usuário + Logout ───────────────────────── */}
        <div className="border-t border-slate-700 p-3">
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-800 transition-colors text-left"
          >
            {/* Avatar inicial */}
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 text-xs font-bold">
              {(profile?.nome || profile?.email || '?')[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white truncate leading-tight">
                {displayName}
              </p>
              {role && (
                <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mt-0.5 border ${roleColor}`}>
                  {roleLabel}
                </span>
              )}
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Menu de usuário expandido */}
          {userMenuOpen && (
            <div className="mt-1 px-2">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
              >
                <LogOut className="w-4 h-4 flex-shrink-0" />
                Sair
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
