'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { TABLES } from '@/lib/config'
import { useAuth } from '@/contexts/AuthContext'
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/permissions'
import type { Role } from '@/lib/permissions'
import {
  Plus, Check, X, Settings2, Loader2, ChevronDown, ChevronUp,
  Users, UserPlus, Pencil, ShieldCheck, ShieldOff, Mail,
  Eye, EyeOff, Copy, RefreshCw,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface TussLookupRow {
  chave_norm: string
  Proc_PRODUCAO_raw: string | null
  ProcAdic_PRODUCAO_raw: string | null
  CodigosTUSS: string | null
  TipoCobranca: string
  codigo_base_proc_principal: string | null
  Descricao_REPASSE: string | null
}

interface CorrGap {
  procedimento: string
  adicional: string | null
  ocorrencias: number
  inLookup: boolean
}

interface UserProfile {
  id: string
  email: string
  nome: string | null
  role: Role
  ativo: boolean
  criado_em: string
  last_sign_in_at: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const TIPO_COBRANCA_OPTIONS = [
  { value: 'unico_cod_tuss_somente_proc_principal',             label: 'Único — só proc. principal'         },
  { value: 'unico_cod_tuss_inclui_proc_adicional_e_principal',  label: 'Único — inclui proc. adicional'     },
  { value: 'multiplos_cod_tuss_proced_adicional',               label: 'Múltiplos códigos'                   },
]

const TIPO_LABEL: Record<string, string> = {
  'unico_cod_tuss_somente_proc_principal':            'Único — só principal',
  'unico_cod_tuss_inclui_proc_adicional_e_principal': 'Único — c/ adicional',
  'multiplos_cod_tuss_proced_adicional':              'Múltiplos códigos',
}

const VALID_ROLES: Role[] = ['visualizador', 'editor', 'financeiro', 'admin']

// ─────────────────────────────────────────────────────────────────────────────
// Helper — auth header for admin API routes
// ─────────────────────────────────────────────────────────────────────────────
async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component — Grouped TUSS Mappings
// ─────────────────────────────────────────────────────────────────────────────
function MapeamentosAgrupados({ rows }: { rows: TussLookupRow[] }) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  const groups = rows.reduce<Record<string, { codigo: string; tipo: string; descricao: string | null; items: TussLookupRow[] }>>(
    (acc, row) => {
      const key = `${row.CodigosTUSS ?? '—'}||${row.TipoCobranca}`
      if (!acc[key]) {
        acc[key] = { codigo: row.CodigosTUSS ?? '—', tipo: row.TipoCobranca, descricao: row.Descricao_REPASSE, items: [] }
      }
      acc[key].items.push(row)
      return acc
    },
    {}
  )

  const sorted = Object.entries(groups).sort((a, b) => b[1].items.length - a[1].items.length)
  const toggle = (key: string) =>
    setOpenGroups(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Mapeamentos em vigor</h2>
        <span className="text-xs text-gray-500">{sorted.length} grupos · {rows.length} combinações</span>
      </div>
      <div className="grid grid-cols-[2fr_2fr_1fr_40px] gap-2 px-5 py-2 border-b border-gray-200 bg-gray-50">
        <span className="text-xs font-semibold text-gray-500 uppercase">Código(s) TUSS</span>
        <span className="text-xs font-semibold text-gray-500 uppercase">Tipo</span>
        <span className="text-xs font-semibold text-gray-500 uppercase text-right">Qtd</span>
        <span />
      </div>
      <div className="divide-y divide-gray-100">
        {sorted.map(([key, group]) => {
          const isOpen = openGroups.has(key)
          return (
            <div key={key}>
              <div className="grid grid-cols-[2fr_2fr_1fr_40px] gap-2 items-center px-5 py-3 hover:bg-gray-50 transition-colors">
                <div>
                  <span className="font-mono text-sm text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{group.codigo}</span>
                  {group.descricao && <p className="text-xs text-gray-400 mt-0.5 truncate">{group.descricao}</p>}
                </div>
                <span className="text-sm text-gray-600">{TIPO_LABEL[group.tipo] ?? group.tipo}</span>
                <span className="text-sm font-semibold text-gray-700 text-right">{group.items.length}</span>
                <button
                  onClick={() => toggle(key)}
                  className="flex items-center justify-center w-8 h-8 rounded hover:bg-gray-200 transition-colors ml-auto"
                >
                  {isOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </button>
              </div>
              {isOpen && (
                <div className="bg-gray-50 border-t border-gray-100">
                  <div className="grid grid-cols-2 gap-2 px-8 py-1.5 border-b border-gray-200">
                    <span className="text-xs font-semibold text-gray-400 uppercase">Procedimento</span>
                    <span className="text-xs font-semibold text-gray-400 uppercase">Adicional</span>
                  </div>
                  {group.items.map((item, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2 px-8 py-2 border-b border-gray-100 last:border-0 hover:bg-white transition-colors">
                      <span className="text-sm text-gray-800">{item.Proc_PRODUCAO_raw ?? '—'}</span>
                      <span className="text-sm text-gray-500">{item.ProcAdic_PRODUCAO_raw ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component — Edit User Modal
// ─────────────────────────────────────────────────────────────────────────────
function EditUserModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserProfile
  onClose: () => void
  onSaved: () => void
}) {
  const { user: currentUser, signOut } = useAuth()
  const [role, setRole] = useState<Role>(user.role)
  const [ativo, setAtivo] = useState(user.ativo)
  const [nome, setNome] = useState(user.nome ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [changePasswordMode, setChangePasswordMode] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)

  async function handleSave() {
    if (changePasswordMode && newPassword.trim().length > 0 && newPassword.trim().length < 6) {
      setError('Senha deve ter no mínimo 6 caracteres')
      return
    }
    setSaving(true)
    setError(null)
    // Detecta se o admin está alterando sua própria senha
    const isOwnPasswordChange = changePasswordMode && !!newPassword.trim() && user.id === currentUser?.id
    try {
      const headers = await authHeaders()
      const payload: Record<string, unknown> = { id: user.id, role, ativo, nome }
      if (changePasswordMode && newPassword.trim()) payload.password = newPassword.trim()
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao salvar')

      // Ao trocar a própria senha, o Supabase invalida o JWT atual.
      // Tentamos renovar a sessão; se falhar, saímos graciosamente.
      if (isOwnPasswordChange) {
        const { error: refreshError } = await supabase.auth.refreshSession()
        if (refreshError) {
          await signOut()
          return // AuthGuard vai redirecionar para login
        }
      }

      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-800">Editar usuário</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Email (read-only) */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">E-mail</label>
            <p className="text-sm text-gray-800 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 font-mono">
              {user.email}
            </p>
          </div>

          {/* Nome */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Nome</label>
            <input
              type="text"
              value={nome}
              onChange={e => setNome(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Nome completo"
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Perfil de acesso</label>
            <div className="grid grid-cols-2 gap-2">
              {VALID_ROLES.map(r => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors text-left ${
                    role === r
                      ? `${ROLE_COLORS[r]} border-current ring-2 ring-offset-1 ring-current`
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          {/* Ativo toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <p className="text-sm font-medium text-gray-800">Conta ativa</p>
              <p className="text-xs text-gray-500">Usuários inativos não conseguem fazer login</p>
            </div>
            <button
              onClick={() => setAtivo(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${ativo ? 'bg-green-500' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${ativo ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* Redefinir senha */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => { setChangePasswordMode(v => !v); setNewPassword(''); setShowNewPassword(false) }}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span className="font-medium text-xs">Redefinir senha do usuário</span>
              {changePasswordMode ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {changePasswordMode && (
              <div className="px-3 pb-3 pt-3 border-t border-gray-100 bg-gray-50">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nova senha</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full pl-3 pr-9 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Mín. 6 caracteres"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => { const pwd = generatePassword(); setNewPassword(pwd); setShowNewPassword(true) }}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Gerar
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-gray-400">
                  Deixe em branco para manter a senha atual.
                </p>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Salvar alterações
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component — Create User Modal (senha definida pelo admin)
// ─────────────────────────────────────────────────────────────────────────────
function generatePassword(): string {
  // Sem caracteres ambíguos (0/O, 1/l/I)
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function InviteUserModal({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const [email, setEmail]           = useState('')
  const [nome, setNome]             = useState('')
  const [role, setRole]             = useState<Role>('editor')
  const [password, setPassword]     = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  // Após criação: guarda as credenciais para exibir ao admin
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null)
  const [copied, setCopied]         = useState(false)

  function handleGenerate() {
    const pwd = generatePassword()
    setPassword(pwd)
    setShowPassword(true)   // exibe a senha gerada
  }

  async function handleCreate() {
    if (!password.trim()) { setError('Defina ou gere uma senha'); return }
    setLoading(true)
    setError(null)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: email.trim(), nome: nome.trim(), role, password }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao criar usuário')
      setCredentials({ email: email.trim(), password })
      onInvited()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  async function copyCredentials() {
    if (!credentials) return
    await navigator.clipboard.writeText(
      `Login: ${credentials.email}\nSenha: ${credentials.password}`
    )
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-800">
              {credentials ? 'Usuário criado' : 'Criar novo usuário'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {credentials ? (
            /* ── Sucesso — exibe credenciais para o admin copiar ── */
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
                <Check className="w-4 h-4 flex-shrink-0" />
                <p className="text-sm font-medium">Conta criada com sucesso!</p>
              </div>

              {/* Card de credenciais */}
              <div className="bg-gray-900 rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Credenciais de acesso
                </p>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500">Login</p>
                  <p className="text-sm font-mono text-white break-all">{credentials.email}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500">Senha inicial</p>
                  <p className="text-lg font-mono font-bold text-yellow-400 tracking-widest">
                    {credentials.password}
                  </p>
                </div>
              </div>

              {/* Botão copiar */}
              <button
                onClick={copyCredentials}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  copied
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiado!' : 'Copiar login e senha'}
              </button>

              <p className="text-xs text-gray-500 text-center leading-relaxed">
                Compartilhe as credenciais acima com o usuário por um canal seguro.<br />
                O usuário poderá alterar a senha após o primeiro login.
              </p>
            </div>
          ) : (
            /* ── Formulário ── */
            <>
              {/* E-mail */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">E-mail *</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="email@exemplo.com"
                    autoFocus
                  />
                </div>
              </div>

              {/* Nome */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nome</label>
                <input
                  type="text"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nome completo"
                />
              </div>

              {/* Senha */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Senha inicial *</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full pl-3 pr-9 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Mín. 6 caracteres"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Gerar
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  O usuário poderá alterar a senha após o primeiro login.
                </p>
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Perfil de acesso</label>
                <div className="grid grid-cols-2 gap-2">
                  {VALID_ROLES.map(r => (
                    <button
                      key={r}
                      onClick={() => setRole(r)}
                      className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors text-left ${
                        role === r
                          ? `${ROLE_COLORS[r]} border-current ring-2 ring-offset-1 ring-current`
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span className="font-semibold">{ROLE_LABELS[r]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            {credentials ? 'Fechar' : 'Cancelar'}
          </button>
          {!credentials && (
            <button
              onClick={handleCreate}
              disabled={!email.trim() || !password.trim() || loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Criar usuário
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component — Users & Access Tab
// ─────────────────────────────────────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const headers = await authHeaders()
      let res: Response = await fetch('/api/admin/users', { headers })
      // Retry único após refresh de sessão (ex: token invalidado após troca de senha)
      if (res.status === 403) {
        await supabase.auth.refreshSession()
        const retryHeaders = await authHeaders()
        res = await fetch('/api/admin/users', { headers: retryHeaders })
      }
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao carregar usuários')
      setUsers(json.users ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  function fmtDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <>
      {/* Modals */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={() => { setEditingUser(null); loadUsers() }}
        />
      )}
      {showInvite && (
        <InviteUserModal
          onClose={() => setShowInvite(false)}
          onInvited={() => { loadUsers() }}
        />
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-600" />
            <h2 className="text-sm font-semibold text-gray-700">Usuários e Acessos</h2>
            <span className="text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">{users.length}</span>
          </div>
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Convidar usuário
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        {/* Table header */}
        <div className="hidden md:grid grid-cols-[2fr_2fr_1.5fr_1fr_1fr_auto] gap-3 px-5 py-2.5 border-b border-gray-200 bg-gray-50">
          <span className="text-xs font-semibold text-gray-500 uppercase">Nome</span>
          <span className="text-xs font-semibold text-gray-500 uppercase">E-mail</span>
          <span className="text-xs font-semibold text-gray-500 uppercase">Perfil</span>
          <span className="text-xs font-semibold text-gray-500 uppercase">Status</span>
          <span className="text-xs font-semibold text-gray-500 uppercase">Último acesso</span>
          <span />
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-100">
          {users.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum usuário encontrado</p>
            </div>
          ) : (
            users.map(u => (
              <div
                key={u.id}
                className={`grid grid-cols-1 md:grid-cols-[2fr_2fr_1.5fr_1fr_1fr_auto] gap-2 md:gap-3 items-center px-5 py-3.5 hover:bg-gray-50 transition-colors ${!u.ativo ? 'opacity-50' : ''}`}
              >
                {/* Nome */}
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 text-xs font-bold text-white">
                    {(u.nome || u.email || '?')[0].toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-gray-800 truncate">{u.nome || '—'}</span>
                </div>

                {/* E-mail */}
                <span className="text-sm text-gray-500 font-mono truncate md:block hidden">{u.email}</span>
                <span className="text-xs text-gray-400 font-mono truncate md:hidden">{u.email}</span>

                {/* Role badge */}
                <div>
                  <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded border ${ROLE_COLORS[u.role]}`}>
                    {ROLE_LABELS[u.role]}
                  </span>
                </div>

                {/* Ativo */}
                <div>
                  {u.ativo ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">
                      <ShieldCheck className="w-3 h-3" /> Ativo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">
                      <ShieldOff className="w-3 h-3" /> Inativo
                    </span>
                  )}
                </div>

                {/* Último acesso */}
                <span className="text-xs text-gray-400 hidden md:block">{fmtDate(u.last_sign_in_at)}</span>

                {/* Edit */}
                <button
                  onClick={() => setEditingUser(u)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  <span className="hidden sm:inline">Editar</span>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function ConfiguracoesPage() {
  const { permissions } = useAuth()
  const isAdmin = permissions?.canManageUsers ?? false

  const [lookupGaps, setLookupGaps] = useState<TussLookupRow[]>([])
  const [corrGaps, setCorrGaps]     = useState<CorrGap[]>([])
  const [allLookup, setAllLookup]   = useState<TussLookupRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [expanded, setExpanded]     = useState<string | null>(null)
  const [forms, setForms]           = useState<Record<string, { codigo: string; tipo: string; descricao: string }>>({})
  const [saving, setSaving]         = useState<string | null>(null)
  const [saved, setSaved]           = useState<Set<string>>(new Set())

  type Section = 'lacunas' | 'mapeamentos' | 'usuarios'
  const [activeSection, setActiveSection] = useState<Section>('lacunas')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const { data: lookupData } = await supabase.from(TABLES.tussLookup).select('*')
      const lookup = ((lookupData as unknown) as TussLookupRow[]) ?? []
      setAllLookup(lookup)

      const gaps = lookup.filter(r => r.TipoCobranca === 'sem_mapeamento_tuss')
      setLookupGaps(gaps)

      const lookupKeys = new Set(lookup.map(r => r.chave_norm))

      const { data: corrRaw } = await supabase
        .from(TABLES.correlacao)
        .select('Procedimento_PRODUCAO, ProcedimentosAdicionais_PRODUCAO')
        .eq('StatusTUSS', 'TUSS_COMBINACAO_SEM_MAPEAMENTO')

      const corrRows = ((corrRaw as unknown) as Array<{
        Procedimento_PRODUCAO: string | null
        ProcedimentosAdicionais_PRODUCAO: string | null
      }>) ?? []

      const countMap: Record<string, { adicional: string | null; count: number }> = {}
      for (const row of corrRows) {
        const key = (row.Procedimento_PRODUCAO ?? '').trim()
        if (!key) continue
        if (!countMap[key]) countMap[key] = { adicional: row.ProcedimentosAdicionais_PRODUCAO, count: 0 }
        countMap[key].count++
      }

      const gaps2: CorrGap[] = Object.entries(countMap)
        .map(([proc, { adicional, count }]) => ({
          procedimento: proc,
          adicional,
          ocorrencias: count,
          inLookup: lookupKeys.has(proc + '_') || lookupKeys.has(proc + '_' + (adicional ?? '')),
        }))
        .sort((a, b) => b.ocorrencias - a.ocorrencias)

      setCorrGaps(gaps2)
    } finally {
      setLoading(false)
    }
  }

  const allGaps = [
    ...lookupGaps.map(g => ({
      id: g.chave_norm,
      label: [g.Proc_PRODUCAO_raw, g.ProcAdic_PRODUCAO_raw].filter(Boolean).join(' + '),
      ocorrencias: null as number | null,
      source: 'lookup' as const,
      row: g,
    })),
    ...corrGaps
      .filter(g => !g.inLookup)
      .map(g => ({
        id: `corr_${g.procedimento}`,
        label: [g.procedimento, g.adicional].filter(Boolean).join(' + '),
        ocorrencias: g.ocorrencias,
        source: 'corr' as const,
        row: null as TussLookupRow | null,
      })),
  ]

  async function saveGap(id: string, source: 'lookup' | 'corr', row: TussLookupRow | null) {
    const form = forms[id]
    if (!form?.codigo?.trim()) return
    setSaving(id)
    try {
      if (source === 'lookup' && row) {
        await supabase
          .from(TABLES.tussLookup)
          .update({
            CodigosTUSS: form.codigo.trim(),
            TipoCobranca: form.tipo || 'unico_cod_tuss_somente_proc_principal',
            Descricao_REPASSE: form.descricao?.trim() || null,
            codigo_base_proc_principal: form.codigo.trim(),
          } as object)
          .eq('chave_norm', row.chave_norm)
      } else {
        const proc = id.replace('corr_', '')
        const chave = proc + '_'
        await supabase
          .from(TABLES.tussLookup)
          .insert({
            chave_norm: chave,
            Proc_PRODUCAO_raw: proc,
            CONCATENAR_raw: chave,
            CodigosTUSS: form.codigo.trim(),
            QtdCodigos: 1,
            TipoCobranca: form.tipo || 'unico_cod_tuss_somente_proc_principal',
            Descricao_REPASSE: form.descricao?.trim() || null,
            codigo_base_proc_principal: form.codigo.trim(),
          } as object)
      }

      const proc = source === 'lookup' ? (row?.Proc_PRODUCAO_raw ?? '') : id.replace('corr_', '')
      if (proc) {
        await supabase
          .from(TABLES.correlacao)
          .update({ CodigosTUSS_Esperados: form.codigo.trim() } as object)
          .ilike('Procedimento_PRODUCAO', `%${proc}%`)
          .is('CodigosTUSS_Esperados', null)
      }

      setSaved(prev => new Set([...prev, id]))
      setExpanded(null)
      await loadData()
    } finally {
      setSaving(null)
    }
  }

  const updateForm = (id: string, field: 'codigo' | 'tipo' | 'descricao', value: string) =>
    setForms(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Settings2 className="w-6 h-6 text-gray-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Configurações</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Mapeamento TUSS e gerenciamento de usuários
          </p>
        </div>
      </div>

      {/* ── Section tabs ── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
        <button
          onClick={() => setActiveSection('lacunas')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeSection === 'lacunas' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Lacunas ({allGaps.length})
        </button>
        <button
          onClick={() => setActiveSection('mapeamentos')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeSection === 'mapeamentos' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Mapeamentos existentes ({allLookup.filter(r => r.TipoCobranca !== 'sem_mapeamento_tuss').length})
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveSection('usuarios')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeSection === 'usuarios' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Users className="w-3.5 h-3.5" />
            Usuários e Acessos
          </button>
        )}
      </div>

      {/* ── Lacunas ── */}
      {activeSection === 'lacunas' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Combinações sem mapeamento TUSS</h2>
            <span className="text-xs text-gray-500">ordenado por frequência</span>
          </div>

          {allGaps.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Check className="w-8 h-8 mx-auto mb-2 text-green-500" />
              <p className="font-medium">Todas as combinações estão mapeadas</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {allGaps.map(gap => {
                const isExpanded = expanded === gap.id
                const isSaved = saved.has(gap.id)
                const form = forms[gap.id] ?? { codigo: '', tipo: 'unico_cod_tuss_somente_proc_principal', descricao: '' }
                return (
                  <div key={gap.id} className={isSaved ? 'bg-green-50' : ''}>
                    <button
                      onClick={() => setExpanded(isExpanded ? null : gap.id)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{gap.label}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {gap.source === 'lookup' && (
                            <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">na tabela TUSS</span>
                          )}
                          {gap.ocorrencias != null && (
                            <span className="text-xs text-gray-500">
                              {gap.ocorrencias} ocorrência{gap.ocorrencias !== 1 ? 's' : ''} na correlação
                            </span>
                          )}
                        </div>
                      </div>
                      {gap.ocorrencias != null && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-semibold flex-shrink-0">
                          {gap.ocorrencias}
                        </span>
                      )}
                      {isSaved ? (
                        <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                      ) : isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      )}
                    </button>

                    {isExpanded && !isSaved && (
                      <div className="px-5 pb-4 bg-blue-50 border-t border-blue-100">
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Código(s) TUSS *</label>
                            <input
                              type="text"
                              value={form.codigo}
                              onChange={e => updateForm(gap.id, 'codigo', e.target.value)}
                              placeholder="ex: 40202615 ou 40202615,40202186"
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Tipo de Cobrança</label>
                            <select
                              value={form.tipo}
                              onChange={e => updateForm(gap.id, 'tipo', e.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            >
                              {TIPO_COBRANCA_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="mt-3">
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Descrição TUSS (opcional)</label>
                          <input
                            type="text"
                            value={form.descricao}
                            onChange={e => updateForm(gap.id, 'descricao', e.target.value)}
                            placeholder="ex: Ecoendoscopia do Trato Digestivo Baixo"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={() => saveGap(gap.id, gap.source, gap.row)}
                            disabled={!form.codigo?.trim() || saving === gap.id}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
                          >
                            {saving === gap.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Salvar e retroalimentar correlações
                          </button>
                          <button
                            onClick={() => setExpanded(null)}
                            className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm transition-colors"
                          >
                            <X className="w-4 h-4" />
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Mapeamentos ── */}
      {activeSection === 'mapeamentos' && (
        <MapeamentosAgrupados rows={allLookup.filter(r => r.TipoCobranca !== 'sem_mapeamento_tuss')} />
      )}

      {/* ── Usuários e Acessos (admin only) ── */}
      {activeSection === 'usuarios' && isAdmin && <UsersTab />}
    </div>
  )
}
