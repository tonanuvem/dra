-- ============================================================
--  Correlação Endoscopia — Tabela Principal
--  Execute no SQL Editor do Supabase (uma vez).
--
--  Pré-requisito: rbac-migration.sql já executado (get_my_role).
--
--  Seções:
--    1. Extensão pg_trgm
--    2. CREATE TABLE correlacao_endoscopia
--    3. UNIQUE INDEX parcial (lote_processamento, hash_conteudo) WHERE is_duplicata=false
--    4. Índices de performance
--    5. RLS policies
--    6. Trigger de enriquecimento no INSERT
--       → computa hash_conteudo, is_duplicata, id_original
--       → faz carry-over de decisao_humana/revisado_em/notas_revisor
--    7. Trigger de auditoria no UPDATE (revisado_em automático)
--    8. Verificação
--
--  Responsabilidades por campo:
--
--    app.py envia apenas:
--      • lote_processamento  (sufixo do nome do arquivo CSV)
--      • todos os 46 campos de dados do CSV
--
--    Supabase/DB preenche automaticamente:
--      • id              → DEFAULT gen_random_uuid()
--      • criado_em       → DEFAULT NOW()
--      • hash_conteudo   → trigger BEFORE INSERT (MD5 de 11 campos)
--      • is_duplicata    → trigger BEFORE INSERT (cross-lote)
--      • id_original     → trigger BEFORE INSERT (UUID da linha canônica)
--      • decisao_humana  → trigger BEFORE INSERT (carry-over do lote anterior)
--      • revisado_em     → trigger BEFORE INSERT (carry-over) +
--                          trigger BEFORE UPDATE (quando auditor decide)
--      • notas_revisor   → trigger BEFORE INSERT (carry-over)
--
--  Estratégia de carga no app.py:
--    INCREMENTAL  →  INSERT direto (sem DELETE prévio)
--    RECARGA TOTAL → INSERT novo lote ANTES de DELETE do lote antigo
--                    (garante carry-over de decisões pelo trigger)
--
--  Duplicatas dentro do mesmo lote (intra-batch):
--    Tratadas pelo UNIQUE(lote_processamento, hash_conteudo) +
--    ON CONFLICT DO NOTHING no upsert do app.py. O trigger não
--    precisa lidar com elas.
--
--  Duplicatas entre lotes distintos (cross-lote):
--    Detectadas pelo trigger: is_duplicata = true, id_original = UUID canônico.
--
--  Após executar, ative o filtro server-side "pendentes de revisão":
--    frontend/hooks/useCorrelacoes.ts  →  AUDIT_COLUMNS_EXIST = true
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. EXTENSÃO pg_trgm
--    Suporta buscas ilike '%termo%' via índice GIN trigram
-- ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- ─────────────────────────────────────────────────────────────
-- 2. TABELA PRINCIPAL
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.correlacao_endoscopia (

  -- ── Chave surrogada ───────────────────────────────────────
  id                                   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  -- ── Controle de lote ─────────────────────────────────────
  --    Extraído do nome do arquivo CSV pelo app.py
  --    Formato: "YYYYMMDD_HHmmss"  ex: "20260527_181451"
  lote_processamento                   TEXT        NOT NULL,

  -- ── Assinatura do conteúdo (preenchida pelo trigger) ─────
  --    MD5 dos 11 campos aprovados. Calculado BEFORE INSERT.
  --    Nunca enviar pelo app.py — será sobrescrito pelo trigger.
  hash_conteudo                        TEXT        NOT NULL,

  -- ── Marcadores de duplicidade (preenchidos pelo trigger) ──
  is_duplicata                         BOOLEAN     NOT NULL DEFAULT false,
  id_original                          UUID        REFERENCES public.correlacao_endoscopia(id)
                                                   ON DELETE SET NULL,

  -- ── Timestamp de ingestão ────────────────────────────────
  criado_em                            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ── Colunas PRODUÇÃO (arquivo da clínica) ─────────────────
  "QTD_PRODUCAO"                       INTEGER,
  "Data_PRODUCAO"                      DATE,
  "Paciente_PRODUCAO"                  TEXT,
  "NrAtendimento_PRODUCAO"             TEXT,
  "Convenio_PRODUCAO"                  TEXT,
  "Origem_PRODUCAO"                    TEXT,
  "Procedimento_PRODUCAO"              TEXT,
  "ProcedimentosAdicionais_PRODUCAO"   TEXT,
  "MedicoExecutor_PRODUCAO"            TEXT,
  "LocalSetor_PRODUCAO"                TEXT,
  "Sala_PRODUCAO"                      TEXT,
  "Carater_PRODUCAO"                   TEXT,
  "Observacao_PRODUCAO"                TEXT,
  "AbaOrigemDados_PRODUCAO"            TEXT,

  -- ── Colunas de correlação (output do motor Python) ────────
  "ChaveCorrelacao"                    TEXT        NOT NULL,
  "SimilaridadeProcedimento"           NUMERIC(5, 4),
  "MetodoMatch"                        TEXT,
  "StatusCorrelacao"                   TEXT
                                       CHECK ("StatusCorrelacao" IN (
                                         'CORRELACIONADO',
                                         'NAO_FATURADO_NO_REPASSE',
                                         'REPASSE_NAO_IDENTIFICADO_NA_PRODUCAO',
                                         'REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO'
                                       )),

  -- ── Colunas REPASSE (arquivo do hospital) ─────────────────
  "Estabelecimento_REPASSE"            TEXT,
  "CNPJ_REPASSE"                       TEXT,
  "Terceiro_REPASSE"                   TEXT,
  "Status_REPASSE"                     TEXT,
  "NrRepasse_REPASSE"                  TEXT,
  "TipoItem_REPASSE"                   TEXT,
  "NrAtendimento_REPASSE"              TEXT,
  "TipoAtendimento_REPASSE"            TEXT,
  "NrInternoConta_REPASSE"             TEXT,
  "Paciente_REPASSE"                   TEXT,
  "Convenio_REPASSE"                   TEXT,
  "Categoria_REPASSE"                  TEXT,
  "CodigoTUSS_REPASSE"                 TEXT,
  "Procedimento_REPASSE"               TEXT,
  "Via_REPASSE"                        TEXT,
  "MedicoExecutor_REPASSE"             TEXT,
  "Porcentagem_REPASSE"                NUMERIC(5, 2),
  "Funcao_REPASSE"                     TEXT,
  "Especialidade_REPASSE"              TEXT,
  "QtProcedimento_REPASSE"             INTEGER,
  "Data_REPASSE"                       DATE,
  "ValorLiberado_REPASSE"              NUMERIC(12, 2),
  "AbaOrigemDados_REPASSE"             TEXT,

  -- ── Colunas TUSS (enriquecimento pós-correlação) ──────────
  "StatusTUSS"                         TEXT,
  "CodigosTUSS_Esperados"              TEXT,
  "DescricaoTUSS"                      TEXT,
  "CodigosTUSS_Ausentes"               TEXT,
  "ValorEstimado_TUSS"                 NUMERIC(12, 2),

  -- ── Auditoria humana ──────────────────────────────────────
  --    Preenchidos pelo frontend (DecisionButtons).
  --    Carry-over automático pelo trigger BEFORE INSERT.
  decisao_humana                       TEXT
                                       CHECK (decisao_humana IN (
                                         'confirmado', 'desvinculado'
                                       )),
  revisado_em                          TIMESTAMPTZ,
  notas_revisor                        TEXT
);

