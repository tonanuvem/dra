import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getCallerRole(req: NextRequest): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdmin()
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return profile?.role ?? null
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin()
  
  // 1. Verify caller is admin
  const callerRole = await getCallerRole(req)
  if (callerRole !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 2. Parse body
  const body = await req.json().catch(() => null)
  const { email, nome, role } = body ?? {}

  if (!email || !role) {
    return NextResponse.json({ error: 'email e role são obrigatórios' }, { status: 400 })
  }

  const validRoles = ['visualizador', 'editor', 'financeiro', 'admin']
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: 'role inválido' }, { status: 400 })
  }

  // 3. Invite user via Supabase Auth Admin API
  const { data, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { nome: nome ?? '' },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/login`,
  })

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 400 })
  }

  // 4. Update the auto-created profile with the correct role and nome
  const userId = data.user?.id
  if (userId) {
    await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        email,
        nome: nome ?? '',
        role,
        ativo: true,
      })
  }

  return NextResponse.json({ ok: true, userId })
}
