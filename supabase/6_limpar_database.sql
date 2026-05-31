-- ============================================================
--  LIMPAR DATABASE — Endoscopia Auditoria de Faturamento
--
--  ⚠  ATENÇÃO: este script APAGA TUDO — tabelas, views,
--  funções, triggers e usuários em auth.users.
--  Execute apenas em ambiente de desenvolvimento/reset.
--
--  Fluxo correto após execução:
--    1. Execute este script  (5_limpar_database.sql)
--    2. Execute 1_rbac-migration.sql
--    3. Execute 2_tuss-lookup-migration.sql
--    4. Execute 3_correlacao-migration.sql
--    5. Execute 4_rollback-migration.sql
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. TRIGGER em auth.users
--    Precisa ser removido antes das funções que ele referencia.
-- ─────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;


-- ─────────────────────────────────────────────────────────────
-- 2. VIEW
-- ─────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.correlacao_endoscopia_com_tipo;
DROP VIEW IF EXISTS public.user_profiles_view;


-- ─────────────────────────────────────────────────────────────
-- 3. TABELAS (ordem respeita as FKs)
--
--    valores_tuss         (sem FKs externas)
--    lotes_carga          → operacoes_rollback
--    correlacao_endoscopia → operacoes_rollback, auth.users
--    operacoes_rollback   → auth.users
--    tuss_lookup_table    (sem FKs)
--    profiles             → auth.users
-- ─────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.valores_tuss           CASCADE;
DROP TABLE IF EXISTS public.lotes_carga            CASCADE;
DROP TABLE IF EXISTS public.correlacao_endoscopia  CASCADE;
DROP TABLE IF EXISTS public.operacoes_rollback      CASCADE;
DROP TABLE IF EXISTS public.tuss_lookup_table       CASCADE;
DROP TABLE IF EXISTS public.profiles                CASCADE;


-- ─────────────────────────────────────────────────────────────
-- 4. FUNÇÕES
-- ─────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.handle_new_user()                CASCADE;
DROP FUNCTION IF EXISTS public.get_my_role()                    CASCADE;
DROP FUNCTION IF EXISTS public.get_email_by_cpf(TEXT)           CASCADE;
DROP FUNCTION IF EXISTS public.touch_updated_at()               CASCADE;
DROP FUNCTION IF EXISTS public.enrich_correlacao_on_insert()    CASCADE;
DROP FUNCTION IF EXISTS public.touch_revisado_em()              CASCADE;
DROP FUNCTION IF EXISTS public.enrich_valores_tuss_on_insert()  CASCADE;


-- ─────────────────────────────────────────────────────────────
-- 5. USUÁRIOS EM auth.users
--    auth.users só contém usuários da aplicação — não há
--    usuários internos do Supabase nesta tabela.
--    A exclusão dispara ON DELETE CASCADE em auth.sessions,
--    auth.identities e auth.refresh_tokens automaticamente.
-- ─────────────────────────────────────────────────────────────

DELETE FROM auth.users;


-- ─────────────────────────────────────────────────────────────
-- 6. VERIFICAÇÃO
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tabelas  INT;
  v_usuarios INT;
  v_funcoes  INT;
BEGIN
  SELECT COUNT(*) INTO v_tabelas
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'profiles', 'tuss_lookup_table',
      'correlacao_endoscopia', 'operacoes_rollback',
      'lotes_carga', 'valores_tuss'
    );

  SELECT COUNT(*) INTO v_usuarios FROM auth.users;

  SELECT COUNT(*) INTO v_funcoes
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'handle_new_user', 'get_my_role', 'touch_updated_at',
      'enrich_correlacao_on_insert', 'touch_revisado_em',
      'enrich_valores_tuss_on_insert'
    );

  RAISE NOTICE '=== Limpeza concluída ===';
  RAISE NOTICE 'Tabelas restantes  : % (esperado: 0)', v_tabelas;
  RAISE NOTICE 'Usuários em auth   : % (esperado: 0)', v_usuarios;
  RAISE NOTICE 'Funções restantes  : % (esperado: 0)', v_funcoes;

  IF v_tabelas > 0 OR v_funcoes > 0 THEN
    RAISE WARNING 'Alguns objetos não foram removidos. Verifique acima.';
  ELSE
    RAISE NOTICE '✓ Banco limpo — pode executar os scripts 1 a 5 (ou _all_config_db_scripts.sql).';
  END IF;
  RAISE NOTICE '=========================';
END;
$$;