COMMENT ON TABLE public.correlacao_endoscopia IS
  'Resultado do motor de correlação Python: linhas da PRODUCAO (clínica) cruzadas com o REPASSE (hospital).';

COMMENT ON COLUMN public.correlacao_endoscopia.lote_processamento IS
  'Sufixo do arquivo CSV gerado pelo motor: "YYYYMMDD_HHmmss". Permite identificar e limpar lotes.';
COMMENT ON COLUMN public.correlacao_endoscopia.hash_conteudo IS
  'MD5 de 8 campos de input bruto (imutáveis). Calculado pelo trigger BEFORE INSERT — não enviar pelo app.py. '
  'Colunas derivadas (StatusTUSS, MetodoMatch, CodigosTUSS_Esperados) foram excluídas para estabilidade entre reprocessamentos.';
COMMENT ON COLUMN public.correlacao_endoscopia.is_duplicata IS
  'true = linha já existe em lote anterior com conteúdo idêntico. Oculta no frontend por padrão.';
COMMENT ON COLUMN public.correlacao_endoscopia.id_original IS
  'UUID da linha canônica (is_duplicata=false) quando este registro é uma duplicata cross-lote.';
COMMENT ON COLUMN public.correlacao_endoscopia."ChaveCorrelacao" IS
  'Chave natural do motor Python: paciente_norm + nr_atendimento + data + procedimento_norm.';
