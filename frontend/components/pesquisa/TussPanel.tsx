'use client'

import { formatCurrency } from '@/lib/utils'
import { StatusTUSSBadge } from '@/components/shared/StatusBadge'
import type { Correlacao } from '@/lib/types'

// Ação recomendada por StatusTUSS — linguagem de negócio
const TUSS_ACAO: Record<string, { texto: string; cor: 'green' | 'red' | 'orange' | 'yellow' }> = {
  OK_TUSS_PROC_PRINCIPAL_OK:                         { texto: 'Código TUSS correto — nenhuma ação necessária.',                                                cor: 'green'  },
  OK_TUSS_ADICIONAL_INCORPORADO_NO_PRINCIPAL:        { texto: 'Adicional incorporado ao código principal — sem ação.',                                         cor: 'green'  },
  OK_TUSS_PROC_ADICIONAL_RECONHECIDO:                { texto: 'Adicional faturado com código correto — sem ação.',                                             cor: 'green'  },
  OK_TUSS_TODOS_CODIGOS_ADICIONAIS_FATURADOS:        { texto: 'Todos os adicionais faturados corretamente — sem ação.',                                        cor: 'green'  },
  OK_TUSS_CODIGO_PRINCIPAL_UPGRADE:                  { texto: 'Repasse utilizou código superior ao esperado — sem ação (favorável à clínica).',                cor: 'green'  },
  COBRAR_TUSS_PROC_ADICIONAL_COBRADO_COMO_SIMPLES:   { texto: 'Adicional faturado como procedimento simples — cobrar a diferença entre os códigos.',           cor: 'red'    },
  COBRAR_TUSS_CODIGO_ADICIONAL_AUSENTE_NO_REPASSE:   { texto: 'Código adicional ausente no repasse — solicitar cobrança do procedimento complementar.',        cor: 'red'    },
  COBRAR_TUSS_CODIGO_PRINCIPAL_DOWNGRADE:            { texto: 'Repasse utilizou código mais simples — cobrar a diferença de valor.',                           cor: 'red'    },
  COBRAR_TUSS_CODIGO_PRINCIPAL_DIVERGENTE:           { texto: 'Código principal diverge do esperado — verificar clinicamente e cobrar a diferença.',           cor: 'orange' },
  COBRAR_TUSS_NAO_FATURADO_MAPEADO:                  { texto: 'Procedimento não cobrado no repasse — código TUSS identificado, solicitar cobrança total.',     cor: 'red'    },
  CORRELACIONAR_MANUAL_TUSS_REPASSE_SEM_PRODUCAO:    { texto: 'Repasse sem registro de produção — verificar se é procedimento novo ou erro de cadastro.',      cor: 'yellow' },
  CORRELACIONAR_MANUAL_TUSS_COMBINACAO_SEM_MAPEAMENTO: { texto: 'Combinação de procedimentos sem mapeamento TUSS — cadastrar na tabela de mapeamento.',       cor: 'yellow' },
}

const COR_BG: Record<string, string> = {
  green:  'bg-green-50  border-green-200  text-green-800',
  red:    'bg-red-50    border-red-200    text-red-800',
  orange: 'bg-orange-50 border-orange-200 text-orange-800',
  yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
}

interface TussPanelProps {
  item: Correlacao
  showFinancial?: boolean
}

export function TussPanel({ item, showFinancial = true }: TussPanelProps) {
  const acao = item.StatusTUSS ? TUSS_ACAO[item.StatusTUSS] : null

  const codigoEsperado = item.CodigosTUSS_Esperados || '—'
  const codigoPago     = item.CodigoTUSS_REPASSE     || '—'
  const descEsperada   = item.DescricaoTUSS          || '—'
  const descPaga       = item.Procedimento_REPASSE   || '—'
  const valEst         = item.ValorEstimado_TUSS     ?? null
  const valPago        = item.ValorLiberado_REPASSE  ?? null
  const gap            = valEst != null && valPago != null ? valEst - valPago : null

  return (
    <div className="flex flex-col gap-3">

      {/* Badge + Ação */}
      <div className="flex items-start gap-3 flex-wrap">
        <StatusTUSSBadge status={item.StatusTUSS} />
        {acao && (
          <p className={`flex-1 text-xs px-3 py-2 rounded-lg border font-medium leading-snug ${COR_BG[acao.cor]}`}>
            {acao.texto}
          </p>
        )}
      </div>

      {/* Tabela Esperado / Pago / Gap */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400 border-b border-gray-100">
              <th className="text-left pb-2 font-medium w-28">Campo</th>
              <th className="text-left pb-2 font-medium">Esperado (Mapeamento)</th>
              <th className="text-left pb-2 font-medium">Pago (Repasse)</th>
              {showFinancial && <th className="text-right pb-2 font-medium text-red-500">Gap</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            <tr>
              <td className="py-2 text-gray-400 font-medium">Código TUSS</td>
              <td className="py-2 font-mono text-gray-800">{codigoEsperado}</td>
              <td className="py-2 font-mono text-gray-800">{codigoPago}</td>
              {showFinancial && <td className="py-2" />}
            </tr>
            <tr>
              <td className="py-2 text-gray-400 font-medium">Descrição</td>
              <td className="py-2 text-gray-700 leading-snug">{descEsperada}</td>
              <td className="py-2 text-gray-700 leading-snug">{descPaga}</td>
              {showFinancial && <td className="py-2" />}
            </tr>
            {showFinancial && (
              <tr>
                <td className="py-2 text-gray-400 font-medium">Valor</td>
                <td className="py-2 font-semibold text-gray-900">{formatCurrency(valEst)}</td>
                <td className="py-2 font-semibold text-gray-900">{formatCurrency(valPago)}</td>
                <td className={`py-2 text-right font-bold tabular-nums ${
                  gap != null && gap > 0 ? 'text-red-600' : gap != null && gap < 0 ? 'text-green-600' : 'text-gray-400'
                }`}>
                  {gap != null ? (gap > 0 ? `▲ ${formatCurrency(gap)}` : gap < 0 ? `▼ ${formatCurrency(Math.abs(gap))}` : '—') : '—'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
