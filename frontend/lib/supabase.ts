import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
// Suporta tanto a nova nomenclatura (publishable) quanto a legada (anon),
// garantindo que o app não quebre durante a transição de build.
const supabaseKey = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ''
)

export const supabase = createClient(supabaseUrl, supabaseKey)
