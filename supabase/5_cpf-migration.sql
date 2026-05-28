-- ============================================================
--  CPF Migration — Endoscopia Auditoria de Faturamento
--  Execute este script no SQL Editor do Supabase após
--  rodar 1_rbac-migration.sql.
--
--  O que este script faz:
--    1. Adiciona coluna cpf à tabela profiles
--    2. Cria índice único para lookup eficiente
--    3. Atualiza a view user_profiles_view para incluir cpf
--    4. Atualiza o trigger handle_new_user para aceitar cpf
--       em user_metadata (usado na criação via API admin)
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. COLUNA CPF NA TABELA PROFILES
--    Armazenado como 11 dígitos sem formatação (ex: "12345678901").
--    O frontend aplica a máscara 000.000.000-00 apenas na exibição.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cpf TEXT DEFAULT NULL;

-- Garante unicidade (dois usuários não podem ter o mesmo CPF).
-- Usa índice parcial para ignorar NULLs (padrão ANSI SQL: NULL ≠ NULL).
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_cpf_unique;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_cpf_unique UNIQUE (cpf);

-- Índice para busca rápida por CPF no login
CREATE INDEX IF NOT EXISTS profiles_cpf_idx ON public.profiles (cpf)
  WHERE cpf IS NOT NULL;

COMMENT ON COLUMN public.profiles.cpf IS
  'CPF do usuário — 11 dígitos sem formatação (ex: "12345678901"). Opcional, único.';


-- ─────────────────────────────────────────────────────────────
-- 2. POLICY RLS — o próprio usuário pode atualizar seu CPF
--    A policy de self update existente verifica role e ativo,
--    mas como cpf agora pode mudar, substituímos a WITH CHECK
--    para permitir alteração do próprio CPF.
-- ─────────────────────────────────────────────────────────────

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

-- Nota: a policy de admin full access (criada em 1_rbac-migration.sql)
-- já cobre INSERT/UPDATE/DELETE do campo cpf para admins.


-- ─────────────────────────────────────────────────────────────
-- 3. VIEW SEGURA — inclui cpf para o painel admin
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.user_profiles_view AS
  SELECT
    p.id,
    p.email,
    p.nome,
    p.cpf,
    p.role,
    p.ativo,
    p.criado_em,
    p.atualizado_em,
    u.last_sign_in_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id;

COMMENT ON VIEW public.user_profiles_view IS
  'Visão segura para listagem de usuários no painel admin. Inclui cpf. Sujeita a RLS da tabela profiles.';


-- ─────────────────────────────────────────────────────────────
-- 4. TRIGGER — aceita cpf em user_metadata
--    Ao criar usuário via API admin (POST /api/admin/invite),
--    o endpoint pode passar cpf em user_metadata para que o
--    trigger já insira o campo na profiles.
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
  -- Normaliza CPF: remove tudo que não é dígito; NULL se vazio ou não 11 dígitos
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
-- 5. VERIFICAÇÃO
-- ─────────────────────────────────────────────────────────────

-- Execute para confirmar que a coluna existe e a view foi atualizada:
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'profiles'
--   ORDER BY ordinal_position;

-- SELECT * FROM public.user_profiles_view LIMIT 1;
