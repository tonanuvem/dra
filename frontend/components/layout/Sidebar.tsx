'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ClipboardCheck, FileText, Settings, Stethoscope } from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/auditoria', label: 'Auditoria', icon: ClipboardCheck },
  { href: '/faturamento', label: 'Faturamento', icon: FileText },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="sidebar fixed top-0 left-0 h-full bg-slate-900 text-white flex flex-col z-50">
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <Stethoscope className="w-6 h-6 text-blue-400" />
          <div>
            <p className="text-sm font-bold leading-tight">Endoscopia</p>
            <p className="text-xs text-slate-400 leading-tight">Auditoria de Faturamento</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
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
        <p className="text-xs text-slate-500">São Camilo · Endoscopia</p>
      </div>
    </aside>
  )
}