COMMENT ON COLUMN public.correlacao_endoscopia."StatusCorrelacao" IS
  'Status simplificado. Glosa derivada comparando ValorLiberado_REPASSE vs ValorEstimado_TUSS.';
COMMENT ON COLUMN public.correlacao_endoscopia.decisao_humana IS
  'Decisão do auditor: confirmado | desvinculado | NULL (pendente). Carry-over automático entre lotes.';


-- ─────────────────────────────────────────────────────────────
-- 3. UNIQUE INDEX PARCIAL
--    Garante unicidade de (lote, hash) apenas para registros
--    canônicos (is_duplicata = false). Permite que duplicatas
--    cross-lote coexistam com o mesmo hash em lotes distintos.
--    Duplicatas intra-lote são silenciadas via ON CONFLICT DO NOTHING.
--
--    O trigger BEFORE INSERT seta is_duplicata antes da checagem
--    do índice, então o fluxo é seguro sem race conditions.
-- ─────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS correlacao_lote_hash_nodup_uniq
  ON public.correlacao_endoscopia (lote_processamento, hash_conteudo)
  WHERE is_duplicata = false;


-- ─────────────────────────────────────────────────────────────
-- 4. ÍNDICES DE PERFORMANCE
-- ─────────────────────────────────────────────────────────────

-- ── Usados pelo trigger BEFORE INSERT (críticos) ─────────────

-- Detecção de duplicatas cross-lote: SELECT por hash_conteudo
CREATE INDEX IF NOT EXISTS corr_hash_canonical_idx
  ON public.correlacao_endoscopia (hash_conteudo)
  WHERE is_duplicata = false;

-- Carry-over de decisões: SELECT por ChaveCorrelacao + decisao_humana
CREATE INDEX IF NOT EXISTS corr_chave_decisao_idx
  ON public.correlacao_endoscopia ("ChaveCorrelacao", decisao_humana)
  WHERE is_duplicata = false AND decisao_humana IS NOT NULL;

-- ── Usados pelas queries do frontend ─────────────────────────

-- Filtros de status (auditoria, faturamento, dashboard)
CREATE INDEX IF NOT EXISTS corr_status_correlacao_idx
  ON public.correlacao_endoscopia ("StatusCorrelacao")
  WHERE is_duplicata = false;

CREATE INDEX IF NOT EXISTS corr_status_tuss_idx
  ON public.correlacao_endoscopia ("StatusTUSS")
  WHERE is_duplicata = false;

CREATE INDEX IF NOT EXISTS corr_metodo_match_idx
  ON public.correlacao_endoscopia ("MetodoMatch")
  WHERE is_duplicata = false;

-- Ordenação padrão do hook (Data_PRODUCAO DESC)
CREATE INDEX IF NOT EXISTS corr_data_producao_idx
  ON public.correlacao_endoscopia ("Data_PRODUCAO" DESC NULLS LAST)
  WHERE is_duplicata = false;

-- Fila de revisão pendente
CREATE INDEX IF NOT EXISTS corr_pendentes_revisao_idx
  ON public.correlacao_endoscopia (decisao_humana)
  WHERE is_duplicata = false AND decisao_humana IS NULL;

