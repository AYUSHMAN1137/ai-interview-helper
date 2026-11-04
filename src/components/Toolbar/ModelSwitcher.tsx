import React from 'react'
import { useStore } from '../../store'
import type { AnswerMode } from '../../../electron/modelStrategy'
import './ModelSwitcher.css'

const MODES: { id: AnswerMode; label: string; icon: string; title: string }[] = [
  { id: 'auto', label: 'Auto', icon: '✨', title: 'Smart: picks tier based on question' },
  { id: 'instant', label: 'Instant', icon: '⚡', title: 'gpt-oss-20b — fastest answers' },
  { id: 'balanced', label: 'Balanced', icon: '⚖️', title: 'qwen3.8-27b — technical answers' },
  { id: 'deep', label: 'Deep', icon: '🧠', title: 'gpt-oss-120b — best for coding/system design' },
]

/**
 * Compact model-tier switcher for the toolbar.
 * Auto (✨) = smart local selection; others force a fixed tier.
 */
const ModelSwitcher: React.FC = () => {
  const { answerMode, setAnswerMode } = useStore()

  const handleSelect = (mode: AnswerMode) => {
    setAnswerMode(mode)
    if (window.electronAPI) {
      window.electronAPI.saveSettings({ answerMode: mode }).catch(() => {})
    }
  }

  return (
    <div className="model-switcher" title="Answer model tier">
      {MODES.map((m) => (
        <button
          key={m.id}
          className={`model-chip${answerMode === m.id ? ' model-chip--active' : ''}`}
          onClick={() => handleSelect(m.id)}
          title={m.title}
          aria-pressed={answerMode === m.id}
        >
          <span className="model-chip-icon">{m.icon}</span>
          <span className="model-chip-label">{m.label}</span>
        </button>
      ))}
    </div>
  )
}

export default ModelSwitcher
