import React from 'react'
import { useStore } from '../../store'

const MicButton: React.FC = () => {
  const { isMicOn, setMicOn } = useStore()

  const handleToggle = async () => {
    const newState = !isMicOn
    setMicOn(newState)
    if (window.electronAPI) {
      const result = await window.electronAPI.toggleMic(newState)
      setMicOn(result.on ?? newState)
    }
  }

  return (
    <button
      className={`toggle-btn ${isMicOn ? 'toggle-btn--on' : 'toggle-btn--off'}`}
      onClick={handleToggle}
      title="Toggle candidate mic (Shortcut: Alt+M or Ctrl+Shift+M)"
    >
      <span>Mic {isMicOn ? 'ON' : 'OFF'}</span>
      <kbd className="btn-shortcut">Alt+M</kbd>
    </button>
  )
}

export default MicButton
