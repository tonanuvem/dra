# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# ── Stage 2: builder ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Build-time env vars (NEXT_PUBLIC_* are baked into the JS bundle at build time)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_TABLE_CORRELACAO=correlacao_endoscopia
ARG NEXT_PUBLIC_TABLE_TUSS_LOOKUP=tuss_lookup_table
ARG NEXT_PUBLIC_APP_TITULO=Auditoria Endoscopia
ARG NEXT_PUBLIC_APP_SUBTITULO="ENDOPRIME · Endoscopia"

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_TABLE_CORRELACAO=$NEXT_PUBLIC_TABLE_CORRELACAO
ENV NEXT_PUBLIC_TABLE_TUSS_LOOKUP=$NEXT_PUBLIC_TABLE_TUSS_LOOKUP
ENV NEXT_PUBLIC_APP_TITULO=$NEXT_PUBLIC_APP_TITULO
ENV NEXT_PUBLIC_APP_SUBTITULO=$NEXT_PUBLIC_APP_SUBTITULO

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ── Stage 3: runner ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Standalone output contains everything needed to run without node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
