import React, { useState, useEffect } from 'react'
import { useStore } from '../../store'
import './Settings.css'

const SettingsModal: React.FC = () => {
  const {
    resume,
    openaiApiKey,
    deepgramApiKey,
    setResume,
    setOpenaiApiKey,
    setDeepgramApiKey,
    closeSettings,
  } = useStore()

  const [localResume, setLocalResume] = useState(resume)
  const [localOpenaiKey, setLocalOpenaiKey] = useState(openaiApiKey)
  const [localDeepgramKey, setLocalDeepgramKey] = useState(deepgramApiKey)

  useEffect(() => {
    setLocalResume(resume)
    setLocalOpenaiKey(openaiApiKey)
    setLocalDeepgramKey(deepgramApiKey)
  }, [resume, openaiApiKey, deepgramApiKey])

  const handleSave = async () => {
    setResume(localResume)
    setOpenaiApiKey(localOpenaiKey)
    setDeepgramApiKey(localDeepgramKey)

    if (window.electronAPI) {
      await window.electronAPI.saveSettings({
        resume: localResume,
        openaiApiKey: localOpenaiKey,
        deepgramApiKey: localDeepgramKey,
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
        <h2 className="modal-title">Settings — Resume</h2>

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
            Paste your resume here. The answering engine uses it to respond as you.
          </label>
          <textarea
            className="settings-textarea"
            value={localResume}
            onChange={(e) => setLocalResume(e.target.value)}
            placeholder="Paste your resume text here..."
            rows={10}
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
