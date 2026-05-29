export type StatusCorrelacao =
  | 'CORRELACIONADO'
  | 'NAO_FATURADO_NO_REPASSE'
  | 'REPASSE_NAO_IDENTIFICADO_NA_PRODUCAO'
  | 'REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO'

export type StatusTUSS =
  // ── OK: já pago / correto ────────────────────────────────────────
  | 'OK_TUSS_PROC_PRINCIPAL_OK'
  | 'OK_TUSS_ADICIONAL_INCORPORADO_NO_PRINCIPAL'
  | 'OK_TUSS_PROC_ADICIONAL_RECONHECIDO'
  | 'OK_TUSS_TODOS_CODIGOS_ADICIONAIS_FATURADOS'
  | 'OK_TUSS_CODIGO_PRINCIPAL_UPGRADE'
  // ── COBRAR: valor a recuperar ────────────────────────────────────
  | 'COBRAR_TUSS_CODIGO_PRINCIPAL_DIVERGENTE'
  | 'COBRAR_TUSS_CODIGO_PRINCIPAL_DOWNGRADE'
  | 'COBRAR_TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES'
  | 'COBRAR_TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE'
  | 'COBRAR_TUSS_NAO_FATURADO_MAPEADO'
  // ── CORRELACIONAR_MANUAL: requer revisão humana ──────────────────
  | 'CORRELACIONAR_MANUAL_TUSS_REPASSE_SEM_PRODUCAO'
  | 'CORRELACIONAR_MANUAL_TUSS_COMBINACAO_SEM_MAPEAMENTO'

export type MetodoMatch =
  | '1_NOME_COMPLETO_DATA_PROCEDIMENTO'
  | '2_FALLBACK_NR-ATENDIMENTO_DATA_PROCEDIMENTO'
  | '3_FALLBACK_NOME_PARCIAL_FUZZY_DATA_FIXA'
  | '4_FALLBACK_NOME_COMPLETO_DATA-FLEXIVEL'
  | '5_FALLBACK_COMPANION_PROCEDIMENTO_ADICIONAL'
  | '1_NOME_COMPLETO_DATA_PROCEDIMENTO_PROCEDIMENTO_DIVERGENTE'
  | '2_FALLBACK_NR-ATENDIMENTO_DATA_PROCEDIMENTO_PROCEDIMENTO_DIVERGENTE'
  | '3_FALLBACK_NOME_PARCIAL_FUZZY_DATA_FIXA_PROCEDIMENTO_DIVERGENTE'
  | '4_FALLBACK_NOME_COMPLETO_DATA-FLEXIVEL_PROCEDIMENTO_DIVERGENTE'
  | 'SEM_MATCH'

export type DecisaoHumana = 'confirmado' | 'desvinculado' | null

export interface Correlacao {
  /** UUID surrogate PK gerado pelo banco (gen_random_uuid()) */
  id: string
  /** Identificador do lote de carga — ex.: "20260527_181451" */
  lote_processamento: string
  /** MD5 dos 11 campos discriminantes para deduplicação */
  hash_conteudo: string
  /** true = duplicata identificada pelo trigger (oculta na auditoria) */
  is_duplicata: boolean
  /** UUID da primeira ocorrência quando is_duplicata=true */
  id_original: string | null
  /** Timestamp de inserção no banco */
  criado_em: string
  // ── Soft delete (rollback-migration.sql) ──────────────────
  /** false = desativado por trigger de versionamento ou invalidação manual */
  ativo: boolean
  desativado_em: string | null
  desativado_por: string | null
  motivo_desativacao: string | null
  rollback_operacao_id: string | null
  ChaveCorrelacao: string
  QTD_PRODUCAO: number | null
  Data_PRODUCAO: string | null
  Paciente_PRODUCAO: string | null
  NrAtendimento_PRODUCAO: string | null
  Convenio_PRODUCAO: string | null
  Origem_PRODUCAO: string | null
  Procedimento_PRODUCAO: string | null
  ProcedimentosAdicionais_PRODUCAO: string | null
  MedicoExecutor_PRODUCAO: string | null
  LocalSetor_PRODUCAO: string | null
  Sala_PRODUCAO: string | null
  Carater_PRODUCAO: string | null
  Observacao_PRODUCAO: string | null
  AbaOrigemDados_PRODUCAO: string | null
  SimilaridadeProcedimento: number | null
  MetodoMatch: MetodoMatch | null
  StatusCorrelacao: StatusCorrelacao | null
  Estabelecimento_REPASSE: string | null
  CNPJ_REPASSE: string | null
  Terceiro_REPASSE: string | null
  Status_REPASSE: string | null
  NrRepasse_REPASSE: string | null
  TipoItem_REPASSE: string | null
  NrAtendimento_REPASSE: string | null
  TipoAtendimento_REPASSE: string | null
  NrInternoConta_REPASSE: string | null
  Paciente_REPASSE: string | null
  Convenio_REPASSE: string | null
  Categoria_REPASSE: string | null
  CodigoTUSS_REPASSE: string | null
  Procedimento_REPASSE: string | null
  Via_REPASSE: string | null
  MedicoExecutor_REPASSE: string | null
  Porcentagem_REPASSE: number | null
  Funcao_REPASSE: string | null
  Especialidade_REPASSE: string | null
  QtProcedimento_REPASSE: number | null
  Data_REPASSE: string | null
  ValorLiberado_REPASSE: number | null
  AbaOrigemDados_REPASSE: string | null
  StatusTUSS: StatusTUSS | null
  CodigosTUSS_Esperados: string | null
  DescricaoTUSS: string | null
  CodigosTUSS_Ausentes: string | null
  ValorEstimado_TUSS: number | null
  decisao_humana: DecisaoHumana
  revisado_em: string | null
  notas_revisor: string | null
}

export interface TussMapeamento {
  id: string
  procedimento_combinacao: string
  codigo_tuss_oficial: string
  regra_cobranca: string | null
  criado_em: string
  ativo: boolean
}

export interface DashboardStats {
  total: number
  correlacionados: number
  naoFaturados: number
  repasseNaoIdentificado: number
  glosaTotal: number
  glosaParci: number
  pendentesRevisao: number
  valorRecuperar: number
  valorGlosa: number
}

export type Database = {
  public: {
    Tables: {
      correlacao_endoscopia: {
        Row: Correlacao
        Insert: Partial<Correlacao>
        Update: Partial<Correlacao>
      }
      tuss_mapeamento: {
        Row: TussMapeamento
        Insert: Partial<TussMapeamento>
        Update: Partial<TussMapeamento>
      }
    }
  }
}
