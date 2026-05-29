-- ============================================================
-- ARQUIVO: 1_rbac-migration.sql
-- ============================================================

-- ============================================================
--  RBAC Migration — Endoscopia Auditoria de Faturamento
--  Execute este script no SQL Editor do Supabase (uma vez).
--  É idempotente: pode ser reexecutado sem efeitos colaterais.
--
--  Ordem de execução (dependências respeitadas):
--    1. Tabela profiles (inclui coluna cpf)
--    2. Função get_my_role()   ← deve existir ANTES das policies RLS
--    3. Policies RLS           ← usa get_my_role()
--    4. Trigger auto-profile   ← dispara ao criar usuário em auth.users
--    5. Trigger updated_at
--    6. View segura (admin)
--    7. Verificação
--    8. Usuário admin inicial
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. TABELA DE PERFIS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID        PRIMARY KEY
                            REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT        NOT NULL,
  nome          TEXT,
  cpf           TEXT        DEFAULT NULL,
  role          TEXT        NOT NULL DEFAULT 'visualizador'
                            CHECK (role IN ('visualizador', 'editor', 'financeiro', 'admin')),
  ativo         BOOLEAN     NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Garante a coluna cpf em bancos que já tinham a tabela sem ela (idempotente)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cpf TEXT DEFAULT NULL;

-- Constraint de unicidade: dois usuários não podem ter o mesmo CPF.
-- DROP + ADD é o padrão idempotente para constraints no PostgreSQL.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_cpf_unique;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_cpf_unique UNIQUE (cpf);

-- Índices
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles (role);
CREATE INDEX IF NOT EXISTS profiles_cpf_idx  ON public.profiles (cpf)
  WHERE cpf IS NOT NULL;

COMMENT ON TABLE  public.profiles             IS 'Perfis de acesso dos usuários do sistema de auditoria';
COMMENT ON COLUMN public.profiles.role        IS 'visualizador | editor | financeiro | admin';
COMMENT ON COLUMN public.profiles.ativo       IS 'false = usuário bloqueado (sem acesso ao frontend e ao backend)';
COMMENT ON COLUMN public.profiles.nome        IS 'Nome de exibição — preenchido no convite ou pelo próprio usuário';
COMMENT ON COLUMN public.profiles.cpf         IS 'CPF do usuário — 11 dígitos sem formatação (ex: "12345678901"). Opcional, único.';


-- ─────────────────────────────────────────────────────────────
-- 2. FUNÇÃO AUXILIAR: get_my_role()
--    DEVE ser criada ANTES das policies RLS que a referenciam.
--    SECURITY DEFINER: lê profiles sem acionar RLS (evita
--    recursão infinita ao avaliar a própria policy de admin).
-- ─────────────────────────────────────────────────────────────
-- 2b. FUNÇÃO: get_email_by_cpf(cpf)
--    Permite resolver CPF → e-mail na tela de login, antes de
--    o usuário estar autenticado. SECURITY DEFINER bypassa RLS.
--    Exposta ao role 'anon' (usuário não autenticado do Supabase).
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_my_role IS
  'Retorna o role do usuário logado. SECURITY DEFINER evita recursão nas políticas RLS.';

CREATE OR REPLACE FUNCTION public.get_email_by_cpf(p_cpf TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles WHERE cpf = p_cpf LIMIT 1;
$$;

-- Permite que usuários não autenticados (anon) chamem via supabase.rpc()
GRANT EXECUTE ON FUNCTION public.get_email_by_cpf(TEXT) TO anon;

COMMENT ON FUNCTION public.get_email_by_cpf IS
  'Resolve CPF → e-mail para login. SECURITY DEFINER bypassa RLS. Exposta ao role anon.';


-- ─────────────────────────────────────────────────────────────
-- 3. ROW LEVEL SECURITY
--    Depende de get_my_role() — criada na seção anterior.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3a. Cada usuário lê o próprio perfil
--     (necessário para o frontend descobrir o próprio role após login)
DROP POLICY IF EXISTS "profiles: self read" ON public.profiles;
CREATE POLICY "profiles: self read"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- 3b. Cada usuário atualiza o próprio perfil (nome e cpf).
--     WITH CHECK impede escalar o próprio role ou desativar a conta.
DROP POLICY IF EXISTS "profiles: self update (nome only)" ON public.profiles;
CREATE POLICY "profiles: self update (nome only)"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role  = (SELECT role  FROM public.profiles WHERE id = auth.uid())
    AND ativo = (SELECT ativo FROM public.profiles WHERE id = auth.uid())
  );

-- 3c. Admin tem acesso total (SELECT, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "profiles: admin full access" ON public.profiles;
CREATE POLICY "profiles: admin full access"
  ON public.profiles
  FOR ALL
  USING  (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');


-- ─────────────────────────────────────────────────────────────
-- 4. TRIGGER: auto-criar profile ao cadastrar usuário
--    Funciona para cadastro manual e convite via inviteUserByEmail.
--    Aceita cpf opcional em user_metadata (normalizado para 11 dígitos).
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cpf TEXT;
BEGIN
  -- Normaliza CPF: remove tudo que não é dígito; NULL se vazio ou ≠ 11 dígitos
  _cpf := REGEXP_REPLACE(
            COALESCE(NEW.raw_user_meta_data->>'cpf', ''),
            '[^0-9]', '', 'g'
          );
  IF LENGTH(_cpf) <> 11 THEN
    _cpf := NULL;
  END IF;

  INSERT INTO public.profiles (id, email, nome, cpf)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(TRIM(NEW.raw_user_meta_data->>'nome'), ''),
    _cpf
  )
  ON CONFLICT (id) DO NOTHING;  -- idempotente: não duplica se já existir

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user IS
  'Cria automaticamente um profile com role=visualizador ao registrar novo usuário. Aceita cpf via user_metadata.';


-- ─────────────────────────────────────────────────────────────
-- 5. TRIGGER: atualizar timestamp ao editar profile
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();


-- ─────────────────────────────────────────────────────────────
-- 6. VIEW SEGURA para o frontend listar usuários (admin only)
--    Expõe apenas os campos necessários — nunca hash de senha,
--    tokens ou outros dados sensíveis de auth.users
-- ─────────────────────────────────────────────────────────────

-- DROP antes de recriar: CREATE OR REPLACE não permite mudar ordem/inserir colunas no meio.
-- DROP VIEW IF EXISTS é idempotente — não falha se a view não existir.
DROP VIEW IF EXISTS public.user_profiles_view;
CREATE VIEW public.user_profiles_view AS
  SELECT
    p.id,
    p.email,
    p.nome,
    p.cpf,
    p.role,
    p.ativo,
    p.criado_em,
    p.atualizado_em,
    u.last_sign_in_at   -- útil para admin identificar usuários inativos
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id;

COMMENT ON VIEW public.user_profiles_view IS
  'Visão segura para listagem de usuários no painel admin. Inclui cpf. Sujeita a RLS da tabela profiles.';


-- ─────────────────────────────────────────────────────────────
-- 7. VERIFICAÇÃO: confirma se tudo foi criado corretamente
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_table  BOOLEAN;
  v_cpf    BOOLEAN;
  v_fn     BOOLEAN;
  v_trig   BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) INTO v_table;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'cpf'
  ) INTO v_cpf;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_my_role'
  ) INTO v_fn;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) INTO v_trig;

  RAISE NOTICE '=== RBAC Migration Check ===';
  RAISE NOTICE 'Tabela profiles ..... %', CASE WHEN v_table THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE 'Coluna cpf .......... %', CASE WHEN v_cpf   THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE 'Função get_my_role .. %', CASE WHEN v_fn    THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE 'Trigger new_user .... %', CASE WHEN v_trig  THEN 'OK ✓' ELSE 'FALHOU ✗' END;
  RAISE NOTICE '============================';
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 8. USUÁRIO ADMIN INICIAL
--    Cria contato@dracharliana.com com senha temporária Admin123
--    A senha DEVE ser trocada no primeiro acesso via frontend.
--    Idempotente: não duplica se o e-mail já existir.
-- ─────────────────────────────────────────────────────────────

-- Garante que pgcrypto está disponível (já vem habilitado no Supabase)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_uid        UUID;
  v_email      TEXT    := 'contato@dracharliana.com';
  v_senha      TEXT    := '123456';
  v_nome       TEXT    := 'Administrador';
  v_cpf        TEXT    := '12345678900';
  v_tem_perfil BOOLEAN := false;
