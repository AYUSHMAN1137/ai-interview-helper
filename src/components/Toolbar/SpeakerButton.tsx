import React from 'react'
import { useStore } from '../../store'

const SpeakerButton: React.FC = () => {
  const { isSpeakerOn, setSpeakerOn } = useStore()

  const handleToggle = async () => {
    const newState = !isSpeakerOn
    setSpeakerOn(newState)
    if (window.electronAPI) {
      const result = await window.electronAPI.toggleSpeaker(newState)
      setSpeakerOn(result.on ?? newState)
    }
  }

  return (
    <button
      className={`toggle-btn ${isSpeakerOn ? 'toggle-btn--on' : 'toggle-btn--off'}`}
      onClick={handleToggle}
      title="Toggle interviewer audio (Shortcut: Ctrl+Shift+S)"
    >
      <span>Spk {isSpeakerOn ? 'ON' : 'OFF'}</span>
      <kbd className="btn-shortcut">Ctrl+Shift+S</kbd>
    </button>
  )
}

export default SpeakerButton
