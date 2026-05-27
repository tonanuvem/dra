import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyAdmin(req: NextRequest): Promise<boolean> {
  const supabaseAdmin = getSupabaseAdmin()
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return false

  const token = authHeader.slice(7)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return false

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return profile?.role === 'admin'
}

// GET /api/admin/users — list all users (profiles + auth metadata)
export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin()
  
  if (!(await verifyAdmin(req))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: profiles, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, nome, role, ativo, criado_em, atualizado_em')
    .order('criado_em', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enrich with last_sign_in_at from auth.users via the view
  const { data: viewData } = await supabaseAdmin
    .from('user_profiles_view')
    .select('id, last_sign_in_at')

  const signInMap = new Map(
    (viewData ?? []).map((r: { id: string; last_sign_in_at: string | null }) => [r.id, r.last_sign_in_at])
  )

  const users = (profiles ?? []).map((p) => ({
    ...p,
    last_sign_in_at: signInMap.get(p.id) ?? null,
  }))

  return NextResponse.json({ users })
}

// PATCH /api/admin/users — update role and/or ativo for a user
export async function PATCH(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin()
  
  if (!(await verifyAdmin(req))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const { id, role, ativo, nome } = body ?? {}

  if (!id) {
    return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })
  }

  const validRoles = ['visualizador', 'editor', 'financeiro', 'admin']
  if (role !== undefined && !validRoles.includes(role)) {
    return NextResponse.json({ error: 'role inválido' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (role !== undefined) update.role = role
  if (ativo !== undefined) update.ativo = ativo
  if (nome !== undefined) update.nome = nome

  const { error } = await supabaseAdmin
    .from('profiles')
    .update(update)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
