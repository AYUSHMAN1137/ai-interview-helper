import React from 'react'
import { useStore } from '../../store'

const MicButton: React.FC = () => {
  const { isMicOn, setMicOn } = useStore()

  const handleToggle = async () => {
    const newState = !isMicOn
    setMicOn(newState)
    if (window.electronAPI) {
      const result = await window.electronAPI.toggleMic(newState)
      // Use actual state returned by main process
      setMicOn(result.on ?? newState)
    }
  }

  return (
    <button
      className={`toggle-btn ${isMicOn ? 'toggle-btn--on' : 'toggle-btn--off'}`}
      onClick={handleToggle}
    >
      Mic {isMicOn ? 'ON' : 'OFF'}
    </button>
  )
}

export default MicButton
