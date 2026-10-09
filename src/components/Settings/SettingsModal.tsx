import React, { useState, useEffect } from 'react'
import { useStore } from '../../store'
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
  const [localModel, setLocalModel] = useState(model || 'openai/gpt-oss-120b')
  const [localOpacity, setLocalOpacity] = useState(opacity || 0.88)

  useEffect(() => {
    setLocalResume(resume)
    setLocalOpenaiKey(openaiApiKey)
    setLocalDeepgramKey(deepgramApiKey)
    setLocalModel(model || 'openai/gpt-oss-120b')
    setLocalOpacity(opacity || 0.88)
  }, [resume, openaiApiKey, deepgramApiKey, model, opacity])

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
    setOpacity(localOpacity)

    if (window.electronAPI) {
      await window.electronAPI.saveSettings({
        resume: localResume,
        openaiApiKey: localOpenaiKey,
        deepgramApiKey: localDeepgramKey,
        model: localModel,
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

        {/* AI Model Selection */}
        <div className="settings-section">
          <label className="settings-label">AI Model</label>
          <select
            className="settings-select"
            value={localModel}
            onChange={(e) => setLocalModel(e.target.value)}
          >
            {AVAILABLE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
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
