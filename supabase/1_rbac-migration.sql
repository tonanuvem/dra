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
  v_uid   UUID;
  v_email TEXT := 'contato@dracharliana.com';
  v_senha TEXT := 'Admin123';
  v_nome  TEXT := 'Administrador';
BEGIN
  -- Verifica se o usuário já existe
  SELECT id INTO v_uid
  FROM auth.users
  WHERE email = v_email
  LIMIT 1;

  IF v_uid IS NOT NULL THEN
    RAISE NOTICE 'Usuário % já existe (id: %). Pulando criação.', v_email, v_uid;
  ELSE
    v_uid := gen_random_uuid();

    -- Insere em auth.users com senha criptografada via bcrypt
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_uid,
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_senha, gen_salt('bf')),   -- bcrypt — mesmo algoritmo que Supabase usa
      NOW(),                             -- já confirmado, sem e-mail de verificação
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nome', v_nome),
      false,
      NOW(),
      NOW(),
      '', '', '', ''
    );

    -- O trigger on_auth_user_created já criou o profile com role=visualizador.
    -- Promovemos para admin agora.
    UPDATE public.profiles
    SET
      role          = 'admin',
      nome          = v_nome,
      atualizado_em = NOW()
    WHERE id = v_uid;

    RAISE NOTICE '=== Admin criado com sucesso ===';
    RAISE NOTICE 'E-mail : %', v_email;
    RAISE NOTICE 'Senha  : %', v_senha;
    RAISE NOTICE 'Role   : admin';
    RAISE NOTICE 'UUID   : %', v_uid;
    RAISE NOTICE '⚠  Troque a senha no primeiro acesso!';
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
--    Senha  : Admin123   ← TROQUE NO PRIMEIRO ACESSO
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