BEGIN
  -- Verifica se o usuário já existe em auth.users
  SELECT id INTO v_uid
  FROM auth.users
  WHERE email = v_email
  LIMIT 1;

  IF v_uid IS NOT NULL THEN
    -- Usuário já existe em auth.users — verifica se o profile foi criado
    -- (pode ter sido apagado se as tabelas públicas foram recriadas)
    SELECT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = v_uid
    ) INTO v_tem_perfil;

    IF v_tem_perfil THEN
      -- Profile existe: garante que role e cpf estão corretos
      UPDATE public.profiles
      SET role = 'admin', nome = v_nome, cpf = v_cpf, ativo = true, atualizado_em = NOW()
      WHERE id = v_uid;

      RAISE NOTICE 'Usuário % já existe (id: %). Profile verificado/atualizado.', v_email, v_uid;
    ELSE
      -- Profile não existe (tabela foi recriada): insere diretamente
      INSERT INTO public.profiles (id, email, nome, cpf, role, ativo)
      VALUES (v_uid, v_email, v_nome, v_cpf, 'admin', true);

      RAISE NOTICE '=== Profile admin recriado ===';
      RAISE NOTICE 'E-mail : %', v_email;
      RAISE NOTICE 'CPF    : %', v_cpf;
      RAISE NOTICE 'UUID   : %', v_uid;
      RAISE NOTICE '(Senha não alterada — use a senha anterior ou redefina no Supabase)';
      RAISE NOTICE '==============================';
    END IF;

  ELSE
    -- Usuário não existe: cria do zero
    v_uid := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      is_super_admin, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_uid, 'authenticated', 'authenticated', v_email,
      crypt(v_senha, gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nome', v_nome, 'cpf', v_cpf),
      false, NOW(), NOW(), '', '', '', ''
    );

    -- O trigger on_auth_user_created já inseriu o profile com role=visualizador.
    -- Promovemos para admin e definimos o CPF agora.
    UPDATE public.profiles
    SET role = 'admin', nome = v_nome, cpf = v_cpf, atualizado_em = NOW()
    WHERE id = v_uid;

    RAISE NOTICE '=== Admin criado com sucesso ===';
    RAISE NOTICE 'E-mail : %', v_email;
    RAISE NOTICE 'CPF    : %', v_cpf;
    RAISE NOTICE 'Senha  : %', v_senha;
    RAISE NOTICE 'Role   : admin';
    RAISE NOTICE 'UUID   : %', v_uid;
    RAISE NOTICE '================================';
  END IF;
END;
$$;


-- ============================================================
--  PÓS-INSTALAÇÃO
-- ============================================================
--
--  Admin inicial criado automaticamente (seção 8):
--    E-mail : contato@dracharliana.com
--    CPF    : 12345678900
--    Senha  : 123456
--
--  Para redefinir a senha manualmente (se necessário):
--    UPDATE auth.users
--    SET encrypted_password = crypt('NovaSenha', gen_salt('bf'))
--    WHERE email = 'contato@dracharliana.com';
--
--  Para convidar novos usuários após o setup:
--    • Via painel Supabase: Authentication → Users → Invite User
--    • Via frontend: Configurações → Usuários e Acessos → Convidar usuário
--
--  Segurança garantida pelo RLS:
--    • Usuários não veem profiles de outros
--    • Usuários não alteram o próprio role ou ativo
--    • Usuários podem atualizar nome e cpf do próprio perfil
--    • Apenas admin cria/edita/apaga profiles
--    • get_my_role() usa SECURITY DEFINER (sem recursão RLS)
--
-- ============================================================


-- ============================================================
-- ARQUIVO: 2_tuss-lookup-migration.sql
-- ============================================================

