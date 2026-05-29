'use client'

import { useState, useEffect, useRef } from 'react'
import { SplitView } from '@/components/auditoria/SplitView'
import { TussPanel } from './TussPanel'
import { PatientContext } from './PatientContext'
import { supabase } from '@/lib/supabase'
import { TABLES } from '@/lib/config'
import { useAuth } from '@/contexts/AuthContext'
import type { Correlacao, DecisaoHumana } from '@/lib/types'
import { ChevronDown, ChevronUp, Microscope, Users, FileText, Loader2 } from 'lucide-react'

interface Section {
  id: string
  label: string
  icon: React.ReactNode
}

const SECTIONS: Section[] = [
  { id: 'tuss',     label: 'Análise TUSS',         icon: <Microscope className="w-3.5 h-3.5" /> },
  { id: 'paciente', label: 'Contexto do Atendimento', icon: <Users     className="w-3.5 h-3.5" /> },
  { id: 'notas',    label: 'Notas do Revisor',      icon: <FileText   className="w-3.5 h-3.5" /> },
]

interface DetailPanelProps {
  items: Correlacao[]
  currentIndex: number
  onNavigate: (index: number) => void
  onDecision: (chave: string, decision: DecisaoHumana) => void
  /** Chamado quando o usuário clica num registro do Contexto do Paciente */
  onSelectRelated?: (item: Correlacao) => void
  showFinancial?: boolean
}

export function DetailPanel({
  items, currentIndex, onNavigate, onDecision, onSelectRelated, showFinancial = true,
}: DetailPanelProps) {
  const item = items[currentIndex]
  const { permissions } = useAuth()
  const canEdit = permissions?.canEdit ?? false

  // Seções expansíveis — todas abertas por padrão
  const [open, setOpen] = useState<Record<string, boolean>>({ tuss: true, paciente: true, notas: true })
  const toggle = (id: string) => setOpen(p => ({ ...p, [id]: !p[id] }))

  // Notas do revisor
  const [notes, setNotes] = useState(item?.notas_revisor ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sincroniza notas ao trocar de item
  useEffect(() => {
    setNotes(item?.notas_revisor ?? '')
    setNotesSaved(false)
  }, [item?.id])

  const saveNotes = async (value: string) => {
    if (!item || !canEdit) return
    setSavingNotes(true)
    try {
      await supabase
        .from(TABLES.correlacao)
        .update({ notas_revisor: value || null })
        .eq('id', item.id)
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
    } catch (e) {
      console.error('Erro ao salvar nota:', e)
    } finally {
      setSavingNotes(false)
    }
  }

  const handleNotesChange = (v: string) => {
    setNotes(v)
    setNotesSaved(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => saveNotes(v), 800)
  }

  if (!item) return null

  return (
    <div className="flex flex-col gap-4">

      {/* SplitView existente (confronto PRODUÇÃO x REPASSE + checklist + decisão) */}
      <SplitView
        items={items}
        currentIndex={currentIndex}
        onNavigate={onNavigate}
        onDecision={onDecision}
      />

      {/* Seções expansíveis abaixo */}
      {SECTIONS.map(sec => (
        <div key={sec.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">

          {/* Header da seção */}
          <button
            onClick={() => toggle(sec.id)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              {sec.icon}
              {sec.label}
            </span>
            {open[sec.id]
              ? <ChevronUp   className="w-4 h-4 text-gray-400" />
              : <ChevronDown className="w-4 h-4 text-gray-400" />
            }
          </button>

          {/* Conteúdo */}
          {open[sec.id] && (
            <div className="px-4 pb-4 border-t border-gray-100">

              {sec.id === 'tuss' && (
                <div className="pt-3">
                  <TussPanel item={item} showFinancial={showFinancial} />
                </div>
              )}

              {sec.id === 'paciente' && (
                <div className="pt-3">
                  <PatientContext
                    nrAtendimento={item.NrAtendimento_PRODUCAO}
                    currentChave={item.ChaveCorrelacao}
                    onSelect={r => onSelectRelated?.(r)}
                  />
                </div>
              )}

              {sec.id === 'notas' && (
                <div className="pt-3 flex flex-col gap-2">
                  <textarea
                    value={notes}
                    onChange={e => handleNotesChange(e.target.value)}
                    disabled={!canEdit}
                    placeholder={canEdit ? 'Registre observações sobre este registro…' : 'Sem permissão para editar notas.'}
                    rows={3}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400 placeholder-gray-300"
                  />
                  <div className="flex items-center justify-end gap-2 text-xs text-gray-400 h-4">
                    {savingNotes && (
                      <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Salvando…</span>
                    )}
                    {notesSaved && !savingNotes && (
                      <span className="text-green-600">✓ Salvo</span>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      ))}
    </div>
  )
}
