'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { PROTECTED_ROUTES } from '@/lib/permissions'
import type { Permissions } from '@/lib/permissions'

const PUBLIC_ROUTES = ['/login']

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, permissions, loading } = useAuth()
  const router   = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading) return

    const isPublic = PUBLIC_ROUTES.some(r => pathname.startsWith(r))

    // Não autenticado → /login
    if (!user && !isPublic) {
      router.replace('/login')
      return
    }

    // Já autenticado tentando acessar /login → /dashboard
    if (user && isPublic) {
      router.replace('/dashboard')
      return
    }

    // Conta desativada → /login com aviso
    if (user && profile && !profile.ativo) {
      router.replace('/login?erro=conta-inativa')
      return
    }

    // Rota protegida por permissão → /dashboard
    if (permissions) {
      for (const [perm, routes] of Object.entries(PROTECTED_ROUTES) as [keyof Permissions, string[]][]) {
        if (routes.some(r => pathname.startsWith(r)) && !permissions[perm]) {
          router.replace('/dashboard')
          return
        }
      }
    }
  }, [user, profile, permissions, loading, pathname, router])

  // Tela de carregamento inicial (evita flash de conteúdo não autorizado)
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }

  // Rota pública: renderiza sempre
  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
    return <>{children}</>
  }

  // Rota protegida: renderiza só se autenticado e ativo
  if (!user || !profile || !profile.ativo) return null

  return <>{children}</>
}
