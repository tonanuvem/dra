'use client'

import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'

const NO_SIDEBAR_ROUTES = ['/login']

/**
 * Renderiza o Sidebar apenas em rotas autenticadas.
 * A página de login tem layout próprio (fundo slate-900, sem sidebar).
 */
export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const hasSidebar = !NO_SIDEBAR_ROUTES.some(r => pathname.startsWith(r))

  if (!hasSidebar) {
    return <>{children}</>
  }

  return (
    <>
      <Sidebar />
      <main className="main-content min-h-screen p-6">
        {children}
      </main>
    </>
  )
}
