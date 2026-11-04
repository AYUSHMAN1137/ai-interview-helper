import React, { useState, useEffect } from 'react'
import { useStore } from '../../store'
import type { AnswerMode } from '../../../electron/modelStrategy'
import './Settings.css'

const AVAILABLE_MODELS = [
  { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B (Best Quality & Technical Coding)' },
  { id: 'qwen/qwen3.8-27b', label: 'Qwen 3.8 27B (Ultra Fast — 200ms Instant Answers)' },
  { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B (Fast & Balanced)' },
]

const SettingsModal: React.FC = () => {
  const {
    resume,
    openaiApiKey,
    deepgramApiKey,
    model,
    answerMode,
    setAnswerMode,
    opacity,
    setResume,
    setOpenaiApiKey,
    setDeepgramApiKey,
    setModel,
    setOpacity,
    closeSettings,
  } = useStore()

  const [localResume, setLocalResume] = useState(resume)
  const [localOpenaiKey, setLocalOpenaiKey] = useState(openaiApiKey)
  const [localDeepgramKey, setLocalDeepgramKey] = useState(deepgramApiKey)
  const [localModel, setLocalModel] = useState(model || 'openai/gpt-oss-20b')
  const [localMode, setLocalMode] = useState<AnswerMode>(answerMode || 'auto')
  const [localOpacity, setLocalOpacity] = useState(opacity || 0.88)

  useEffect(() => {
    setLocalResume(resume)
    setLocalOpenaiKey(openaiApiKey)
    setLocalDeepgramKey(deepgramApiKey)
    setLocalModel(model || 'openai/gpt-oss-20b')
    setLocalMode(answerMode || 'auto')
    setLocalOpacity(opacity || 0.88)
  }, [resume, openaiApiKey, deepgramApiKey, model, answerMode, opacity])

  const handleOpacitySliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setLocalOpacity(val)
    setOpacity(val)
    if (window.electronAPI) {
      window.electronAPI.setOpacity(val)
    }
  }

  const handleSave = async () => {
    setResume(localResume)
    setOpenaiApiKey(localOpenaiKey)
    setDeepgramApiKey(localDeepgramKey)
    setModel(localModel)
    setAnswerMode(localMode)
    setOpacity(localOpacity)

    if (window.electronAPI) {
      await window.electronAPI.saveSettings({
        resume: localResume,
        openaiApiKey: localOpenaiKey,
        deepgramApiKey: localDeepgramKey,
        model: localModel,
        answerMode: localMode,
        windowOpacity: localOpacity,
      })
    }

    closeSettings()
  }

  const handleCancel = () => {
    closeSettings()
  }

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Settings — AI & Assistant Controls</h2>

        {/* Answer Model Mode */}
        <div className="settings-section">
          <label className="settings-label">Answer Model Mode</label>
          <select
            className="settings-select"
            value={localMode}
            onChange={(e) => setLocalMode(e.target.value as AnswerMode)}
          >
            <option value="auto">✨ Auto (smart — recommended)</option>
            <option value="instant">⚡ Instant (gpt-oss-20b — fastest)</option>
            <option value="balanced">⚖️ Balanced (qwen3.8-27b — technical)</option>
            <option value="deep">🧠 Deep (gpt-oss-120b — coding/system design)</option>
          </select>
          <p className="settings-hint">
            Auto picks per question: conceptual → Instant, technical → Balanced, screenshots → Deep.
          </p>
        </div>

        {/* Window Opacity Controller */}
        <div className="settings-section">
          <div className="settings-label-row">
            <label className="settings-label">Window Opacity: {Math.round(localOpacity * 100)}%</label>
            <span className="settings-hint">Shortcut: Ctrl+↑ / Ctrl+↓</span>
          </div>
          <input
            type="range"
            min="0.2"
            max="1.0"
            step="0.05"
            className="settings-slider"
            value={localOpacity}
            onChange={handleOpacitySliderChange}
          />
        </div>

        {/* API Keys Section */}
        <div className="settings-section">
          <label className="settings-label">Groq API Key</label>
          <input
            type="password"
            className="settings-input"
            value={localOpenaiKey}
            onChange={(e) => setLocalOpenaiKey(e.target.value)}
            placeholder="gsk_..."
          />
        </div>

        <div className="settings-section">
          <label className="settings-label">Deepgram API Key</label>
          <input
            type="password"
            className="settings-input"
            value={localDeepgramKey}
            onChange={(e) => setLocalDeepgramKey(e.target.value)}
            placeholder="Enter Deepgram API key..."
          />
        </div>

        {/* Resume Section */}
        <div className="settings-section">
          <label className="settings-label">
            Candidate Resume (The engine speaks in first-person based on this):
          </label>
          <textarea
            className="settings-textarea"
            value={localResume}
            onChange={(e) => setLocalResume(e.target.value)}
            placeholder="Paste your resume text here..."
            rows={8}
          />
        </div>

        {/* Buttons */}
        <div className="modal-buttons">
          <button className="btn modal-btn-cancel" onClick={handleCancel}>
            Cancel
          </button>
          <button className="btn modal-btn-save" onClick={handleSave}>
            Save ✓
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
