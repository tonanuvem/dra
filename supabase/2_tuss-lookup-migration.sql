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
--  5. VIEW: correlacao_endoscopia_com_tipo
-- ============================================================
--  Expõe todos os campos de correlacao_endoscopia enriquecidos
--  com TipoCobranca da tuss_lookup_table, via JOIN pela chave
--  normalizada (mesma lógica de _normalizar_chave_tuss no Python:
--  strip → upper → remove acentos → colapsa separadores).
--
--  Idempotente: CREATE OR REPLACE não requer DROP prévio.
-- ─────────────────────────────────────────────────────────────

-- Extensão necessária para remover acentos (nativa no Supabase/Postgres)
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE VIEW public.correlacao_endoscopia_com_tipo AS
SELECT
  c.*,
  t."TipoCobranca"
FROM public.correlacao_endoscopia c
LEFT JOIN public.tuss_lookup_table t
  ON t.chave_norm = (
    -- Replica _normalizar_chave_tuss(Procedimento_PRODUCAO + '_' + ProcedimentosAdicionais_PRODUCAO)
    -- 1. Concatena proc + '_' + adicional (ou só proc + '_' se adicional for nulo)
    -- 2. Strip + Upper
    -- 3. Remove acentos via unaccent (extensão nativa do Supabase/Postgres)
    -- 4. Colapsa separadores +/;, → '+'  e espaços ao redor do '+'
    -- 5. Colapsa múltiplos espaços
    regexp_replace(
      regexp_replace(
        regexp_replace(
          upper(trim(
            unaccent(
              coalesce(c."Procedimento_PRODUCAO", '') ||
              '_' ||
              coalesce(c."ProcedimentosAdicionais_PRODUCAO", '')
            )
          )),
          '[+/;,]+', '+', 'g'          -- colapsa separadores → '+'
        ),
        '\s*\+\s*', '+', 'g'           -- remove espaços ao redor do '+'
      ),
      '\s+', ' ', 'g'                  -- colapsa múltiplos espaços
    )
  );

-- RLS: a view herda as políticas das tabelas subjacentes.
-- Concede leitura para usuários autenticados (mesma política da tabela base).
GRANT SELECT ON public.correlacao_endoscopia_com_tipo TO authenticated;

-- Verificação
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name   = 'correlacao_endoscopia_com_tipo'
  ) THEN
    RAISE NOTICE 'View correlacao_endoscopia_com_tipo ... OK ✓';
  ELSE
    RAISE WARNING 'View correlacao_endoscopia_com_tipo NÃO foi criada! ✗';
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