-- Busca por nome de paciente (ilike '%termo%' via trigram)
CREATE INDEX IF NOT EXISTS corr_paciente_prod_trgm_idx
  ON public.correlacao_endoscopia USING gin ("Paciente_PRODUCAO" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS corr_paciente_rep_trgm_idx
  ON public.correlacao_endoscopia USING gin ("Paciente_REPASSE" gin_trgm_ops);

-- ── Gestão de lotes (DELETE por lote no app.py) ───────────────
CREATE INDEX IF NOT EXISTS corr_lote_idx
  ON public.correlacao_endoscopia (lote_processamento);


-- ─────────────────────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY
--    Depende de get_my_role() (rbac-migration.sql)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.correlacao_endoscopia ENABLE ROW LEVEL SECURITY;

-- Leitura: todos os usuários autenticados (qualquer role)
DROP POLICY IF EXISTS "correlacao: authenticated read" ON public.correlacao_endoscopia;
CREATE POLICY "correlacao: authenticated read"
  ON public.correlacao_endoscopia
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Inserção: editor e admin (upload de lotes pelo app.py)
DROP POLICY IF EXISTS "correlacao: editor/admin insert" ON public.correlacao_endoscopia;
CREATE POLICY "correlacao: editor/admin insert"
  ON public.correlacao_endoscopia
  FOR INSERT
  WITH CHECK (public.get_my_role() IN ('editor', 'admin'));

-- Atualização: editor e admin
--   Cobre decisões de auditoria (decisao_humana, revisado_em, notas_revisor)
--   e eventuais correções de dados
DROP POLICY IF EXISTS "correlacao: editor/admin update" ON public.correlacao_endoscopia;
CREATE POLICY "correlacao: editor/admin update"
  ON public.correlacao_endoscopia
  FOR UPDATE
  USING  (public.get_my_role() IN ('editor', 'admin'))
  WITH CHECK (public.get_my_role() IN ('editor', 'admin'));

-- Deleção: apenas admin (limpar lote antigo após carga de novo lote)
DROP POLICY IF EXISTS "correlacao: admin delete" ON public.correlacao_endoscopia;
CREATE POLICY "correlacao: admin delete"
  ON public.correlacao_endoscopia
  FOR DELETE
  USING (public.get_my_role() = 'admin');


-- ─────────────────────────────────────────────────────────────
-- 6. TRIGGER DE ENRIQUECIMENTO NO INSERT
--
--    Responsabilidades (BEFORE INSERT, FOR EACH ROW):
--      A. Calcular hash_conteudo (MD5 dos 11 campos aprovados)
--      B. Detectar duplicatas cross-lote (mesmo hash, lote diferente)
--         → is_duplicata = true, id_original = UUID canônico
--      C. Carry-over da decisão humana mais recente para o mesmo
--         ChaveCorrelacao (qualquer lote, is_duplicata = false)
--
--    Campos que determinam o hash (8 — apenas input bruto, imutáveis):
--      ChaveCorrelacao, ProcedimentosAdicionais_PRODUCAO,
--      MedicoExecutor_REPASSE, NrRepasse_REPASSE,
--      AbaOrigemDados_REPASSE, ValorLiberado_REPASSE,
--      NrInternoConta_REPASSE, Via_REPASSE
--
--    Excluídos do hash (colunas derivadas/mutáveis):
--      StatusTUSS            → muda quando algoritmo de enriquecimento muda
--      CodigosTUSS_Esperados → muda quando lookup table é atualizado
--      MetodoMatch           → muda quando motor de correlação melhora
--    Incluí-las causava detecção falsa de duplicatas entre lotes re-processados.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enrich_correlacao_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_canonical_id  UUID;
  v_decisao       RECORD;
BEGIN
  -- ── A. Calcular hash_conteudo ────────────────────────────
  --    Separador '|' entre campos; coalesce garante que NULL → ''
  --    ValorLiberado_REPASSE é NUMERIC → cast para TEXT
  -- Apenas colunas de input bruto — imutáveis entre reprocessamentos.
  -- StatusTUSS, CodigosTUSS_Esperados e MetodoMatch foram excluídos:
  -- são colunas derivadas que mudam quando o motor Python é atualizado,
  -- o que causava detecção falsa de duplicatas cross-lote.
  NEW.hash_conteudo := md5(
    coalesce(NEW."ChaveCorrelacao",                  '') || '|' ||
    coalesce(NEW."ProcedimentosAdicionais_PRODUCAO", '') || '|' ||
    coalesce(NEW."MedicoExecutor_REPASSE",           '') || '|' ||
    coalesce(NEW."NrRepasse_REPASSE",                '') || '|' ||
    coalesce(NEW."AbaOrigemDados_REPASSE",           '') || '|' ||
    coalesce(NEW."ValorLiberado_REPASSE"::text,      '') || '|' ||
    coalesce(NEW."NrInternoConta_REPASSE",           '') || '|' ||
    coalesce(NEW."Via_REPASSE",                      '')
  );

  -- ── B. Detectar duplicata cross-lote ────────────────────
  --    Busca linha canônica com mesmo hash em OUTRO lote.
  --    Duplicatas intra-lote são tratadas pelo UNIQUE constraint
  --    + ON CONFLICT DO NOTHING no app.py (nunca chegam aqui).
  SELECT id
    INTO v_canonical_id
    FROM public.correlacao_endoscopia
   WHERE hash_conteudo      = NEW.hash_conteudo
     AND lote_processamento != NEW.lote_processamento
     AND is_duplicata        = false
   ORDER BY criado_em ASC   -- mais antigo = canônico
   LIMIT 1;

  IF FOUND THEN
    NEW.is_duplicata := true;
    NEW.id_original  := v_canonical_id;
  ELSE
    NEW.is_duplicata := false;
    NEW.id_original  := NULL;
  END IF;

  -- ── C. Carry-over da decisão humana ─────────────────────
  --    Busca a decisão mais recente para o mesmo ChaveCorrelacao
  --    em qualquer lote (exceto duplicatas).
  --    Garante que decisões dos auditores sobrevivem à recarga.
  SELECT decisao_humana, revisado_em, notas_revisor
    INTO v_decisao
    FROM public.correlacao_endoscopia
   WHERE "ChaveCorrelacao" = NEW."ChaveCorrelacao"
     AND decisao_humana    IS NOT NULL
     AND is_duplicata       = false
   ORDER BY criado_em DESC   -- decisão mais recente
   LIMIT 1;

  IF FOUND THEN
    NEW.decisao_humana := v_decisao.decisao_humana;
    NEW.revisado_em    := v_decisao.revisado_em;
    NEW.notas_revisor  := v_decisao.notas_revisor;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS correlacao_enrich_on_insert ON public.correlacao_endoscopia;

CREATE TRIGGER correlacao_enrich_on_insert
  BEFORE INSERT ON public.correlacao_endoscopia
  FOR EACH ROW
  EXECUTE FUNCTION public.enrich_correlacao_on_insert();

COMMENT ON FUNCTION public.enrich_correlacao_on_insert IS
  'BEFORE INSERT: calcula hash_conteudo (MD5/8 campos de input bruto), detecta duplicatas cross-lote '
  'e faz carry-over de decisao_humana/revisado_em/notas_revisor do lote anterior.';


-- ─────────────────────────────────────────────────────────────
-- 7. TRIGGER DE AUDITORIA NO UPDATE
--    Preenche revisado_em automaticamente quando o auditor
--    altera decisao_humana pelo frontend (DecisionButtons).
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_revisado_em()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Preenche revisado_em quando decisao_humana muda e o
  -- chamador não informou explicitamente um novo revisado_em
  IF NEW.decisao_humana IS DISTINCT FROM OLD.decisao_humana
     AND NEW.revisado_em IS NOT DISTINCT FROM OLD.revisado_em THEN
    NEW.revisado_em := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS correlacao_audit_touch ON public.correlacao_endoscopia;

CREATE TRIGGER correlacao_audit_touch
  BEFORE UPDATE ON public.correlacao_endoscopia
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_revisado_em();

COMMENT ON FUNCTION public.touch_revisado_em IS
  'BEFORE UPDATE: preenche revisado_em = NOW() quando decisao_humana é alterada pelo frontend.';


-- ─────────────────────────────────────────────────────────────
-- 8. VERIFICAÇÃO
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_table    BOOLEAN;
  v_uniq     BOOLEAN;
  v_rls      BOOLEAN;
  v_trig_ins BOOLEAN;
  v_trig_upd BOOLEAN;
  v_n_idx    INTEGER;
  v_n_cols   INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'correlacao_endoscopia'
  ) INTO v_table;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename  = 'correlacao_endoscopia'
       AND indexname  = 'correlacao_lote_hash_nodup_uniq'
  ) INTO v_uniq;

  SELECT relrowsecurity
    FROM pg_class
   WHERE relnamespace = 'public'::regnamespace
     AND relname = 'correlacao_endoscopia'
  INTO v_rls;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'correlacao_enrich_on_insert'
  ) INTO v_trig_ins;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'correlacao_audit_touch'
  ) INTO v_trig_upd;

  SELECT COUNT(*)
    FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'correlacao_endoscopia'
  INTO v_n_idx;

  SELECT COUNT(*)
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'correlacao_endoscopia'
  INTO v_n_cols;

  RAISE NOTICE '=== correlacao_endoscopia Migration Check ===';
  RAISE NOTICE 'Tabela criada ............. %', CASE WHEN v_table    THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE 'UNIQUE lote+hash .......... %', CASE WHEN v_uniq     THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE 'RLS ativado ............... %', CASE WHEN v_rls      THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE 'Trigger enrich_on_insert .. %', CASE WHEN v_trig_ins THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE 'Trigger audit_touch ....... %', CASE WHEN v_trig_upd THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE 'Colunas criadas ........... %', v_n_cols;
  RAISE NOTICE 'Índices criados ........... %', v_n_idx;
  RAISE NOTICE '=============================================';
  RAISE NOTICE '';
  RAISE NOTICE '▶ Próximos passos:';
  RAISE NOTICE '  1. Ajustar app.py — seção "Recarregar Dados no Supabase"';
  RAISE NOTICE '     • Extrair lote_processamento do nome do arquivo';
  RAISE NOTICE '     • Usar upsert com on_conflict=lote_processamento,hash_conteudo';
  RAISE NOTICE '     • INSERT novo lote ANTES de DELETE do lote antigo';
  RAISE NOTICE '     • Remover: cálculo de hash, carry-over manual, DELETE prévio';
  RAISE NOTICE '  2. frontend/hooks/useCorrelacoes.ts';
  RAISE NOTICE '     • AUDIT_COLUMNS_EXIST = true';
  RAISE NOTICE '     • Adicionar .eq(''is_duplicata'', false) em applyFilters()';
  RAISE NOTICE '  3. frontend/lib/types.ts';
  RAISE NOTICE '     • Adicionar: id (UUID), lote_processamento, hash_conteudo,';
  RAISE NOTICE '       is_duplicata, id_original, criado_em';
  RAISE NOTICE '  4. frontend/components/auditoria/DecisionButtons.tsx';
  RAISE NOTICE '     • Trocar .eq(ChaveCorrelacao) por .eq(id)';
