'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { Stethoscope, Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react'

// ── Formulário de login ───────────────────────────────────────

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const erroParam    = searchParams.get('erro')

  const [email,     setEmail]     = useState('')
  const [senha,     setSenha]     = useState('')
  const [showSenha, setShowSenha] = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [erro,      setErro]      = useState<string | null>(null)

  useEffect(() => {
    if (erroParam === 'conta-inativa') {
      setErro('Sua conta está desativada. Entre em contato com o administrador.')
    }
  }, [erroParam])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErro(null)

    const { error } = await supabase.auth.signInWithPassword({
      email:    email.trim().toLowerCase(),
      password: senha,
    })

    if (error) {
      setErro('E-mail ou senha incorretos. Verifique seus dados e tente novamente.')
      setLoading(false)
      return
    }

    // AuthContext detecta a sessão e AuthGuard redireciona para /dashboard
    router.replace('/dashboard')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* E-mail */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          E-mail
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="email"
          autoFocus
          disabled={loading}
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     disabled:bg-gray-50 disabled:text-gray-400 transition-colors"
          placeholder="seu@email.com"
        />
      </div>

      {/* Senha */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Senha
        </label>
        <div className="relative">
          <input
            type={showSenha ? 'text' : 'password'}
            value={senha}
            onChange={e => setSenha(e.target.value)}
            required
            autoComplete="current-password"
            disabled={loading}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       disabled:bg-gray-50 disabled:text-gray-400 transition-colors"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowSenha(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label={showSenha ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mensagem de erro */}
      {erro && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 leading-snug">{erro}</p>
        </div>
      )}

      {/* Botão */}
      <button
        type="submit"
        disabled={loading || !email || !senha}
        className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                   disabled:opacity-50 disabled:cursor-not-allowed
                   text-white font-semibold py-2.5 rounded-lg text-sm
                   transition-colors flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}

// ── Página ────────────────────────────────────────────────────

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
            <Stethoscope className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-lg leading-tight">Endoscopia</p>
            <p className="text-slate-400 text-sm leading-tight">Auditoria de Faturamento</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Entrar</h1>
          <p className="text-sm text-gray-500 mb-6">Acesse sua conta para continuar</p>

          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>

          <p className="text-xs text-gray-400 text-center mt-6">
            Acesso restrito — somente usuários autorizados
          </p>
        </div>

      </div>
    </div>
  )
}
