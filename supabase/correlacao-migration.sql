-- ============================================================
--  Correlação Endoscopia — Tabela Principal
--  Execute no SQL Editor do Supabase (uma vez).
--
--  Pré-requisito: rbac-migration.sql já executado (get_my_role).
--
--  Seções:
--    1. Extensão pg_trgm (busca por ilike no nome do paciente)
--    2. CREATE TABLE correlacao_endoscopia
--    3. Índices de performance
--    4. RLS policies
--    5. Trigger: preenche revisado_em automaticamente
--    6. Verificação
--
--  Após executar, ative o filtro server-side "pendentes de revisão":
--    frontend/hooks/useCorrelacoes.ts  →  AUDIT_COLUMNS_EXIST = true
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. EXTENSÃO pg_trgm
--    Necessária para os índices GIN usados em buscas ilike
--    (hook useCorrelacoes: Paciente_PRODUCAO.ilike.%termo%)
-- ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- ─────────────────────────────────────────────────────────────
-- 2. TABELA PRINCIPAL
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.correlacao_endoscopia (

  -- ── Chave natural (gerada pelo motor Python) ──────────────
  --    Formato: paciente_norm_nratend_data_proc_norm
  "ChaveCorrelacao"                    TEXT        PRIMARY KEY,

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
  "SimilaridadeProcedimento"           NUMERIC(5, 4),
  "MetodoMatch"                        TEXT,
  --   Valores: 1_NOME_COMPLETO_DATA_PROCEDIMENTO
  --            2_FALLBACK_NR-ATENDIMENTO_DATA_PROCEDIMENTO
  --            3_FALLBACK_NOME_PARCIAL_FUZZY_DATA_FIXA
  --            4_FALLBACK_NOME_COMPLETO_DATA-FLEXIVEL
  --            5_FALLBACK_COMPANION_PROCEDIMENTO_ADICIONAL
  --            SEM_MATCH
  --            + sufixo _PROCEDIMENTO_DIVERGENTE em qualquer dos 4 primeiros

  "StatusCorrelacao"                   TEXT
                                       CHECK ("StatusCorrelacao" IN (
                                         'CORRELACIONADO',
                                         'NAO_FATURADO_NO_REPASSE',
                                         'REPASSE_NAO_IDENTIFICADO_NA_PRODUCAO',
                                         'REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO'
                                       )),
  --   Glosa não é mais um status: derive comparando
  --   ValorLiberado_REPASSE vs ValorEstimado_TUSS no frontend.

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
  --   Valores: TUSS_PROC_PRINCIPAL_OK | TUSS_ADICIONAL_INCORPORADO_NO_PRINCIPAL
  --            TUSS_PROC_ADICIONAL_RECONHECIDO | TUSS_TODOS_CODIGOS_ADICIONAIS_FATURADOS
  --            TUSS_CODIGO_PRINCIPAL_DIVERGENTE | TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES
  --            TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE | TUSS_NAO_FATURADO_MAPEADO
  --            TUSS_REPASSE_SEM_PRODUCAO | TUSS_COMBINACAO_SEM_MAPEAMENTO

  "CodigosTUSS_Esperados"              TEXT,
  "DescricaoTUSS"                      TEXT,
  "CodigosTUSS_Ausentes"               TEXT,
  "ValorEstimado_TUSS"                 NUMERIC(12, 2),

  -- ── Auditoria humana ──────────────────────────────────────
  decisao_humana                       TEXT
                                       CHECK (decisao_humana IN (
                                         'confirmado', 'desvinculado'
                                       )),
  revisado_em                          TIMESTAMPTZ,
  notas_revisor                        TEXT
);

COMMENT ON TABLE public.correlacao_endoscopia IS
  'Resultado do motor de correlação Python: linhas da PRODUCAO (clínica) cruzadas com o REPASSE (hospital).';

