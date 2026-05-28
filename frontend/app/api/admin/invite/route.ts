import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
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

  // 1. Verificar que o chamador é admin
  const callerRole = await getCallerRole(req)
  if (callerRole !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 2. Parse body
  const body = await req.json().catch(() => null)
  const { email, nome, role, password, cpf } = body ?? {}

  if (!email || !role || !password) {
    return NextResponse.json({ error: 'email, role e password são obrigatórios' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length < 6) {
    return NextResponse.json({ error: 'Senha deve ter no mínimo 6 caracteres' }, { status: 400 })
  }
  const validRoles = ['visualizador', 'editor', 'financeiro', 'admin']
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: 'role inválido' }, { status: 400 })
  }

  // Normaliza CPF: apenas dígitos, NULL se ausente ou tamanho inválido
  const cpfNorm: string | null = (() => {
    if (!cpf) return null
    const digits = String(cpf).replace(/\D/g, '')
    return digits.length === 11 ? digits : null
  })()
  if (cpf && !cpfNorm) {
    return NextResponse.json({ error: 'CPF inválido — deve ter 11 dígitos' }, { status: 400 })
  }

  // 3. Criar usuário com senha conhecida (email já confirmado — sem email de verificação)
  const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome: nome ?? '', ...(cpfNorm ? { cpf: cpfNorm } : {}) },
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 })
  }

  const userId = createData.user?.id

  // 4. Atualizar profile com role, nome, cpf e ativo
  if (userId) {
    await supabaseAdmin.from('profiles').upsert({
      id: userId,
      email,
      nome: nome ?? '',
      role,
      ativo: true,
      ...(cpfNorm !== null ? { cpf: cpfNorm } : {}),
    })
  }

  return NextResponse.json({ ok: true, userId })
}
