-- ============================================================
--  Rollback Migration — Versionamento e Rastreabilidade de Cargas
--  Execute APÓS correlacao-migration.sql e rbac-migration.sql.
--
--  O que este script faz:
--    1. Adiciona campos de soft-delete na correlacao_endoscopia
--    2. Cria tabela operacoes_rollback (livro de auditoria)
--    3. Cria tabela lotes_carga (registro central por lote)
--    4. Adiciona FK rollback_operacao_id
--    5. Recria índices relevantes com filtro ativo = true
--    6. Atualiza o trigger enrich_correlacao_on_insert:
--         B e C → adicionam AND ativo = true
--         D     → novo bloco: desativa versão anterior do mesmo
--                 ChaveCorrelacao quando conteúdo muda entre lotes
--    7. RLS para as novas tabelas
--    8. Backfill: popula lotes_carga com os lotes já existentes
--    9. Verificação
--
--  Princípio central:
--    Nenhum registro é deletado fisicamente.
--    Apenas o trigger e invalidações manuais marcam ativo = false.
--    O app.py apenas insere — o banco gerencia o ciclo de vida.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. CAMPOS DE SOFT DELETE NA correlacao_endoscopia
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.correlacao_endoscopia
  ADD COLUMN IF NOT EXISTS ativo                BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS desativado_em        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS desativado_por       UUID        REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS motivo_desativacao   TEXT;
  -- rollback_operacao_id adicionado na seção 4, após criar operacoes_rollback

COMMENT ON COLUMN public.correlacao_endoscopia.ativo IS
  'false = registro desativado (versão supersedida por trigger ou invalidação manual). '
  'Todas as queries operacionais devem filtrar ativo = true.';
COMMENT ON COLUMN public.correlacao_endoscopia.desativado_em IS
  'Timestamp da desativação (trigger de versioning ou invalidação manual).';
COMMENT ON COLUMN public.correlacao_endoscopia.desativado_por IS
  'UUID do usuário que invalidou manualmente. NULL = desativado pelo trigger.';
COMMENT ON COLUMN public.correlacao_endoscopia.motivo_desativacao IS
  'Texto livre: "substituído por lote YYYYMMDD_HHmmss" (trigger) '
  'ou motivo informado pelo admin no frontend.';


-- ─────────────────────────────────────────────────────────────
-- 2. TABELA operacoes_rollback
--    Livro imutável de cada invalidação manual.
--    Nunca deletar linhas desta tabela — é o histórico de auditoria.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.operacoes_rollback (
  id              UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo            TEXT        NOT NULL
                              CHECK (tipo IN ('invalidacao')),
  -- 'restauracao' pode ser adicionado futuramente
  lote_id         TEXT        NOT NULL,
  executado_por   UUID        NOT NULL REFERENCES auth.users(id),
  executado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  motivo          TEXT        NOT NULL,
  total_afetados  INT         NOT NULL DEFAULT 0,
  obs             TEXT
);

COMMENT ON TABLE public.operacoes_rollback IS
  'Registro imutável de cada operação de invalidação de carga. '
  'Nunca apagar — é o histórico de auditoria.';
COMMENT ON COLUMN public.operacoes_rollback.total_afetados IS
  'Número de registros de correlacao_endoscopia marcados ativo=false pela operação.';