COMMENT ON COLUMN public.correlacao_endoscopia."ChaveCorrelacao" IS
  'Chave natural: paciente_norm + nr_atendimento + data + procedimento_norm, gerada pelo motor Python.';
COMMENT ON COLUMN public.correlacao_endoscopia."MetodoMatch" IS
  'Método de correlação usado. Sufixo _PROCEDIMENTO_DIVERGENTE indica divergência anatômica detectada.';
COMMENT ON COLUMN public.correlacao_endoscopia."StatusCorrelacao" IS
  'Status simplificado. Glosa deve ser derivada no frontend: ValorLiberado_REPASSE vs ValorEstimado_TUSS.';
COMMENT ON COLUMN public.correlacao_endoscopia."ValorEstimado_TUSS" IS
  'Valor estimado com base na tabela TUSS. Usado para detectar glosa total (=0 liberado) e parcial (<95%).';
COMMENT ON COLUMN public.correlacao_endoscopia.decisao_humana IS
  'Decisão do auditor: confirmado | desvinculado | NULL (pendente de revisão).';
COMMENT ON COLUMN public.correlacao_endoscopia.revisado_em IS
  'Preenchido automaticamente pelo trigger ao alterar decisao_humana.';


-- ─────────────────────────────────────────────────────────────
-- 3. ÍNDICES
-- ─────────────────────────────────────────────────────────────

-- Filtros de status (auditoria, faturamento, dashboard)
CREATE INDEX IF NOT EXISTS corr_status_correlacao_idx
  ON public.correlacao_endoscopia ("StatusCorrelacao");

CREATE INDEX IF NOT EXISTS corr_status_tuss_idx
  ON public.correlacao_endoscopia ("StatusTUSS");

CREATE INDEX IF NOT EXISTS corr_metodo_match_idx
  ON public.correlacao_endoscopia ("MetodoMatch");

-- Ordenação padrão do hook (Data_PRODUCAO DESC)
CREATE INDEX IF NOT EXISTS corr_data_producao_idx
  ON public.correlacao_endoscopia ("Data_PRODUCAO" DESC NULLS LAST);

-- Fila de revisão: NULL = pendente (partial index — só indexa linhas pendentes)
CREATE INDEX IF NOT EXISTS corr_pendentes_revisao_idx
  ON public.correlacao_endoscopia (decisao_humana)
  WHERE decisao_humana IS NULL;

