export type StatusCorrelacao =
  | 'CORRELACIONADO'
  | 'CORRELACIONADO_COM_GLOSA_TOTAL'
  | 'CORRELACIONADO_COM_GLOSA_PARCIAL'
  | 'CORRELACIONADO_FALLBACK_1'
  | 'CORRELACIONADO_FALLBACK_2'
  | 'CORRELACIONADO_VIA_NR_ATENDIMENTO'
  | 'CORRELACIONADO_PROCEDIMENTO_DIVERGENTE'
  | 'CORRELACIONADO_FALLBACK_1_PROCEDIMENTO_DIVERGENTE'
  | 'CORRELACIONADO_FALLBACK_2_PROCEDIMENTO_DIVERGENTE'
  | 'CORRELACIONADO_VIA_NR_ATENDIMENTO_PROCEDIMENTO_DIVERGENTE'
  | 'CORRELACIONADO_PROCEDIMENTO_ADICIONAL'
  | 'NAO_FATURADO_NO_REPASSE'
  | 'REPASSE_NAO_IDENTIFICADO_NA_PRODUCAO'
  | 'REPASSE_DATA_FORA_DO_PERIODO_PRODUCAO'

export type StatusTUSS =
  | 'TUSS_PROC_PRINCIPAL_OK'
  | 'TUSS_ADICIONAL_INCORPORADO_NO_PRINCIPAL'
  | 'TUSS_PROC_ADICIONAL_RECONHECIDO'
  | 'TUSS_TODOS_CODIGOS_ADICIONAIS_FATURADOS'
  | 'TUSS_CODIGO_PRINCIPAL_DIVERGENTE'
  | 'TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES'
  | 'TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE'
  | 'TUSS_NAO_FATURADO_MAPEADO'
  | 'TUSS_REPASSE_SEM_PRODUCAO'
  | 'TUSS_COMBINACAO_SEM_MAPEAMENTO'

export type MetodoMatch =
  | '1_NOME_COMPLETO_DATA_PROCEDIMENTO'
  | '2_FALLBACK_NR-ATENDIMENTO_DATA_PROCEDIMENTO'
  | '3_FALLBACK_NOME_PARCIAL_FUZZY_DATA_FIXA'
  | '4_FALLBACK_NOME_COMPLETO_DATA-FLEXIVEL'
  | '5_FALLBACK_PROCEDIMENTO_ADICIONAL_PROCEDIMENTO_ADICIONAL'
  | 'SEM_MATCH'

export type DecisaoHumana = 'confirmado' | 'desvinculado' | null

export interface Correlacao {
  id: string // mapped from ChaveCorrelacao
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
  // Audit columns (to be added via migration)
  decisao_humana?: DecisaoHumana
  revisado_em?: string | null
  notas_revisor?: string | null
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