-- ─────────────────────────────────────────────────────────────
-- 3. TABELA lotes_carga
--    Uma linha por execução de carga (uma por lote_processamento).
--    Criada pelo app.py antes do INSERT e atualizada pelo frontend
--    na invalidação.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lotes_carga (
  id                   UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id              TEXT        NOT NULL UNIQUE,
  -- Referencia correlacao_endoscopia.lote_processamento

  status               TEXT        NOT NULL DEFAULT 'ativo'
                                   CHECK (status IN ('ativo', 'invalidado', 'iniciado', 'erro')),

  -- Contagens calculadas pelo app.py após o INSERT
  total_inserido       INT,
  total_validos        INT,
  total_duplicatas     INT,

  -- Preenchidos na invalidação pelo frontend
  invalidado_em        TIMESTAMPTZ,
  invalidado_por       UUID        REFERENCES auth.users(id),
  motivo_invalidade    TEXT,
  rollback_operacao_id UUID,
  -- FK adicionada na seção 4

  criado_em            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.lotes_carga IS
  'Registro central de cada carga. Uma linha por lote_processamento. '
  'app.py cria a linha antes do INSERT; frontend atualiza na invalidação.';
COMMENT ON COLUMN public.lotes_carga.status IS
  'iniciado = INSERT em andamento. ativo = carga concluída com sucesso. '
  'erro = falha durante o INSERT. invalidado = descartada pelo admin.';

-- Corrige o CHECK em bancos que já tinham a tabela com os valores antigos.
-- Idempotente: DROP IF EXISTS não falha se o constraint não existir.
ALTER TABLE public.lotes_carga
  DROP CONSTRAINT IF EXISTS lotes_carga_status_check;
ALTER TABLE public.lotes_carga
  ADD CONSTRAINT lotes_carga_status_check
  CHECK (status IN ('ativo', 'invalidado', 'iniciado', 'erro'));


-- ─────────────────────────────────────────────────────────────
-- 4. FK rollback_operacao_id (retroativa, dependia das tabelas acima)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.correlacao_endoscopia
  ADD COLUMN IF NOT EXISTS rollback_operacao_id UUID
    REFERENCES public.operacoes_rollback(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname    = 'lotes_carga_rollback_fk'
       AND conrelid   = 'public.lotes_carga'::regclass
  ) THEN
    ALTER TABLE public.lotes_carga
      ADD CONSTRAINT lotes_carga_rollback_fk
      FOREIGN KEY (rollback_operacao_id)
      REFERENCES public.operacoes_rollback(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

COMMENT ON COLUMN public.correlacao_endoscopia.rollback_operacao_id IS
  'Referência à operação de invalidação que desativou este registro (NULL = trigger de versioning).';
COMMENT ON COLUMN public.lotes_carga.rollback_operacao_id IS
  'Operação de invalidação que alterou o status deste lote.';


-- ─────────────────────────────────────────────────────────────
-- 5. ÍNDICES ATUALIZADOS
--    Os índices parciais do trigger e das queries operacionais
--    precisam do filtro ativo = true para permanecer eficientes.
-- ─────────────────────────────────────────────────────────────

-- ── Trigger BEFORE INSERT (críticos) ─────────────────────────

-- B. Detecção de duplicata cross-lote
DROP INDEX IF EXISTS corr_hash_canonical_idx;
CREATE INDEX corr_hash_canonical_idx
  ON public.correlacao_endoscopia (hash_conteudo)
  WHERE is_duplicata = false AND ativo = true;

-- C. Carry-over de decisão humana
DROP INDEX IF EXISTS corr_chave_decisao_idx;
CREATE INDEX corr_chave_decisao_idx
  ON public.correlacao_endoscopia ("ChaveCorrelacao", decisao_humana)
  WHERE is_duplicata = false AND decisao_humana IS NOT NULL AND ativo = true;

-- D. Versioning — lookup de versão anterior ativa
CREATE INDEX IF NOT EXISTS corr_chave_ativo_nao_dup_idx
  ON public.correlacao_endoscopia ("ChaveCorrelacao")
  WHERE ativo = true AND is_duplicata = false;

-- ── Queries operacionais (frontend) ──────────────────────────

DROP INDEX IF EXISTS corr_status_correlacao_idx;
CREATE INDEX corr_status_correlacao_idx
  ON public.correlacao_endoscopia ("StatusCorrelacao")
  WHERE is_duplicata = false AND ativo = true;

DROP INDEX IF EXISTS corr_status_tuss_idx;
CREATE INDEX corr_status_tuss_idx
  ON public.correlacao_endoscopia ("StatusTUSS")
  WHERE is_duplicata = false AND ativo = true;

DROP INDEX IF EXISTS corr_metodo_match_idx;
CREATE INDEX corr_metodo_match_idx
  ON public.correlacao_endoscopia ("MetodoMatch")
  WHERE is_duplicata = false AND ativo = true;

DROP INDEX IF EXISTS corr_data_producao_idx;
CREATE INDEX corr_data_producao_idx
  ON public.correlacao_endoscopia ("Data_PRODUCAO" DESC NULLS LAST)
  WHERE is_duplicata = false AND ativo = true;

DROP INDEX IF EXISTS corr_pendentes_revisao_idx;
CREATE INDEX corr_pendentes_revisao_idx
  ON public.correlacao_endoscopia (decisao_humana)
  WHERE is_duplicata = false AND decisao_humana IS NULL AND ativo = true;

-- Gestão de lotes + soft delete (queries por lote e por ativo)
CREATE INDEX IF NOT EXISTS corr_ativo_lote_idx
  ON public.correlacao_endoscopia (lote_processamento, ativo);


-- ─────────────────────────────────────────────────────────────
-- 6. TRIGGER enrich_correlacao_on_insert ATUALIZADO
--
--    Blocos B e C: adicionam AND ativo = true nos lookups.
--    Bloco D (novo): se o registro não é duplicata, verifica se
--    já existe uma versão ativa do mesmo ChaveCorrelacao em outro
--    lote. Caso exista → desativa o registro antigo e registra
--    o motivo ("substituído por lote YYYYMMDD_HHmmss").
--
--    Nota de visibilidade intra-batch:
--    Rows inseridos no mesmo statement não se enxergam (isolamento
--    do PostgreSQL). O bloco D só detecta versões de OUTROS lotes
--    já confirmados no banco — o comportamento esperado.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enrich_correlacao_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_canonical_id   UUID;
  v_old_version_id UUID;
  v_decisao        RECORD;
BEGIN

  -- ── A. Calcular hash_conteudo ────────────────────────────────
  NEW.hash_conteudo := md5(
    coalesce(NEW."ChaveCorrelacao",                  '') || '|' ||
    coalesce(NEW."StatusTUSS",                       '') || '|' ||
    coalesce(NEW."CodigosTUSS_Esperados",            '') || '|' ||
    coalesce(NEW."MetodoMatch",                      '') || '|' ||
    coalesce(NEW."ProcedimentosAdicionais_PRODUCAO", '') || '|' ||
    coalesce(NEW."MedicoExecutor_REPASSE",           '') || '|' ||
    coalesce(NEW."NrRepasse_REPASSE",                '') || '|' ||
    coalesce(NEW."AbaOrigemDados_REPASSE",           '') || '|' ||
    coalesce(NEW."ValorLiberado_REPASSE"::text,      '') || '|' ||
    coalesce(NEW."NrInternoConta_REPASSE",           '') || '|' ||
    coalesce(NEW."Via_REPASSE",                      '')
  );

  -- ── B. Detectar duplicata cross-lote ────────────────────────
  --    Busca linha canônica ATIVA com mesmo hash em outro lote.
  --    Duplicatas intra-lote: tratadas pelo UNIQUE constraint.
  SELECT id
    INTO v_canonical_id
    FROM public.correlacao_endoscopia
   WHERE hash_conteudo      = NEW.hash_conteudo
     AND lote_processamento != NEW.lote_processamento
     AND is_duplicata        = false
     AND ativo               = true               -- ← só canônicos ativos
   ORDER BY criado_em ASC
   LIMIT 1;

  IF FOUND THEN
    NEW.is_duplicata := true;
    NEW.id_original  := v_canonical_id;
  ELSE
    NEW.is_duplicata := false;
    NEW.id_original  := NULL;
  END IF;

  -- ── C. Carry-over da decisão humana ─────────────────────────
  --    Busca a decisão mais recente para o mesmo ChaveCorrelacao
  --    em registros ATIVOS de qualquer lote (exceto duplicatas).
  SELECT decisao_humana, revisado_em, notas_revisor
    INTO v_decisao
    FROM public.correlacao_endoscopia
   WHERE "ChaveCorrelacao" = NEW."ChaveCorrelacao"
     AND decisao_humana    IS NOT NULL
     AND is_duplicata       = false
     AND ativo              = true               -- ← só registros ativos
   ORDER BY criado_em DESC
   LIMIT 1;

  IF FOUND THEN
    NEW.decisao_humana := v_decisao.decisao_humana;
    NEW.revisado_em    := v_decisao.revisado_em;
    NEW.notas_revisor  := v_decisao.notas_revisor;
  END IF;

  -- ── D. Versionamento ─────────────────────────────────────────
  --    Se este registro NÃO é duplicata (conteúdo novo ou diferente),
  --    verifica se existe uma versão ativa do mesmo ChaveCorrelacao
  --    em outro lote. Se sim → desativa a versão anterior.
  --
  --    Cenário típico: carga mensal de Janeiro é reprocessada com
  --    resultado diferente (motor corrigiu um match). O registro
  --    antigo de Janeiro é desativado; o novo assume.
  --
  --    Cargas de meses distintos (datas diferentes no ChaveCorrelacao)
  --    NÃO colidiram em testes — ChaveCorrelacao inclui a data.
  IF NEW.is_duplicata = false THEN

    SELECT id
      INTO v_old_version_id
      FROM public.correlacao_endoscopia
     WHERE "ChaveCorrelacao" = NEW."ChaveCorrelacao"
       AND lote_processamento != NEW.lote_processamento
       AND is_duplicata        = false
       AND ativo               = true
     ORDER BY criado_em DESC
     LIMIT 1;

    IF FOUND THEN
      UPDATE public.correlacao_endoscopia
         SET ativo              = false,
             desativado_em      = NOW(),
             motivo_desativacao = 'substituído por lote ' || NEW.lote_processamento
       WHERE id = v_old_version_id;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- O nome e o binding do trigger não mudam — apenas a função foi substituída.
-- DROP + CREATE garante que o trigger continua apontando para a versão nova.
DROP TRIGGER IF EXISTS correlacao_enrich_on_insert ON public.correlacao_endoscopia;

CREATE TRIGGER correlacao_enrich_on_insert
  BEFORE INSERT ON public.correlacao_endoscopia
  FOR EACH ROW
  EXECUTE FUNCTION public.enrich_correlacao_on_insert();

COMMENT ON FUNCTION public.enrich_correlacao_on_insert IS
  'BEFORE INSERT: (A) hash_conteudo, (B) duplicata cross-lote [ativo=true], '
  '(C) carry-over decisao_humana [ativo=true], '
  '(D) versioning: desativa versão anterior do mesmo ChaveCorrelacao.';


-- ─────────────────────────────────────────────────────────────
-- 7. ROW LEVEL SECURITY NAS NOVAS TABELAS
-- ─────────────────────────────────────────────────────────────

-- ── operacoes_rollback ────────────────────────────────────────

ALTER TABLE public.operacoes_rollback ENABLE ROW LEVEL SECURITY;

-- Todos os autenticados podem ler (auditoria visível)
DROP POLICY IF EXISTS "rollback: authenticated read" ON public.operacoes_rollback;
CREATE POLICY "rollback: authenticated read"
  ON public.operacoes_rollback
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Apenas admin escreve (INSERT na invalidação)
DROP POLICY IF EXISTS "rollback: admin insert" ON public.operacoes_rollback;
CREATE POLICY "rollback: admin insert"
  ON public.operacoes_rollback
  FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

-- ── lotes_carga ───────────────────────────────────────────────

ALTER TABLE public.lotes_carga ENABLE ROW LEVEL SECURITY;

-- Todos os autenticados leem (page Carregamentos)
DROP POLICY IF EXISTS "lotes_carga: authenticated read" ON public.lotes_carga;
CREATE POLICY "lotes_carga: authenticated read"
  ON public.lotes_carga
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- editor e admin escrevem (app.py usa service key; frontend usa admin)
DROP POLICY IF EXISTS "lotes_carga: editor/admin write" ON public.lotes_carga;
CREATE POLICY "lotes_carga: editor/admin write"
  ON public.lotes_carga
  FOR ALL
  USING  (public.get_my_role() IN ('editor', 'admin'))
  WITH CHECK (public.get_my_role() IN ('editor', 'admin'));


-- ─────────────────────────────────────────────────────────────
-- 8. BACKFILL lotes_carga
--    Popula a tabela com os lotes já existentes em
--    correlacao_endoscopia (dados históricos pré-migration).
--    Idempotente: ON CONFLICT DO NOTHING.
-- ─────────────────────────────────────────────────────────────

INSERT INTO public.lotes_carga (
  lote_id,
  status,
  total_inserido,
  total_validos,
  total_duplicatas,
  criado_em
)
SELECT
  lote_processamento                                           AS lote_id,
  'ativo'                                                      AS status,
  COUNT(*)                                                     AS total_inserido,
  COUNT(*) FILTER (WHERE NOT is_duplicata)                     AS total_validos,
  COUNT(*) FILTER (WHERE is_duplicata)                         AS total_duplicatas,
  MIN(criado_em)                                               AS criado_em
FROM public.correlacao_endoscopia
GROUP BY lote_processamento
ON CONFLICT (lote_id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 9. VERIFICAÇÃO
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_col_ativo      BOOLEAN;
  v_col_rollback   BOOLEAN;
  v_tbl_rollback   BOOLEAN;
  v_tbl_lotes      BOOLEAN;
  v_n_lotes        INTEGER;
  v_trig_ok        BOOLEAN;
  v_idx_hash       BOOLEAN;
  v_idx_chave_ativo BOOLEAN;
BEGIN
  -- colunas novas em correlacao_endoscopia
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'correlacao_endoscopia'
       AND column_name  = 'ativo'
  ) INTO v_col_ativo;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'correlacao_endoscopia'
       AND column_name  = 'rollback_operacao_id'
  ) INTO v_col_rollback;

  -- tabelas novas
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'operacoes_rollback'
  ) INTO v_tbl_rollback;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'lotes_carga'
  ) INTO v_tbl_lotes;

  -- linhas backfilladas em lotes_carga
  SELECT COUNT(*) FROM public.lotes_carga INTO v_n_lotes;

  -- trigger atualizado
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'correlacao_enrich_on_insert'
  ) INTO v_trig_ok;

  -- índices críticos com filtro ativo = true
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename  = 'correlacao_endoscopia'
       AND indexname  = 'corr_hash_canonical_idx'
  ) INTO v_idx_hash;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename  = 'correlacao_endoscopia'
       AND indexname  = 'corr_chave_ativo_nao_dup_idx'
  ) INTO v_idx_chave_ativo;

  RAISE NOTICE '=== Rollback Migration Check ===';
  RAISE NOTICE 'Coluna ativo .............. %', CASE WHEN v_col_ativo      THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE 'Coluna rollback_op_id ..... %', CASE WHEN v_col_rollback   THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE 'Tabela operacoes_rollback . %', CASE WHEN v_tbl_rollback   THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE 'Tabela lotes_carga ........ %', CASE WHEN v_tbl_lotes      THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE 'Trigger enrich ............ %', CASE WHEN v_trig_ok        THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE 'Índice hash (ativo=true) .. %', CASE WHEN v_idx_hash       THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE 'Índice chave_ativo ........ %', CASE WHEN v_idx_chave_ativo THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE 'Lotes backfillados ........ %', v_n_lotes;
  RAISE NOTICE '================================';
  RAISE NOTICE '';
  RAISE NOTICE '▶ Próximos passos:';
  RAISE NOTICE '  1. backend/app.py — remover DELETE de lotes anteriores;';
  RAISE NOTICE '     adicionar INSERT em lotes_carga antes do upsert.';
  RAISE NOTICE '  2. hooks/useCorrelacoes.ts — adicionar .eq(ativo, true).';
  RAISE NOTICE '  3. hooks/useCarregamentos.ts — ler lotes_carga para status.';
  RAISE NOTICE '  4. app/carregamentos/page.tsx — modal de invalidação.';
END;
$$;


-- ============================================================
--  PÓS-INSTALAÇÃO
-- ============================================================
--
--  Como funciona o ciclo de vida dos registros:
--
--    INSERT (app.py)
--      → trigger D desativa versão anterior do mesmo ChaveCorrelacao
--        em outro lote (motivo: "substituído por lote YYYYMMDD_HHmmss")
--      → trigger B/C com AND ativo=true: só enxerga canônicos ativos
--
--    Invalidação manual (frontend — admin only)
--      → INSERT operacoes_rollback
--      → UPDATE correlacao_endoscopia SET ativo=false, motivo, rollback_id
--      → UPDATE lotes_carga SET status='invalidado', rollback_id
--
--    Queries operacionais (auditoria, dashboard, faturamento)
--      → sempre filtrar ativo = true AND is_duplicata = false
--
--  O que NÃO acontece mais:
--    • app.py nunca mais executa DELETE em correlacao_endoscopia
--    • Nenhum dado histórico é perdido
-- ============================================================
