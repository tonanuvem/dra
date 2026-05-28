'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { ROLE_PERMISSIONS } from '@/lib/permissions'
import type { Role, Permissions } from '@/lib/permissions'

// ── Tipos ─────────────────────────────────────────────────────

export interface Profile {
  id:            string
  email:         string
  nome:          string | null
  cpf:           string | null
  role:          Role
  ativo:         boolean
  criado_em:     string
  atualizado_em: string
}

interface AuthContextValue {
  user:        User    | null
  profile:     Profile | null
  role:        Role    | null
  permissions: Permissions | null
  loading:     boolean
  signOut:     () => Promise<void>
  refreshProfile: () => Promise<void>
}

// ── Context ───────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  user:           null,
  profile:        null,
  role:           null,
  permissions:    null,
  loading:        true,
  signOut:        async () => {},
  refreshProfile: async () => {},
})

// ── Provider ──────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<User    | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  /** Carrega o profile do usuário autenticado na tabela profiles */
  const loadProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, nome, cpf, role, ativo, criado_em, atualizado_em')
      .eq('id', userId)
      .single()

    if (error || !data) return null
    return data as Profile
  }, [])

  /** Força recarga do profile (ex: após admin alterar o próprio role) */
  const refreshProfile = useCallback(async () => {
    if (!user) return
    const p = await loadProfile(user.id)
    setProfile(p)
  }, [user, loadProfile])

  useEffect(() => {
    let mounted = true

    // Garante que o loading seja liberado mesmo se getSession() travar (ex: chave inválida)
    const fallbackTimer = setTimeout(() => {
      if (mounted) setLoading(false)
    }, 6000)

    // Carrega sessão inicial (evita flash de tela de login ao recarregar)
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        clearTimeout(fallbackTimer)
        if (!mounted) return
        const u = session?.user ?? null
        setUser(u)
        if (u) {
          const p = await loadProfile(u.id)
          if (mounted) setProfile(p)
        }
        if (mounted) setLoading(false)
      })
      .catch(() => {
        clearTimeout(fallbackTimer)
        if (mounted) setLoading(false)
      })

    // Listener para login / logout / expiração de token
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        // TOKEN_REFRESHED e USER_UPDATED são eventos silenciosos: o JWT foi
        // renovado automaticamente pelo Supabase (ex: ao voltar para a aba).
        // O usuário e o profile não mudam — NÃO atualizamos NADA para evitar
        // re-renderizações desnecessárias que causam o spinner de loading.
        if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          // Não faz nada - o token é atualizado internamente pelo Supabase
          return
        }

        // Para SIGNED_IN e SIGNED_OUT: mantém loading=true durante toda a
        // transição para evitar que o AuthGuard veja user≠null / profile=null
        // simultaneamente e dispare um signOut() prematuro.
        setLoading(true)
        try {
          const u = session?.user ?? null
          setUser(u)
          if (u) {
            const p = await loadProfile(u.id)
            if (mounted) setProfile(p)
          } else {
            if (mounted) setProfile(null)
          }
        } finally {
          if (mounted) setLoading(false)
        }
      }
    )

    return () => {
      mounted = false
      clearTimeout(fallbackTimer)
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }, [])

  const role        = profile?.role ?? null
  const permissions = role ? ROLE_PERMISSIONS[role] : null

  return (
    <AuthContext.Provider value={{
      user, profile, role, permissions, loading, signOut, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────

export function useAuth() {
  return useContext(AuthContext)
}