-- ============================================================
--  TUSS Lookup Table — Mapeamento PRODUCAO → Código TUSS
--  Execute este script no SQL Editor do Supabase (uma vez).
--
--  Pré-requisito: rbac-migration.sql já executado (função get_my_role).
--
--  Contém:
--    1. CREATE TABLE tuss_lookup_table
--    2. RLS policies
--    3. 152 registros seed (derivados de _TABELA_TUSS_EMBUTIDA em app.py)
--
--  Idempotente: INSERT … ON CONFLICT DO NOTHING
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. TABELA
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tuss_lookup_table (
  chave_norm                 TEXT        PRIMARY KEY,
  "Proc_PRODUCAO_raw"        TEXT,
  "ProcAdic_PRODUCAO_raw"    TEXT,
  "CONCATENAR_raw"           TEXT,
  "CodigosTUSS"              TEXT,
  "QtdCodigos"               INTEGER     NOT NULL DEFAULT 0,
  "TipoCobranca"             TEXT        NOT NULL
                             CHECK ("TipoCobranca" IN (
                               'unico_cod_tuss_somente_proc_principal',
                               'unico_cod_tuss_inclui_proc_adicional_e_principal',
                               'multiplos_cod_tuss_proced_adicional',
                               'sem_mapeamento_tuss'
                             )),
  codigo_base_proc_principal TEXT,
  "Descricao_REPASSE"        TEXT,
  atualizado_em              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.tuss_lookup_table IS
  'Mapeamento de combinações PRODUCAO (proc principal + adicional) para códigos TUSS oficiais. '
  'Chave: chave_norm = normalização de (Procedimento_PRODUCAO + _ + ProcedimentosAdicionais_PRODUCAO).';

COMMENT ON COLUMN public.tuss_lookup_table.chave_norm IS
  'Chave normalizada: PROC_ADIC (ex: ENDOSCOPIA_TESTE DE UREASE). Vazio → PROC_.';
COMMENT ON COLUMN public.tuss_lookup_table."TipoCobranca" IS
  'unico_cod_tuss_somente_proc_principal | unico_cod_tuss_inclui_proc_adicional_e_principal | '
  'multiplos_cod_tuss_proced_adicional | sem_mapeamento_tuss';
COMMENT ON COLUMN public.tuss_lookup_table.codigo_base_proc_principal IS
  'Código TUSS do procedimento principal isolado (sem adicional). '
  'Quando TipoCobranca = ''unico_cod_tuss_inclui_proc_adicional_e_principal'', '
  'este campo aponta o código simples do qual CodigosTUSS é um upgrade combinado. '
  'Usado pelo motor Python (_build_upgrade_map) para classificar '
  'OK_TUSS_CODIGO_PRINCIPAL_UPGRADE (repasse pagou código mais complexo) vs '
  'COBRAR_TUSS_CODIGO_PRINCIPAL_DOWNGRADE (repasse pagou código mais simples) vs '
  'COBRAR_TUSS_CODIGO_PRINCIPAL_DIVERGENTE (relação não determinável).';

CREATE INDEX IF NOT EXISTS tuss_lookup_proc_idx
  ON public.tuss_lookup_table ("Proc_PRODUCAO_raw");

CREATE INDEX IF NOT EXISTS tuss_lookup_tipo_idx
  ON public.tuss_lookup_table ("TipoCobranca");


-- ─────────────────────────────────────────────────────────────
-- 2. ROW LEVEL SECURITY
--    Pré-requisito: função get_my_role() do rbac-migration.sql
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.tuss_lookup_table ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ler (necessário para correlação e frontend)
DROP POLICY IF EXISTS "tuss_lookup: authenticated read" ON public.tuss_lookup_table;
CREATE POLICY "tuss_lookup: authenticated read"
  ON public.tuss_lookup_table
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Admin e editor podem inserir e atualizar (manutenção do mapeamento via UI)
DROP POLICY IF EXISTS "tuss_lookup: admin/editor write" ON public.tuss_lookup_table;
CREATE POLICY "tuss_lookup: admin/editor write"
  ON public.tuss_lookup_table
  FOR ALL
  USING  (public.get_my_role() IN ('admin', 'editor'))
  WITH CHECK (public.get_my_role() IN ('admin', 'editor'));


-- ─────────────────────────────────────────────────────────────
-- 3. SEED — 152 registros do mapeamento canônico
--    Fonte: _TABELA_TUSS_EMBUTIDA em backend/app.py
--    ON CONFLICT DO NOTHING → idempotente (pode re-executar)
-- ─────────────────────────────────────────────────────────────

INSERT INTO public.tuss_lookup_table (
  chave_norm,
  "Proc_PRODUCAO_raw",
  "ProcAdic_PRODUCAO_raw",
  "CONCATENAR_raw",
  "CodigosTUSS",
  "QtdCodigos",
  "TipoCobranca",
  codigo_base_proc_principal,
  "Descricao_REPASSE"
) VALUES
  ('ANUSCOPIA_', 'ANUSCOPIA', NULL, 'ANUSCOPIA_', NULL, 0, 'sem_mapeamento_tuss', NULL, 'Sem correspondência exata TUSS'),
  ('COLONO_', 'COLONO', NULL, 'COLONO_', '40201082', 1, 'unico_cod_tuss_somente_proc_principal', '40201082', 'Colonoscopia (Inclui A Retossigmoidoscopia)'),
  ('COLONO_ANATOMO+POLIPECTOMIA', 'COLONO', 'ANATOMO+POLIPECTOMIA', 'COLONO_ANATOMO+POLIPECTOMIA', '40202666, 40202542', 2, 'multiplos_cod_tuss_proced_adicional', '40201082', 'Colonoscopia Com Biópsia E Polipectomia'),
  ('COLONO_ANATOMO PATLOGICO', 'COLONO', 'ANATOMO PATLOGICO', 'COLONO_ANATOMO PATLOGICO', '40202666', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201082', 'Colonoscopia Com Biópsia E/Ou Citologia'),
  ('COLONO_ANATOMO PATOLOGICO', 'COLONO', 'ANATOMO PATOLOGICO', 'COLONO_ANATOMO PATOLOGICO', '40202666', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201082', 'Colonoscopia Com Biópsia E/Ou Citologia'),
  ('COLONO_ANATOMO PATOLOGICO+MUCOSECTOMIA', 'COLONO', 'ANATOMO PATOLOGICO+MUCOSECTOMIA', 'COLONO_ANATOMO PATOLOGICO+MUCOSECTOMIA', '40202666, 40202712', 2, 'multiplos_cod_tuss_proced_adicional', '40201082', 'Colonoscopia Com Biópsia E Mucosectomia'),
  ('COLONO_ANATOMO PATOLOGICO+POLIPECTOMIA', 'COLONO', 'ANATOMO PATOLOGICO+POLIPECTOMIA', 'COLONO_ANATOMO PATOLOGICO+POLIPECTOMIA', '40202666, 40202542', 2, 'multiplos_cod_tuss_proced_adicional', '40201082', 'Colonoscopia Com Biópsia E Polipectomia'),
  ('COLONO_ANATOMO PATOLOGICO+TATUAGEM', 'COLONO', 'ANATOMO PATOLOGICO+TATUAGEM', 'COLONO_ANATOMO PATOLOGICO+TATUAGEM', '40202666, 40202135', 2, 'multiplos_cod_tuss_proced_adicional', '40201082', 'Colonoscopia Com Biópsia E Tatuagem'),
  ('COLONO_ANATOMO PATOLOGICO+MUCOSECTOMIA+POLIPECTOMIA', 'COLONO', 'ANATOMO PATOLOGICO+MUCOSECTOMIA+POLIPECTOMIA', 'COLONO_ANATOMO PATOLOGICO+MUCOSECTOMIA+POLIPECTOMIA', '40202666, 40202712, 40202542', 3, 'multiplos_cod_tuss_proced_adicional', '40201082', 'Colonoscopia Com Biópsia, Mucosectomia E Polipectomia'),
  ('COLONO_ANATOMO PATOLOGICO+POLIPO', 'COLONO', 'ANATOMO PATOLOGICO+POLIPO', 'COLONO_ANATOMO PATOLOGICO+POLIPO', '40202666, 40202542', 2, 'multiplos_cod_tuss_proced_adicional', '40201082', 'Colonoscopia Com Biópsia E Polipectomia'),
  ('COLONO_ANATOMO+MUCOSECTOMIA', 'COLONO', 'ANATOMO+MUCOSECTOMIA', 'COLONO_ANATOMO+MUCOSECTOMIA', '40202666, 40202712', 2, 'multiplos_cod_tuss_proced_adicional', '40201082', 'Colonoscopia Com Biópsia E Mucosectomia'),
  ('COLONO_ANATOMO+POLIOECTOMIA', 'COLONO', 'ANATOMO+POLIOECTOMIA', 'COLONO_ANATOMO+POLIOECTOMIA', '40202666, 40202542', 2, 'multiplos_cod_tuss_proced_adicional', '40201082', 'Colonoscopia Com Biópsia E Polipectomia'),
  ('COLONO_ANATOMOPATOLOGICO', 'COLONO', 'ANATOMOPATOLOGICO', 'COLONO_ANATOMOPATOLOGICO', '40202666', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201082', 'Colonoscopia Com Biópsia E/Ou Citologia'),
  ('COLONO_ANATOMOPATOLOGICO+POLIPO', 'COLONO', 'ANATOMOPATOLOGICO+POLIPO', 'COLONO_ANATOMOPATOLOGICO+POLIPO', '40202666, 40202542', 2, 'multiplos_cod_tuss_proced_adicional', '40201082', 'Colonoscopia Com Biópsia E Polipectomia'),
  ('COLONO_BRADES', 'COLONO', 'BRADES', 'COLONO_BRADES', '40201082', 1, 'unico_cod_tuss_somente_proc_principal', '40201082', 'Colonoscopia (Inclui A Retossigmoidoscopia)'),
  ('COLONO_MUCOSECTOMIA', 'COLONO', 'MUCOSECTOMIA', 'COLONO_MUCOSECTOMIA', '40202712', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201082', 'Colonoscopia Com Mucosectomia'),
  ('COLONO_POLEPECTOMIA+MUCOSECTOMIA', 'COLONO', 'POLEPECTOMIA+MUCOSECTOMIA', 'COLONO_POLEPECTOMIA+MUCOSECTOMIA', '40202542, 40202712', 2, 'multiplos_cod_tuss_proced_adicional', '40201082', 'Colonoscopia Com Polipectomia E Mucosectomia'),
  ('COLONO_POLIECTOMIA', 'COLONO', 'POLIECTOMIA', 'COLONO_POLIECTOMIA', '40202542', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201082', 'Polipectomia De Cólon (Independente Do Número De Pólipos)'),
  ('COLONO_POLIPECTOMIA', 'COLONO', 'POLIPECTOMIA', 'COLONO_POLIPECTOMIA', '40202542', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201082', 'Polipectomia De Cólon (Independente Do Número De Pólipos)'),
  ('COLONO_POLIPECTOMIA+MUCOSECTOMIA', 'COLONO', 'POLIPECTOMIA+MUCOSECTOMIA', 'COLONO_POLIPECTOMIA+MUCOSECTOMIA', '40202542, 40202712', 2, 'multiplos_cod_tuss_proced_adicional', '40201082', 'Colonoscopia Com Polipectomia E Mucosectomia'),
  ('COLONO_POLIPOECTOMIA', 'COLONO', 'POLIPOECTOMIA', 'COLONO_POLIPOECTOMIA', '40202542', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201082', 'Polipectomia De Cólon (Independente Do Número De Pólipos)'),
  ('COLONO_RETIRADA DE CORPO ESRANHO', 'COLONO', 'RETIRADA DE CORPO ESRANHO', 'COLONO_RETIRADA DE CORPO ESRANHO', '40202569', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201082', 'Retirada de corpo estranho do cólon'),
  ('COLONO_TESTE DE UREASE', 'COLONO', 'TESTE DE UREASE', 'COLONO_TESTE DE UREASE', '40201082, 40202615', 2, 'multiplos_cod_tuss_proced_adicional', '40201082', 'Colonoscopia + Teste De Urease Para Pesquisa De Helicobacter Pylori'),
  ('COLONO_TESTE DE UREASE+ANATOMO', 'COLONO', 'TESTE DE UREASE+ANATOMO', 'COLONO_TESTE DE UREASE+ANATOMO', '40201082, 40202615', 2, 'multiplos_cod_tuss_proced_adicional', '40201082', 'Colonoscopia + Teste De Urease Para Pesquisa De Helicobacter Pylori'),
  ('COLONO_TESTE UREASE', 'COLONO', 'TESTE UREASE', 'COLONO_TESTE UREASE', '40201082, 40202615', 2, 'multiplos_cod_tuss_proced_adicional', '40201082', 'Colonoscopia + Teste De Urease Para Pesquisa De Helicobacter Pylori'),
  ('COLONOCOPIA_', 'COLONOCOPIA', NULL, 'COLONOCOPIA_', '40201082', 1, 'unico_cod_tuss_somente_proc_principal', '40201082', 'Colonoscopia (Inclui A Retossigmoidoscopia)'),
  ('COLONOCOPIA_POLIPECTOMIA', 'COLONOCOPIA', 'POLIPECTOMIA', 'COLONOCOPIA_POLIPECTOMIA', '40202542', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201082', 'Polipectomia De Cólon (Independente Do Número De Pólipos)'),
  ('COLONOSCOPIA_', 'COLONOSCOPIA', NULL, 'COLONOSCOPIA_', '40201082', 1, 'unico_cod_tuss_somente_proc_principal', '40201082', 'Colonoscopia (Inclui A Retossigmoidoscopia)'),
  ('COLONOSCOPIA_-', 'COLONOSCOPIA', '-', 'COLONOSCOPIA_-', '40201082', 1, 'unico_cod_tuss_somente_proc_principal', '40201082', 'Colonoscopia (Inclui A Retossigmoidoscopia)'),
  ('COLONOSCOPIA_ANATOMO PATOLOGICO', 'COLONOSCOPIA', 'ANATOMO PATOLOGICO', 'COLONOSCOPIA_ANATOMO PATOLOGICO', '40202666', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201082', 'Colonoscopia Com Biópsia E/Ou Citologia'),
  ('COLONOSCOPIA_ANATOMO PATOLOGICO+POLIPECTOMIA', 'COLONOSCOPIA', 'ANATOMO PATOLOGICO+POLIPECTOMIA', 'COLONOSCOPIA_ANATOMO PATOLOGICO+POLIPECTOMIA', '40202666, 40202542', 2, 'multiplos_cod_tuss_proced_adicional', '40201082', 'Colonoscopia Com Biópsia E Polipectomia'),
  ('COLONOSCOPIA_BIOPSIA SERIADO', 'COLONOSCOPIA', 'BIOPSIA SERIADO', 'COLONOSCOPIA_BIOPSIA SERIADO', '40202666', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201082', 'Colonoscopia Com Biópsia E/Ou Citologia'),
  ('COLONOSCOPIA_DESCOMPRESSAO COLONICA', 'COLONOSCOPIA', 'DESCOMPRESSAO COLONICA', 'COLONOSCOPIA_DESCOMPRESSAO COLONICA', '40202143', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201082', 'Descompressão colônica por colonoscopia'),
  ('COLONOSCOPIA_HEMOSTASIA', 'COLONOSCOPIA', 'HEMOSTASIA', 'COLONOSCOPIA_HEMOSTASIA', '40202313', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201082', 'Hemostasias de cólon'),
  ('COLONOSCOPIA_MUCOSECTOMIA', 'COLONOSCOPIA', 'MUCOSECTOMIA', 'COLONOSCOPIA_MUCOSECTOMIA', '40202712', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201082', 'Colonoscopia Com Mucosectomia'),
  ('COLONOSCOPIA_POLIPECTOMIA', 'COLONOSCOPIA', 'POLIPECTOMIA', 'COLONOSCOPIA_POLIPECTOMIA', '40202542', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201082', 'Polipectomia De Cólon (Independente Do Número De Pólipos)'),
  ('COLONOSCOPIA_TESTE DE UREASE', 'COLONOSCOPIA', 'TESTE DE UREASE', 'COLONOSCOPIA_TESTE DE UREASE', '40201082, 40202615', 2, 'multiplos_cod_tuss_proced_adicional', '40201082', 'Colonoscopia + Teste De Urease Para Pesquisa De Helicobacter Pylori'),
  ('COLONOSCOPIA_TESTE DE UREASE - NEGATIVO', 'COLONOSCOPIA', 'TESTE DE UREASE - NEGATIVO', 'COLONOSCOPIA_TESTE DE UREASE - NEGATIVO', '40201082, 40202615', 2, 'multiplos_cod_tuss_proced_adicional', '40201082', 'Colonoscopia + Teste De Urease Para Pesquisa De Helicobacter Pylori'),
  ('COLONOSCOPIA_TESTE UREASE - NEGATIVO', 'COLONOSCOPIA', 'TESTE UREASE - NEGATIVO', 'COLONOSCOPIA_TESTE UREASE - NEGATIVO', '40201082, 40202615', 2, 'multiplos_cod_tuss_proced_adicional', '40201082', 'Colonoscopia + Teste De Urease Para Pesquisa De Helicobacter Pylori'),
  ('COLONOSCOPIA_TESTE UREASE+ANATOMO PATOLOGICO', 'COLONOSCOPIA', 'TESTE UREASE+ANATOMO PATOLOGICO', 'COLONOSCOPIA_TESTE UREASE+ANATOMO PATOLOGICO', '40201082, 40202615', 2, 'multiplos_cod_tuss_proced_adicional', '40201082', 'Colonoscopia + Teste De Urease Para Pesquisa De Helicobacter Pylori'),
  ('CPRE_', 'CPRE', NULL, 'CPRE_', '40201074', 1, 'unico_cod_tuss_somente_proc_principal', '40201074', 'Colangiopancreatografia Retrógrada Endoscópica'),
  ('CPRE_ANATOMO PATOLOGICO', 'CPRE', 'ANATOMO PATOLOGICO', 'CPRE_ANATOMO PATOLOGICO', '40201074, 40202038', 2, 'multiplos_cod_tuss_proced_adicional', '40201074', 'Colangiopancreatografia Retrógrada Endoscópica Com Biópsia'),
  ('CPRE_COLOCACAO DE PROTESE', 'CPRE', 'COLOCACAO DE PROTESE', 'CPRE_COLOCACAO DE PROTESE', '40813320', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201074', 'Colocação De Stent Biliar'),
  ('CPRE_PROTESE', 'CPRE', 'PROTESE', 'CPRE_PROTESE', '40813320', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201074', 'Colocação De Stent Biliar'),
  ('CPRE_RETIRADA DE PROTESE BILIAR', 'CPRE', 'RETIRADA DE PROTESE BILIAR', 'CPRE_RETIRADA DE PROTESE BILIAR', '40201074', 1, 'unico_cod_tuss_somente_proc_principal', '40201074', 'Colangiopancreatografia Retrógrada Endoscópica'),
  ('ECOEDA ALTA C+PUNCAO_ANATOMO PATOLOGICO', 'ECOEDA ALTA C+PUNCAO', 'ANATOMO PATOLOGICO', 'ECOEDA ALTA C+PUNCAO_ANATOMO PATOLOGICO', '40202240, 40202038', 2, 'multiplos_cod_tuss_proced_adicional', NULL, 'Ecoendoscopia Alta Com Punção E Biópsia'),
  ('ECOEDA ALTA_', 'ECOEDA ALTA', NULL, 'ECOEDA ALTA_', '40201104', 1, 'unico_cod_tuss_somente_proc_principal', '40201104', 'Ecoendoscopia alta sem punção'),
  ('ECOENDOCOPIA ALTA_', 'ECOENDOCOPIA ALTA', NULL, 'ECOENDOCOPIA ALTA_', '40201104', 1, 'unico_cod_tuss_somente_proc_principal', '40201104', 'Ecoendoscopia alta sem punção'),
  ('ECOENDOSCOPIA BAIXA_', 'ECOENDOSCOPIA BAIXA', NULL, 'ECOENDOSCOPIA BAIXA_', NULL, 0, 'sem_mapeamento_tuss', NULL, 'Não há código TUSS específico para baixa na tabela (apenas alta)'),
  ('ECOENDOSCOPIA ALTA_', 'ECOENDOSCOPIA ALTA', NULL, 'ECOENDOSCOPIA ALTA_', '40201104', 1, 'unico_cod_tuss_somente_proc_principal', '40201104', 'Ecoendoscopia alta sem punção'),
  ('ECOENDOSCOPIA ALTA_ANATOMO PATOLOGICO', 'ECOENDOSCOPIA ALTA', 'ANATOMO PATOLOGICO', 'ECOENDOSCOPIA ALTA_ANATOMO PATOLOGICO', '40201104, 40202038', 2, 'multiplos_cod_tuss_proced_adicional', '40201104', 'Ecoendoscopia Alta Com Biópsia E/Ou Citologia'),
  ('ECOENDOSCOPIA ALTA_ANATOMOPATOLOGICO', 'ECOENDOSCOPIA ALTA', 'ANATOMOPATOLOGICO', 'ECOENDOSCOPIA ALTA_ANATOMOPATOLOGICO', '40201104, 40202038', 2, 'multiplos_cod_tuss_proced_adicional', '40201104', 'Ecoendoscopia Alta Com Biópsia E/Ou Citologia'),
  ('ECOENDOSCOPIA_', 'ECOENDOSCOPIA', NULL, 'ECOENDOSCOPIA_', '40201104', 1, 'unico_cod_tuss_somente_proc_principal', '40201104', 'Ecoendoscopia alta sem punção'),
  ('ECOENDOSCOPIA_ANATOMO PATOLOGICO', 'ECOENDOSCOPIA', 'ANATOMO PATOLOGICO', 'ECOENDOSCOPIA_ANATOMO PATOLOGICO', '40201104, 40202038', 2, 'multiplos_cod_tuss_proced_adicional', '40201104', 'Ecoendoscopia Alta Com Biópsia E/Ou Citologia'),
  ('ENCOSCOPIA_', 'ENCOSCOPIA', NULL, 'ENCOSCOPIA_', '40201120', 1, 'unico_cod_tuss_somente_proc_principal', '40201120', 'Endoscopia Digestiva Alta'),
  ('ENCOSCOPIA_TESTE UREASE', 'ENCOSCOPIA', 'TESTE UREASE', 'ENCOSCOPIA_TESTE UREASE', '40202615', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)'),
  ('ENDDOSCOPIA_ANATOMO PATOLOGICO+TESTE UREASE', 'ENDDOSCOPIA', 'ANATOMO PATOLOGICO+TESTE UREASE', 'ENDDOSCOPIA_ANATOMO PATOLOGICO+TESTE UREASE', '40202615', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', NULL, 'Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)'),
  ('ENDOCOSPIA_', 'ENDOCOSPIA', NULL, 'ENDOCOSPIA_', '40201120', 1, 'unico_cod_tuss_somente_proc_principal', '40201120', 'Endoscopia Digestiva Alta'),
  ('ENDOSCOPIA_', 'ENDOSCOPIA', NULL, 'ENDOSCOPIA_', '40201120', 1, 'unico_cod_tuss_somente_proc_principal', '40201120', 'Endoscopia Digestiva Alta'),
  ('ENDOSCOPIA_ENDOSCOPIA', 'ENDOSCOPIA', 'ENDOSCOPIA', 'ENDOSCOPIA_ENDOSCOPIA', '40201120', 1, 'unico_cod_tuss_somente_proc_principal', '40201120', 'Endoscopia Digestiva Alta'),
  ('ENDOSCOPIA_UREASE', 'ENDOSCOPIA', 'UREASE', 'ENDOSCOPIA_UREASE', '40202615', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)'),
  ('ENDOSCOPIA_ANATOMIA PATOLOGICA', 'ENDOSCOPIA', 'ANATOMIA PATOLOGICA', 'ENDOSCOPIA_ANATOMIA PATOLOGICA', '40202038', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E/Ou Citologia'),
  ('ENDOSCOPIA_ANATOMO PATOLOGICA', 'ENDOSCOPIA', 'ANATOMO PATOLOGICA', 'ENDOSCOPIA_ANATOMO PATOLOGICA', '40202038', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E/Ou Citologia'),
  ('ENDOSCOPIA_ANATOMO PATOLOGICO', 'ENDOSCOPIA', 'ANATOMO PATOLOGICO', 'ENDOSCOPIA_ANATOMO PATOLOGICO', '40202038', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E/Ou Citologia'),
  ('ENDOSCOPIA_ANATOMO PATOLOGICO+POLIPECTOMIA', 'ENDOSCOPIA', 'ANATOMO PATOLOGICO+POLIPECTOMIA', 'ENDOSCOPIA_ANATOMO PATOLOGICO+POLIPECTOMIA', '40202038, 40202550', 2, 'multiplos_cod_tuss_proced_adicional', '40201120', 'Endoscopia Alta Com Biópsia E Polipectomia'),
  ('ENDOSCOPIA_ANATOMO PATOLOGICO+HP+CICATRIZ GASTRICA', 'ENDOSCOPIA', 'ANATOMO PATOLOGICO+HP+CICATRIZ GASTRICA', 'ENDOSCOPIA_ANATOMO PATOLOGICO+HP+CICATRIZ GASTRICA', '40202615', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)'),
  ('ENDOSCOPIA_ANATOMO PATOLOGICO+TESTE DE UREASE', 'ENDOSCOPIA', 'ANATOMO PATOLOGICO+TESTE DE UREASE', 'ENDOSCOPIA_ANATOMO PATOLOGICO+TESTE DE UREASE', '40202615', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)'),
  ('ENDOSCOPIA_ANATOMO PATOLOGICO TESTE UREASE', 'ENDOSCOPIA', 'ANATOMO PATOLOGICO TESTE UREASE', 'ENDOSCOPIA_ANATOMO PATOLOGICO TESTE UREASE', '40202615', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)'),
  ('ENDOSCOPIA_ANATOMO PATOLOGICO+HPYLORI+BUBO GASTRICO', 'ENDOSCOPIA', 'ANATOMO PATOLOGICO+HPYLORI+BUBO GASTRICO', 'ENDOSCOPIA_ANATOMO PATOLOGICO+HPYLORI+BUBO GASTRICO', '40202615', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)'),
  ('ENDOSCOPIA_ANATOMO PATOLOGICO+TESTE UREASE', 'ENDOSCOPIA', 'ANATOMO PATOLOGICO+TESTE UREASE', 'ENDOSCOPIA_ANATOMO PATOLOGICO+TESTE UREASE', '40202615', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)'),
  ('ENDOSCOPIA_ANATOMO PATOLOGICO+POLIPO', 'ENDOSCOPIA', 'ANATOMO PATOLOGICO+POLIPO', 'ENDOSCOPIA_ANATOMO PATOLOGICO+POLIPO', '40202038, 40202550', 2, 'multiplos_cod_tuss_proced_adicional', '40201120', 'Endoscopia Alta Com Biópsia E Polipectomia'),
  ('ENDOSCOPIA_ANATOMO+MUCOSECTOMIA', 'ENDOSCOPIA', 'ANATOMO+MUCOSECTOMIA', 'ENDOSCOPIA_ANATOMO+MUCOSECTOMIA', '40202038, 40202470', 2, 'multiplos_cod_tuss_proced_adicional', '40201120', 'Endoscopia Alta Com Biópsia E Mucosectomia'),
  ('ENDOSCOPIA_ANATOMO+POLIPECTOMIA', 'ENDOSCOPIA', 'ANATOMO+POLIPECTOMIA', 'ENDOSCOPIA_ANATOMO+POLIPECTOMIA', '40202038, 40202550', 2, 'multiplos_cod_tuss_proced_adicional', '40201120', 'Endoscopia Alta Com Biópsia E Polipectomia'),
  ('ENDOSCOPIA_ANATOMOPATOLOGICO', 'ENDOSCOPIA', 'ANATOMOPATOLOGICO', 'ENDOSCOPIA_ANATOMOPATOLOGICO', '40202038', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E/Ou Citologia'),
  ('ENDOSCOPIA_ANATOMOPATOLOGICO+TESTE DE UREASE', 'ENDOSCOPIA', 'ANATOMOPATOLOGICO+TESTE DE UREASE', 'ENDOSCOPIA_ANATOMOPATOLOGICO+TESTE DE UREASE', '40202615', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)'),
  ('ENDOSCOPIA_BIOPSIA HEPATICA', 'ENDOSCOPIA', 'BIOPSIA HEPATICA', 'ENDOSCOPIA_BIOPSIA HEPATICA', '40202038', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E/Ou Citologia'),
  ('ENDOSCOPIA_COM DILATACAO', 'ENDOSCOPIA', 'COM DILATACAO', 'ENDOSCOPIA_COM DILATACAO', '40202186', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Dilatação De Esôfago Com Balão Pneumático'),
  ('ENDOSCOPIA_CPRE', 'ENDOSCOPIA', 'CPRE', 'ENDOSCOPIA_CPRE', '40201074', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Colangiopancreatografia Retrógrada Endoscópica'),
  ('ENDOSCOPIA_DILATACAO DE OSTOMIA+TROCA DE GTT', 'ENDOSCOPIA', 'DILATACAO DE OSTOMIA+TROCA DE GTT', 'ENDOSCOPIA_DILATACAO DE OSTOMIA+TROCA DE GTT', '40202283', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Gastrostomia endoscópica'),
  ('ENDOSCOPIA_DILATACAO ESOFAGICA', 'ENDOSCOPIA', 'DILATACAO ESOFAGICA', 'ENDOSCOPIA_DILATACAO ESOFAGICA', '40202186', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Dilatação De Esôfago Com Balão Pneumático'),
  ('ENDOSCOPIA_DILATACAO PNEUMATICA', 'ENDOSCOPIA', 'DILATACAO PNEUMATICA', 'ENDOSCOPIA_DILATACAO PNEUMATICA', '40202186', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Dilatação De Esôfago Com Balão Pneumático'),
  ('ENDOSCOPIA_GASTROSTOMIA', 'ENDOSCOPIA', 'GASTROSTOMIA', 'ENDOSCOPIA_GASTROSTOMIA', '40202283', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Gastrostomia Endoscópica'),
  ('ENDOSCOPIA_GASTROSTOMIA (1ª PASSGEM)', 'ENDOSCOPIA', 'GASTROSTOMIA (1ª PASSGEM)', 'ENDOSCOPIA_GASTROSTOMIA (1ª PASSGEM)', '40202283', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Gastrostomia Endoscópica'),
  ('ENDOSCOPIA_GTT', 'ENDOSCOPIA', 'GTT', 'ENDOSCOPIA_GTT', '40202283', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Gastrostomia Endoscópica'),
  ('ENDOSCOPIA_GTT 1ª PASSAGEM', 'ENDOSCOPIA', 'GTT 1ª PASSAGEM', 'ENDOSCOPIA_GTT 1ª PASSAGEM', '40202283', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Gastrostomia Endoscópica'),
  ('ENDOSCOPIA_HEMOCLIP', 'ENDOSCOPIA', 'HEMOCLIP', 'ENDOSCOPIA_HEMOCLIP', '40202291', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Hemostasia mecânica do esôfago, estômago ou duodeno'),
  ('ENDOSCOPIA_HEMOSTASIA', 'ENDOSCOPIA', 'HEMOSTASIA', 'ENDOSCOPIA_HEMOSTASIA', '40202291', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Hemostasia mecânica do esôfago, estômago ou duodeno'),
  ('ENDOSCOPIA_HEMOSTASIA LEVE', 'ENDOSCOPIA', 'HEMOSTASIA LEVE', 'ENDOSCOPIA_HEMOSTASIA LEVE', '40202291', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Hemostasia mecânica do esôfago, estômago ou duodeno'),
  ('ENDOSCOPIA_HPYLORI', 'ENDOSCOPIA', 'HPYLORI', 'ENDOSCOPIA_HPYLORI', '40202615', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)'),
  ('ENDOSCOPIA_HPYLORI+POLIPOS GASTRICOS+LIGADURA ELASTICA', 'ENDOSCOPIA', 'HPYLORI+POLIPOS GASTRICOS+LIGADURA ELASTICA', 'ENDOSCOPIA_HPYLORI+POLIPOS GASTRICOS+LIGADURA ELASTICA', '40202615, 40202550, 40202453', 3, 'multiplos_cod_tuss_proced_adicional', '40201120', 'Endoscopia Alta Com Urease, Polipectomia E Ligadura'),
  ('ENDOSCOPIA_LIGADURA', 'ENDOSCOPIA', 'LIGADURA', 'ENDOSCOPIA_LIGADURA', '40202453', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Ligadura Elástica Do Esôfago, Estômago Ou Duodeno'),
  ('ENDOSCOPIA_LIGADURA DE VARIZES ESOFAGO', 'ENDOSCOPIA', 'LIGADURA DE VARIZES ESOFAGO', 'ENDOSCOPIA_LIGADURA DE VARIZES ESOFAGO', '40202453', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Ligadura Elástica Do Esôfago, Estômago Ou Duodeno'),
  ('ENDOSCOPIA_LIGADURA ELASTICA', 'ENDOSCOPIA', 'LIGADURA ELASTICA', 'ENDOSCOPIA_LIGADURA ELASTICA', '40202453', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Ligadura Elástica Do Esôfago, Estômago Ou Duodeno'),
  ('ENDOSCOPIA_MUCOSECTOMIA', 'ENDOSCOPIA', 'MUCOSECTOMIA', 'ENDOSCOPIA_MUCOSECTOMIA', '40202470', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Mucosectomia Do Esôfago, Estômago Ou Duodeno'),
  ('ENDOSCOPIA_PASSAGEM SNE', 'ENDOSCOPIA', 'PASSAGEM SNE', 'ENDOSCOPIA_PASSAGEM SNE', '40202534', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Passagem de sonda naso-enteral'),
  ('ENDOSCOPIA_PASSAGEM DE SNE', 'ENDOSCOPIA', 'PASSAGEM DE SNE', 'ENDOSCOPIA_PASSAGEM DE SNE', '40202534', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Passagem de sonda naso-enteral'),
  ('ENDOSCOPIA_PASSAGEM DE SONDA NASO ENTERAL', 'ENDOSCOPIA', 'PASSAGEM DE SONDA NASO ENTERAL', 'ENDOSCOPIA_PASSAGEM DE SONDA NASO ENTERAL', '40202534', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Passagem de sonda naso-enteral'),
  ('ENDOSCOPIA_PASSAGEM DE SONDA NASOENTERAL', 'ENDOSCOPIA', 'PASSAGEM DE SONDA NASOENTERAL', 'ENDOSCOPIA_PASSAGEM DE SONDA NASOENTERAL', '40202534', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Passagem de sonda naso-enteral'),
  ('ENDOSCOPIA_PASSAGEN SNE', 'ENDOSCOPIA', 'PASSAGEN SNE', 'ENDOSCOPIA_PASSAGEN SNE', '40202534', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Passagem de sonda naso-enteral'),
  ('ENDOSCOPIA_PLASMA DE ARGONIO', 'ENDOSCOPIA', 'PLASMA DE ARGONIO', 'ENDOSCOPIA_PLASMA DE ARGONIO', '40201376', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Aplicação de plasma de argônio por endoscopia digestiva alta'),
  ('ENDOSCOPIA_POLIPECTOMIA', 'ENDOSCOPIA', 'POLIPECTOMIA', 'ENDOSCOPIA_POLIPECTOMIA', '40202550', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Polipectomia Do Esôfago, Estômago Ou Duodeno (Independente Do Número De Pólipos)'),
  ('ENDOSCOPIA_REMOCAO DE BALAO', 'ENDOSCOPIA', 'REMOCAO DE BALAO', 'ENDOSCOPIA_REMOCAO DE BALAO', '40202577', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Retirada de corpo estranho do esôfago, estômago ou duodeno'),
  ('ENDOSCOPIA_RETIRADA DE CORPO ESTRANHO', 'ENDOSCOPIA', 'RETIRADA DE CORPO ESTRANHO', 'ENDOSCOPIA_RETIRADA DE CORPO ESTRANHO', '40202577', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Retirada de corpo estranho do esôfago, estômago ou duodeno'),
  ('ENDOSCOPIA_RETIRADA DE GTT', 'ENDOSCOPIA', 'RETIRADA DE GTT', 'ENDOSCOPIA_RETIRADA DE GTT', '40202577', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Retirada de corpo estranho do esôfago, estômago ou duodeno'),
  ('ENDOSCOPIA_TESTE UREASE', 'ENDOSCOPIA', 'TESTE UREASE', 'ENDOSCOPIA_TESTE UREASE', '40202615', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)'),
  ('ENDOSCOPIA_TESTE DE UEASE+POLIPECTOMIA', 'ENDOSCOPIA', 'TESTE DE UEASE+POLIPECTOMIA', 'ENDOSCOPIA_TESTE DE UEASE+POLIPECTOMIA', '40202615, 40202550', 2, 'multiplos_cod_tuss_proced_adicional', '40201120', 'Endoscopia Alta Com Urease E Polipectomia'),
  ('ENDOSCOPIA_TESTE DE UREASE', 'ENDOSCOPIA', 'TESTE DE UREASE', 'ENDOSCOPIA_TESTE DE UREASE', '40202615', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)'),
  ('ENDOSCOPIA_TESTE DE UREASE - NEGATIVO', 'ENDOSCOPIA', 'TESTE DE UREASE - NEGATIVO', 'ENDOSCOPIA_TESTE DE UREASE - NEGATIVO', '40202615', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)'),
  ('ENDOSCOPIA_TESTE DE UREASE+ANATOMO PATOLOGICO+POLIPECTOMIA', 'ENDOSCOPIA', 'TESTE DE UREASE+ANATOMO PATOLOGICO+POLIPECTOMIA', 'ENDOSCOPIA_TESTE DE UREASE+ANATOMO PATOLOGICO+POLIPECTOMIA', '40202615, 40202550', 2, 'multiplos_cod_tuss_proced_adicional', '40201120', 'Endoscopia Alta Com Urease E Polipectomia'),
  ('ENDOSCOPIA_TESTE DE UREASE - POSITIVO', 'ENDOSCOPIA', 'TESTE DE UREASE - POSITIVO', 'ENDOSCOPIA_TESTE DE UREASE - POSITIVO', '40202615', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)'),
  ('ENDOSCOPIA_TESTE DE UREASE+ANATOMO+POLIOECTOMIA', 'ENDOSCOPIA', 'TESTE DE UREASE+ANATOMO+POLIOECTOMIA', 'ENDOSCOPIA_TESTE DE UREASE+ANATOMO+POLIOECTOMIA', '40202615, 40202550', 2, 'multiplos_cod_tuss_proced_adicional', '40201120', 'Endoscopia Alta Com Urease E Polipectomia'),
  ('ENDOSCOPIA_TESTE DE UREASE+ANATOMO PATOLOGICO', 'ENDOSCOPIA', 'TESTE DE UREASE+ANATOMO PATOLOGICO', 'ENDOSCOPIA_TESTE DE UREASE+ANATOMO PATOLOGICO', '40202615', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)'),
  ('ENDOSCOPIA_TESTE DE UREASE+POLIPECTOMIA', 'ENDOSCOPIA', 'TESTE DE UREASE+POLIPECTOMIA', 'ENDOSCOPIA_TESTE DE UREASE+POLIPECTOMIA', '40202615, 40202550', 2, 'multiplos_cod_tuss_proced_adicional', '40201120', 'Endoscopia Alta Com Urease E Polipectomia'),
  ('ENDOSCOPIA_TESTE DE UREASE+ANATOMO', 'ENDOSCOPIA', 'TESTE DE UREASE+ANATOMO', 'ENDOSCOPIA_TESTE DE UREASE+ANATOMO', '40202615', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)'),
  ('ENDOSCOPIA_TESTE DE UREASE+ANATOMO+POLIPECTOMIA', 'ENDOSCOPIA', 'TESTE DE UREASE+ANATOMO+POLIPECTOMIA', 'ENDOSCOPIA_TESTE DE UREASE+ANATOMO+POLIPECTOMIA', '40202615, 40202550', 2, 'multiplos_cod_tuss_proced_adicional', '40201120', 'Endoscopia Alta Com Urease E Polipectomia'),
  ('ENDOSCOPIA_TESTE DE UREASE+POLIPECTOMIA+ANATOMO PATOLOGICO', 'ENDOSCOPIA', 'TESTE DE UREASE+POLIPECTOMIA+ANATOMO PATOLOGICO', 'ENDOSCOPIA_TESTE DE UREASE+POLIPECTOMIA+ANATOMO PATOLOGICO', '40202615, 40202550', 2, 'multiplos_cod_tuss_proced_adicional', '40201120', 'Endoscopia Alta Com Urease E Polipectomia'),
  ('ENDOSCOPIA_TESTE DE UREASEA', 'ENDOSCOPIA', 'TESTE DE UREASEA', 'ENDOSCOPIA_TESTE DE UREASEA', '40202615', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)'),
  ('ENDOSCOPIA_TESTE DE URESE', 'ENDOSCOPIA', 'TESTE DE URESE', 'ENDOSCOPIA_TESTE DE URESE', '40202615', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)'),
  ('ENDOSCOPIA_TESTE E UREASE', 'ENDOSCOPIA', 'TESTE E UREASE', 'ENDOSCOPIA_TESTE E UREASE', '40202615', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)'),
  ('ENDOSCOPIA_TESTE UREASE - NEGATIVO', 'ENDOSCOPIA', 'TESTE UREASE - NEGATIVO', 'ENDOSCOPIA_TESTE UREASE - NEGATIVO', '40202615', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)'),
  ('ENDOSCOPIA_TESTE UREASE - POSITIVO', 'ENDOSCOPIA', 'TESTE UREASE - POSITIVO', 'ENDOSCOPIA_TESTE UREASE - POSITIVO', '40202615', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)'),
  ('ENDOSCOPIA_TESTE UREASE+ANATOMO PATOLOGICO', 'ENDOSCOPIA', 'TESTE UREASE+ANATOMO PATOLOGICO', 'ENDOSCOPIA_TESTE UREASE+ANATOMO PATOLOGICO', '40202615', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Endoscopia Digestiva Alta Com Biópsia E Teste De Urease (Pesquisa Helicobacter Pylori)'),
  ('ENDOSCOPIA_TESTE UREASE+ANATOMO+POLIPECTOMIA', 'ENDOSCOPIA', 'TESTE UREASE+ANATOMO+POLIPECTOMIA', 'ENDOSCOPIA_TESTE UREASE+ANATOMO+POLIPECTOMIA', '40202615, 40202550', 2, 'multiplos_cod_tuss_proced_adicional', '40201120', 'Endoscopia Alta Com Urease E Polipectomia'),
  ('ENDOSCOPIA_TROCA DE GTT (BOTTON)', 'ENDOSCOPIA', 'TROCA DE GTT (BOTTON)', 'ENDOSCOPIA_TROCA DE GTT (BOTTON)', '40202283', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Gastrostomia endoscópica'),
  ('ENDOSCOPIA_TROCA DE GTT', 'ENDOSCOPIA', 'TROCA DE GTT', 'ENDOSCOPIA_TROCA DE GTT', '40202283', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Gastrostomia endoscópica'),
  ('ENDOSCOPIA_TROCA GTT', 'ENDOSCOPIA', 'TROCA GTT', 'ENDOSCOPIA_TROCA GTT', '40202283', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201120', 'Gastrostomia endoscópica'),
  ('EXAME REALIZADO_PROCEDIMENTOS ADICIONAIS', 'EXAME REALIZADO', 'PROCEDIMENTOS ADICIONAIS', 'EXAME REALIZADO_PROCEDIMENTOS ADICIONAIS', NULL, 0, 'sem_mapeamento_tuss', NULL, 'Erro de leitura de cabeçalho do PDF'),
  ('GASTROSTOMIA 1ª PASSAGEM_', 'GASTROSTOMIA 1ª PASSAGEM', NULL, 'GASTROSTOMIA 1ª PASSAGEM_', '40202283', 1, 'unico_cod_tuss_somente_proc_principal', '40202283', 'Gastrostomia Endoscópica'),
  ('GASTROSTOMIA ENDOSCOPICA_', 'GASTROSTOMIA ENDOSCOPICA', NULL, 'GASTROSTOMIA ENDOSCOPICA_', '40202283', 1, 'unico_cod_tuss_somente_proc_principal', '40202283', 'Gastrostomia endoscópica'),
  ('GASTROSTOMIA ENDOSCOPICA_ANATOMO PATOLOGICO', 'GASTROSTOMIA ENDOSCOPICA', 'ANATOMO PATOLOGICO', 'GASTROSTOMIA ENDOSCOPICA_ANATOMO PATOLOGICO', '40202283, 40202038', 2, 'multiplos_cod_tuss_proced_adicional', '40202283', 'Gastrostomia Endoscópica Com Biópsia E/Ou Citologia'),
  ('GASTROSTOMIA ENDOSCOPICA_GASTROSTOMIA+ANATOMO PATOLOGICO', 'GASTROSTOMIA ENDOSCOPICA', 'GASTROSTOMIA+ANATOMO PATOLOGICO', 'GASTROSTOMIA ENDOSCOPICA_GASTROSTOMIA+ANATOMO PATOLOGICO', '40202283, 40202038', 2, 'multiplos_cod_tuss_proced_adicional', '40202283', 'Gastrostomia Endoscópica Com Biópsia E/Ou Citologia'),
  ('GASTROSTOMIA_', 'GASTROSTOMIA', NULL, 'GASTROSTOMIA_', '40202283', 1, 'unico_cod_tuss_somente_proc_principal', '40202283', 'Gastrostomia Endoscópica'),
  ('GTT_', 'GTT', NULL, 'GTT_', '40202283', 1, 'unico_cod_tuss_somente_proc_principal', '40202283', 'Gastrostomia Endoscópica'),
  ('HEMOSTASIA_POLIPECTOMIA', 'HEMOSTASIA', 'POLIPECTOMIA', 'HEMOSTASIA_POLIPECTOMIA', '40202291, 40202550', 2, 'multiplos_cod_tuss_proced_adicional', NULL, 'Endoscopia Alta Com Hemostasia E Polipectomia'),
  ('LIGADURA ELASTICA_HEMOSTASIA LEVE', 'LIGADURA ELASTICA', 'HEMOSTASIA LEVE', 'LIGADURA ELASTICA_HEMOSTASIA LEVE', '40202453, 40202291', 2, 'multiplos_cod_tuss_proced_adicional', NULL, 'Endoscopia Alta Com Ligadura E Hemostasia'),
  ('MUCOSECTOMIA_', 'MUCOSECTOMIA', NULL, 'MUCOSECTOMIA_', '40202470', 1, 'unico_cod_tuss_somente_proc_principal', '40202470', 'Mucosectomia Do Esôfago, Estômago Ou Duodeno'),
  ('MUCOSECTOMIA_POLIPECTOMIA', 'MUCOSECTOMIA', 'POLIPECTOMIA', 'MUCOSECTOMIA_POLIPECTOMIA', '40202470, 40202550', 2, 'multiplos_cod_tuss_proced_adicional', '40202470', 'Endoscopia Alta Com Mucosectomia E Polipectomia'),
  ('PASSAGEM DE SNE_', 'PASSAGEM DE SNE', NULL, 'PASSAGEM DE SNE_', '40202534', 1, 'unico_cod_tuss_somente_proc_principal', '40202534', 'Passagem de sonda naso-enteral'),
  ('PASSAGEM DE SONDA POR ENDOSCOPIA_', 'PASSAGEM DE SONDA POR ENDOSCOPIA', NULL, 'PASSAGEM DE SONDA POR ENDOSCOPIA_', '40202534', 1, 'unico_cod_tuss_somente_proc_principal', '40202534', 'Passagem de Sondas por Endoscopia'),
  ('PASSAGEM SNE_', 'PASSAGEM SNE', NULL, 'PASSAGEM SNE_', '40202534', 1, 'unico_cod_tuss_somente_proc_principal', '40202534', 'Passagem de sonda naso-enteral'),
  ('RETIRADA DE PROTESE TRANSPAPILAR_', 'RETIRADA DE PROTESE TRANSPAPILAR', NULL, 'RETIRADA DE PROTESE TRANSPAPILAR_', '40201074', 1, 'unico_cod_tuss_somente_proc_principal', '40201074', 'Colangiopancreatografia Retrógrada Endoscópica'),
  ('RETO_', 'RETO', NULL, 'RETO_', '40201171', 1, 'unico_cod_tuss_somente_proc_principal', '40201171', 'Retossigmoidoscopia Flexível'),
  ('RETO_ANATOMO PATOLOGICO', 'RETO', 'ANATOMO PATOLOGICO', 'RETO_ANATOMO PATOLOGICO', '40202690', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201171', 'Retossigmoidoscopia flexível com biópsia e/ou citologia'),
  ('RETOSIGMOIDECTOMIA_ANATOMO PATOLOGICO', 'RETOSIGMOIDECTOMIA', 'ANATOMO PATOLOGICO', 'RETOSIGMOIDECTOMIA_ANATOMO PATOLOGICO', '40202690', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', NULL, 'Retossigmoidoscopia flexível com biópsia e/ou citologia'),
  ('RETOSSIGMOIDECTOMIA FLEXIVEL_', 'RETOSSIGMOIDECTOMIA FLEXIVEL', NULL, 'RETOSSIGMOIDECTOMIA FLEXIVEL_', '40201171', 1, 'unico_cod_tuss_somente_proc_principal', '40201171', 'Retossigmoidoscopia Flexível'),
  ('RETOSSIGMOIDECTOMIA FLEXIVEL_ANATOMO PATOLOGICO', 'RETOSSIGMOIDECTOMIA FLEXIVEL', 'ANATOMO PATOLOGICO', 'RETOSSIGMOIDECTOMIA FLEXIVEL_ANATOMO PATOLOGICO', '40202690', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201171', 'Retossigmoidoscopia flexível com biópsia e/ou citologia'),
  ('RETOSSIGMOIDOSCOPIA FLEXIVEL_', 'RETOSSIGMOIDOSCOPIA FLEXIVEL', NULL, 'RETOSSIGMOIDOSCOPIA FLEXIVEL_', '40201171', 1, 'unico_cod_tuss_somente_proc_principal', '40201171', 'Retossigmoidoscopia Flexível'),
  ('RETOSSIGMOIDOSCOPIA_', 'RETOSSIGMOIDOSCOPIA', NULL, 'RETOSSIGMOIDOSCOPIA_', '40201171', 1, 'unico_cod_tuss_somente_proc_principal', '40201171', 'Retossigmoidoscopia Flexível'),
  ('RETOSSIGMOIDOSCOPIA_ANATOMO PATOLOGICO', 'RETOSSIGMOIDOSCOPIA', 'ANATOMO PATOLOGICO', 'RETOSSIGMOIDOSCOPIA_ANATOMO PATOLOGICO', '40202690', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201171', 'Retossigmoidoscopia flexível com biópsia e/ou citologia'),
  ('RETOSSIGMOIDOSCOPIA_POLIPECTOMIA', 'RETOSSIGMOIDOSCOPIA', 'POLIPECTOMIA', 'RETOSSIGMOIDOSCOPIA_POLIPECTOMIA', '40202682', 1, 'unico_cod_tuss_inclui_proc_adicional_e_principal', '40201171', 'Retossigmoidoscopia Flexível Com Polipectomia'),
  ('TROCA DE GTT_', 'TROCA DE GTT', NULL, 'TROCA DE GTT_', '40202283', 1, 'unico_cod_tuss_somente_proc_principal', '40202283', 'Gastrostomia endoscópica'),
  ('TROCA DE GTT_ANATOMO PATOLOGICO', 'TROCA DE GTT', 'ANATOMO PATOLOGICO', 'TROCA DE GTT_ANATOMO PATOLOGICO', '40202283, 40202038', 2, 'multiplos_cod_tuss_proced_adicional', '40202283', 'Gastrostomia Endoscópica Com Biópsia E/Ou Citologia')
ON CONFLICT (chave_norm) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 4. VERIFICAÇÃO
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_total   INTEGER;
  v_sem_tuss INTEGER;
  v_table   BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tuss_lookup_table'
  ) INTO v_table;

  IF v_table THEN
    SELECT COUNT(*) INTO v_total    FROM public.tuss_lookup_table;
    SELECT COUNT(*) INTO v_sem_tuss FROM public.tuss_lookup_table
      WHERE "TipoCobranca" = 'sem_mapeamento_tuss';

    RAISE NOTICE '=== TUSS Lookup Migration Check ===';
    RAISE NOTICE 'Tabela tuss_lookup_table ......... OK ✓';
    RAISE NOTICE 'Total de mapeamentos ............. %', v_total;
    RAISE NOTICE 'Sem mapeamento TUSS (lacunas) .... %', v_sem_tuss;
    RAISE NOTICE 'Com código TUSS .................. %', v_total - v_sem_tuss;
    RAISE NOTICE '===================================';
  ELSE
    RAISE WARNING 'Tabela tuss_lookup_table NÃO foi criada! ✗';
  END IF;
END;
$$;


-- ============================================================
--  PÓS-INSTALAÇÃO
-- ============================================================
--
--  O mapeamento seed cobre os procedimentos históricos do
--  consultório. Novos procedimentos sem mapeamento aparecerão
--  automaticamente na aba "Configurações → Lacunas TUSS" do
--  frontend para preenchimento manual.
--
--  Para sincronizar o backend (app.py) com este banco:
--    • O backend atualmente lê de tuss_lookup_table.csv local.
--    • Próximo passo: substituir _carregar_tabela_tuss() por
--      leitura via Supabase REST (SUPABASE_SECRET_KEY).
--    • Ou: exportar do Supabase como CSV no deploy.
--
--  Para atualizar um mapeamento existente via SQL:
--    UPDATE public.tuss_lookup_table
--    SET "CodigosTUSS" = '40202038',
--        "TipoCobranca" = 'unico_cod_tuss_inclui_proc_adicional_e_principal',
--        codigo_base_proc_principal = '40201120',
--        atualizado_em = NOW()
--    WHERE chave_norm = 'ENDOSCOPIA_ANATOMO PATOLOGICO';
--
-- ============================================================


-- ============================================================
-- ARQUIVO: 3_correlacao-migration.sql
-- ============================================================

-- ============================================================
--  Correlação Endoscopia — Tabela Principal
--  Execute no SQL Editor do Supabase (uma vez).
--
--  Pré-requisito: rbac-migration.sql já executado (get_my_role).
--
--  Seções:
--    1. Extensão pg_trgm
--    2. CREATE TABLE correlacao_endoscopia
--    3. UNIQUE constraint (lote_processamento, hash_conteudo)
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
-- 3. UNIQUE CONSTRAINT
--    Garante que dentro de um mesmo lote não há dois registros
--    com conteúdo idêntico (hash igual). Duplicatas intra-batch
--    são silenciadas pelo ON CONFLICT DO NOTHING no app.py.
--
--    Separação de responsabilidades:
--      Intra-lote  → este constraint + ON CONFLICT DO NOTHING
--      Cross-lote  → trigger BEFORE INSERT (is_duplicata, id_original)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.correlacao_endoscopia
  ADD CONSTRAINT correlacao_lote_hash_uniq
  UNIQUE (lote_processamento, hash_conteudo);


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
    SELECT 1 FROM pg_constraint
     WHERE conname = 'correlacao_lote_hash_uniq'
       AND conrelid = 'public.correlacao_endoscopia'::regclass
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
--  UNIQUE: (lote_processamento, hash_conteudo)
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


-- ============================================================
-- ARQUIVO: 4_rollback-migration.sql
-- ============================================================

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