END;
$$;


-- ============================================================
--  RESUMO
-- ============================================================
--
--  Tabela: public.correlacao_endoscopia
--
--  Colunas (55 total):
--    1   surrogate PK          id
--    2   controle de lote      lote_processamento
--    3   assinatura            hash_conteudo
--    2   duplicidade           is_duplicata, id_original
--    1   timestamp             criado_em
--    14  PRODUCAO              dados da clínica
--    3   correlação            ChaveCorrelacao, SimilaridadeProcedimento,
--                              MetodoMatch, StatusCorrelacao
--    15  REPASSE               dados do hospital
--    5   TUSS                  StatusTUSS, códigos, valores
--    3   auditoria humana      decisao_humana, revisado_em, notas_revisor
--
--  UNIQUE INDEX PARCIAL: (lote_processamento, hash_conteudo) WHERE is_duplicata=false
--    → intra-batch duplicates silenciados via ON CONFLICT DO NOTHING
--    → cross-lote duplicates detectados pelo trigger
--    → hash baseado em 8 campos de input bruto (StatusTUSS/MetodoMatch/
--      CodigosTUSS_Esperados excluídos por serem colunas derivadas)
--
--  Índices (10):
--    hash_conteudo WHERE is_duplicata=false    (trigger dedup)
--    ChaveCorrelacao+decisao_humana WHERE ...  (trigger carry-over)
--    StatusCorrelacao, StatusTUSS, MetodoMatch (filtros frontend)
--    Data_PRODUCAO DESC                        (ordenação padrão)
--    decisao_humana IS NULL                    (fila de revisão)
--    Paciente_PRODUCAO gin_trgm               (busca ilike)
--    Paciente_REPASSE  gin_trgm               (busca ilike)
--    lote_processamento                        (gestão de lotes)
--
--  Triggers:
--    correlacao_enrich_on_insert  BEFORE INSERT
--      → hash_conteudo, is_duplicata, id_original, carry-over decisões
--    correlacao_audit_touch       BEFORE UPDATE
--      → revisado_em = NOW() quando decisao_humana muda
--
--  RLS:
--    SELECT  → autenticados
--    INSERT  → editor, admin
--    UPDATE  → editor, admin
--    DELETE  → admin
--
-- ============================================================