-- Busca por nome de paciente: suporta ilike '%termo%' (trigram)
CREATE INDEX IF NOT EXISTS corr_paciente_prod_trgm_idx
  ON public.correlacao_endoscopia USING gin ("Paciente_PRODUCAO" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS corr_paciente_rep_trgm_idx
  ON public.correlacao_endoscopia USING gin ("Paciente_REPASSE" gin_trgm_ops);


-- ─────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY
--    Depende de get_my_role() (rbac-migration.sql)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.correlacao_endoscopia ENABLE ROW LEVEL SECURITY;

-- 4a. Leitura: todos os usuários autenticados (qualquer role)
DROP POLICY IF EXISTS "correlacao: authenticated read" ON public.correlacao_endoscopia;
CREATE POLICY "correlacao: authenticated read"
  ON public.correlacao_endoscopia
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- 4b. Inserção: editor e admin (upload de novos processamentos via backend)
DROP POLICY IF EXISTS "correlacao: editor/admin insert" ON public.correlacao_endoscopia;
CREATE POLICY "correlacao: editor/admin insert"
  ON public.correlacao_endoscopia
  FOR INSERT
  WITH CHECK (public.get_my_role() IN ('editor', 'admin'));

-- 4c. Atualização: editor e admin
--     Cobre correções de dados E decisões de auditoria
--     (decisao_humana, revisado_em, notas_revisor)
DROP POLICY IF EXISTS "correlacao: editor/admin update" ON public.correlacao_endoscopia;
CREATE POLICY "correlacao: editor/admin update"
  ON public.correlacao_endoscopia
  FOR UPDATE
  USING  (public.get_my_role() IN ('editor', 'admin'))
  WITH CHECK (public.get_my_role() IN ('editor', 'admin'));

-- 4d. Deleção: apenas admin (limpar lote antigo antes de novo upload)
DROP POLICY IF EXISTS "correlacao: admin delete" ON public.correlacao_endoscopia;
CREATE POLICY "correlacao: admin delete"
  ON public.correlacao_endoscopia
  FOR DELETE
  USING (public.get_my_role() = 'admin');


-- ─────────────────────────────────────────────────────────────
-- 5. TRIGGER: preenche revisado_em ao registrar decisão humana
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_revisado_em()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Preenche revisado_em apenas quando decisao_humana muda e
  -- o chamador não informou explicitamente um novo revisado_em
  IF NEW.decisao_humana IS DISTINCT FROM OLD.decisao_humana
     AND NEW.revisado_em IS NOT DISTINCT FROM OLD.revisado_em THEN
    NEW.revisado_em = NOW();
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
  'Preenche revisado_em automaticamente quando decisao_humana é alterada.';


-- ─────────────────────────────────────────────────────────────
-- 6. VERIFICAÇÃO
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_table   BOOLEAN;
  v_rls     BOOLEAN;
  v_trigger BOOLEAN;
  v_n_cols  INTEGER;
  v_n_idx   INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'correlacao_endoscopia'
  ) INTO v_table;

  SELECT relrowsecurity
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname = 'correlacao_endoscopia'
  INTO v_rls;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'correlacao_audit_touch'
  ) INTO v_trigger;

  SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'correlacao_endoscopia'
  INTO v_n_cols;

  SELECT COUNT(*)
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'correlacao_endoscopia'
  INTO v_n_idx;

  RAISE NOTICE '=== correlacao_endoscopia Migration Check ===';
  RAISE NOTICE 'Tabela criada ........ %', CASE WHEN v_table   THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE 'RLS ativado .......... %', CASE WHEN v_rls     THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE 'Trigger auditoria .... %', CASE WHEN v_trigger THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE 'Colunas criadas ...... %', v_n_cols;
  RAISE NOTICE 'Índices criados ...... %', v_n_idx;
  RAISE NOTICE '=============================================';
  RAISE NOTICE '';
  RAISE NOTICE '▶ Próximo passo: ative o filtro server-side';
  RAISE NOTICE '  frontend/hooks/useCorrelacoes.ts';
  RAISE NOTICE '  const AUDIT_COLUMNS_EXIST = true';
  RAISE NOTICE '';
  RAISE NOTICE '▶ Para carregar dados: execute o motor Python';
  RAISE NOTICE '  (app.py) e faça upsert do CSV resultante';
  RAISE NOTICE '  via COPY ou a API do Supabase.';
END;
$$;


-- ============================================================
--  RESUMO
-- ============================================================
--
--  Tabela: public.correlacao_endoscopia
--
--  Grupos de colunas (49 total):
--    • 1   chave natural     ChaveCorrelacao (PK)
--    • 14  PRODUCAO          dados da clínica
--    • 3   correlação        SimilaridadeProcedimento, MetodoMatch, StatusCorrelacao
--    • 15  REPASSE           dados do hospital
--    • 5   TUSS              StatusTUSS, códigos, valores
--    • 3   auditoria humana  decisao_humana, revisado_em, notas_revisor
--
--  RLS:
--    SELECT  → todos os autenticados
--    INSERT  → editor, admin
--    UPDATE  → editor, admin
--    DELETE  → admin
--
--  Índices (7):
--    StatusCorrelacao, StatusTUSS, MetodoMatch   (filtros de status)
--    Data_PRODUCAO DESC                           (ordenação padrão)
--    decisao_humana IS NULL                       (fila de revisão)
--    Paciente_PRODUCAO gin_trgm                  (busca ilike)
--    Paciente_REPASSE  gin_trgm                  (busca ilike)
--
-- ============================================================
