-- ============================================================
--  Valores TUSS — Histórico de Valores por Convênio/Código/Período
--  Execute no SQL Editor do Supabase após 3_correlacao-migration.sql.
--
--  Pré-requisito: rbac-migration.sql (get_my_role) já executado.
--
--  Seções:
--    1. CREATE TABLE valores_tuss
--    2. UNIQUE constraint (lote_processamento, hash_conteudo)
--    3. Índices de performance
--    4. RLS policies
--    5. Trigger de enriquecimento no INSERT
--       → calcula hash_conteudo = MD5(convenio|codigo_tuss|mes|ano|ultimo_valor|qtd)
--       → detecta duplicata cross-lote (mesmo hash, lote diferente)
--    6. Campo tipo em lotes_carga (retrocompatível)
--    7. Verificação
--
--  Estratégia de deduplicação:
--    Hash NÃO inclui lote_processamento — inclui o conteúdo relevante.
--    Mesmo período + mesmos valores → is_duplicata=true (re-carga sem mudança).
--    Mesmo período + valores novos  → novo registro canônico (histórico acumula).
--    Lookup usa ORDER BY criado_em DESC para sempre pegar o mais recente.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. TABELA PRINCIPAL
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.valores_tuss (

  -- ── Chave surrogada ───────────────────────────────────────
  id                   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  -- ── Controle de lote ─────────────────────────────────────
  lote_processamento   TEXT        NOT NULL,

  -- ── Assinatura do conteúdo (preenchida pelo trigger) ─────
  --    MD5(convenio|codigo_tuss|mes|ano|ultimo_valor|qtd)
  --    Nunca enviar pelo app.py — será sobrescrito.
  hash_conteudo        TEXT        NOT NULL,

  -- ── Marcadores de duplicidade (preenchidos pelo trigger) ──
  is_duplicata         BOOLEAN     NOT NULL DEFAULT false,
  id_original          UUID        REFERENCES public.valores_tuss(id) ON DELETE SET NULL,

  -- ── Timestamp de ingestão ────────────────────────────────
  criado_em            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ── Chave de negócio (granularidade mes/ano) ─────────────
  "Ano"                INTEGER     NOT NULL,
  "Mes"                INTEGER     NOT NULL CHECK ("Mes" BETWEEN 1 AND 12),
  "Convenio"           TEXT        NOT NULL,
  "CodigoTUSS"         TEXT        NOT NULL,

  -- ── Métricas do período ───────────────────────────────────
  "Descricao"          TEXT,
  "Qtd"                INTEGER,
  "Media"              NUMERIC(12, 2),
  "UltimoValor"        NUMERIC(12, 2),
  "DataUltimo"         DATE,
  "Confianca"          TEXT

);

COMMENT ON TABLE public.valores_tuss IS
  'Histórico de valores por (Convênio, Código TUSS, Mês, Ano) extraído dos arquivos de repasse. '
  'Alimentado pelo app.py junto com correlacao_endoscopia no mesmo lote de carga.';

COMMENT ON COLUMN public.valores_tuss.hash_conteudo IS
  'MD5(convenio|codigo_tuss|mes|ano|ultimo_valor|qtd). '
  'Mesmo período + mesmos valores → is_duplicata=true. '
  'Mesmo período + valores diferentes → novo canônico (evolução histórica).';

COMMENT ON COLUMN public.valores_tuss.is_duplicata IS
  'true = idêntico a registro de lote anterior. Oculto no frontend por padrão.';


-- ─────────────────────────────────────────────────────────────
-- 2. UNIQUE CONSTRAINT
--    Duplicatas intra-lote silenciadas via ON CONFLICT DO NOTHING.
--    Duplicatas cross-lote detectadas pelo trigger.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.valores_tuss
  ADD CONSTRAINT valores_tuss_lote_hash_uniq
  UNIQUE (lote_processamento, hash_conteudo);


-- ─────────────────────────────────────────────────────────────
-- 3. ÍNDICES DE PERFORMANCE
-- ─────────────────────────────────────────────────────────────

-- Dedup cross-lote: busca por hash em lotes distintos
CREATE INDEX IF NOT EXISTS vt_hash_canonical_idx
  ON public.valores_tuss (hash_conteudo)
  WHERE is_duplicata = false;

-- Lookup de estimativa: chave de negócio, mais recente primeiro
CREATE INDEX IF NOT EXISTS vt_lookup_idx
  ON public.valores_tuss ("Convenio", "CodigoTUSS", "Ano", "Mes")
  WHERE is_duplicata = false;

-- Filtros do frontend
CREATE INDEX IF NOT EXISTS vt_convenio_idx
  ON public.valores_tuss ("Convenio")
  WHERE is_duplicata = false;

CREATE INDEX IF NOT EXISTS vt_codigo_tuss_idx
  ON public.valores_tuss ("CodigoTUSS")
  WHERE is_duplicata = false;

CREATE INDEX IF NOT EXISTS vt_ano_mes_idx
  ON public.valores_tuss ("Ano" DESC, "Mes" DESC)
  WHERE is_duplicata = false;

-- Gestão de lotes
CREATE INDEX IF NOT EXISTS vt_lote_idx
  ON public.valores_tuss (lote_processamento);


