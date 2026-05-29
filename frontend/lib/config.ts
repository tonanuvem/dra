// Centralised runtime config — all table names and env values read here.
// Change values in .env (or docker-compose environment:) without touching source.

export const TABLES = {
  correlacao: process.env.NEXT_PUBLIC_TABLE_CORRELACAO ?? 'correlacao_endoscopia_com_tipo',
  tussLookup: process.env.NEXT_PUBLIC_TABLE_TUSS_LOOKUP ?? 'tuss_lookup_table',
} as const

export const APP = {
  titulo: process.env.NEXT_PUBLIC_APP_TITULO ?? 'Auditoria Endoscopia',
  subtitulo: process.env.NEXT_PUBLIC_APP_SUBTITULO ?? 'ENDOPRIME · Endoscopia',
} as const
