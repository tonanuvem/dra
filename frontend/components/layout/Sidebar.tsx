'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ClipboardCheck, FileText, Settings, Stethoscope, Menu, X } from 'lucide-react'

const navItems = [
  { href: '/dashboard',      label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/auditoria',      label: 'Auditoria',      icon: ClipboardCheck  },
  { href: '/faturamento',    label: 'Faturamento',    icon: FileText        },
  { href: '/configuracoes',  label: 'Configurações',  icon: Settings        },
]

export function Sidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Fecha sidebar ao mudar de rota no mobile
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Impede scroll do body quando sidebar mobile está aberta
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  return (
    <>
      {/* ── Topbar mobile ──────────────────────────────── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-slate-900 text-white flex items-center gap-3 px-4 shadow-lg"
           style={{ height: 'var(--mobile-topbar-height)' }}>
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
      <aside className={`sidebar fixed top-0 left-0 h-full bg-slate-900 text-white flex flex-col z-50${mobileOpen ? ' sidebar-open' : ''}`}>

        {/* Header desktop */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Stethoscope className="w-6 h-6 text-blue-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight truncate">Endoscopia</p>
              <p className="text-xs text-slate-400 leading-tight truncate">Auditoria de Faturamento</p>
            </div>
          </div>
          {/* Botão fechar só no mobile */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            aria-label="Fechar menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
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

        <div className="p-4 border-t border-slate-700">
          <p className="text-xs text-slate-500 truncate">São Camilo · Endoscopia</p>
        </div>
      </aside>
    </>
  )
}