-- ─────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.valores_tuss ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "valores_tuss: authenticated read" ON public.valores_tuss;
CREATE POLICY "valores_tuss: authenticated read"
  ON public.valores_tuss
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "valores_tuss: editor/admin insert" ON public.valores_tuss;
CREATE POLICY "valores_tuss: editor/admin insert"
  ON public.valores_tuss
  FOR INSERT
  WITH CHECK (public.get_my_role() IN ('editor', 'admin'));

DROP POLICY IF EXISTS "valores_tuss: editor/admin update" ON public.valores_tuss;
CREATE POLICY "valores_tuss: editor/admin update"
  ON public.valores_tuss
  FOR UPDATE
  USING  (public.get_my_role() IN ('editor', 'admin'))
  WITH CHECK (public.get_my_role() IN ('editor', 'admin'));

DROP POLICY IF EXISTS "valores_tuss: admin delete" ON public.valores_tuss;
CREATE POLICY "valores_tuss: admin delete"
  ON public.valores_tuss
  FOR DELETE
  USING (public.get_my_role() = 'admin');


-- ─────────────────────────────────────────────────────────────
-- 5. TRIGGER DE ENRIQUECIMENTO NO INSERT
--
--    BEFORE INSERT, FOR EACH ROW:
--      A. Calcular hash_conteudo
--         MD5(convenio | codigo_tuss | mes | ano | ultimo_valor | qtd)
--         Media excluída — derivada de soma/qtd, instável por arredondamento.
--      B. Detectar duplicata cross-lote
--         Mesmo hash em outro lote → is_duplicata=true, id_original=canônico.
--         Duplicatas intra-lote tratadas pelo UNIQUE + ON CONFLICT DO NOTHING.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enrich_valores_tuss_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_canonical_id UUID;
BEGIN
  -- ── A. Calcular hash_conteudo ────────────────────────────
  NEW.hash_conteudo := md5(
    coalesce(NEW."Convenio",               '') || '|' ||
    coalesce(NEW."CodigoTUSS",             '') || '|' ||
    coalesce(NEW."Mes"::text,              '') || '|' ||
    coalesce(NEW."Ano"::text,              '') || '|' ||
    coalesce(NEW."UltimoValor"::text,      '') || '|' ||
    coalesce(NEW."Qtd"::text,              '')
  );

  -- ── B. Detectar duplicata cross-lote ────────────────────
  SELECT id
    INTO v_canonical_id
    FROM public.valores_tuss
   WHERE hash_conteudo      = NEW.hash_conteudo
     AND lote_processamento != NEW.lote_processamento
     AND is_duplicata        = false
   ORDER BY criado_em ASC
   LIMIT 1;

  IF FOUND THEN
    NEW.is_duplicata := true;
    NEW.id_original  := v_canonical_id;
  ELSE
    NEW.is_duplicata := false;
    NEW.id_original  := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS valores_tuss_enrich_on_insert ON public.valores_tuss;

CREATE TRIGGER valores_tuss_enrich_on_insert
  BEFORE INSERT ON public.valores_tuss
  FOR EACH ROW
  EXECUTE FUNCTION public.enrich_valores_tuss_on_insert();

COMMENT ON FUNCTION public.enrich_valores_tuss_on_insert IS
  'BEFORE INSERT: calcula hash_conteudo e detecta duplicatas cross-lote para valores_tuss.';


-- ─────────────────────────────────────────────────────────────
-- 6. CAMPO tipo EM lotes_carga
--    Distingue o que cada lote carregou: correlações, valores ou ambos.
--    Idempotente — ADD COLUMN IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.lotes_carga
  ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'completo'
  CHECK (tipo IN ('correlacao', 'valores_tuss', 'completo'));

COMMENT ON COLUMN public.lotes_carga.tipo IS
  'Conteúdo do lote: completo (correlacoes + valores_tuss), correlacao, valores_tuss.';


-- ─────────────────────────────────────────────────────────────
-- 7. VERIFICAÇÃO
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_table    BOOLEAN;
  v_uniq     BOOLEAN;
  v_rls      BOOLEAN;
  v_trig     BOOLEAN;
  v_n_idx    INTEGER;
  v_tipo_col BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'valores_tuss'
  ) INTO v_table;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'valores_tuss_lote_hash_uniq'
       AND conrelid = 'public.valores_tuss'::regclass
  ) INTO v_uniq;

  SELECT relrowsecurity
    FROM pg_class
   WHERE relnamespace = 'public'::regnamespace
     AND relname = 'valores_tuss'
  INTO v_rls;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'valores_tuss_enrich_on_insert'
  ) INTO v_trig;

  SELECT COUNT(*)
    FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'valores_tuss'
  INTO v_n_idx;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'lotes_carga'
       AND column_name  = 'tipo'
  ) INTO v_tipo_col;

  RAISE NOTICE '=== valores_tuss Migration Check ===';
  RAISE NOTICE 'Tabela criada ............. %', CASE WHEN v_table    THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE 'UNIQUE lote+hash .......... %', CASE WHEN v_uniq     THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE 'RLS ativado ............... %', CASE WHEN v_rls      THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE 'Trigger enrich_on_insert .. %', CASE WHEN v_trig     THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE 'Índices criados ........... %', v_n_idx;
  RAISE NOTICE 'lotes_carga.tipo .......... %', CASE WHEN v_tipo_col THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE '=====================================';
END;
$$;
