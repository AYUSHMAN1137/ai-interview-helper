import React from 'react'
import { useStore } from '../../store'

const SpeakerButton: React.FC = () => {
  const { isSpeakerOn, setSpeakerOn } = useStore()

  const handleToggle = async () => {
    const newState = !isSpeakerOn
    setSpeakerOn(newState)
    if (window.electronAPI) {
      const result = await window.electronAPI.toggleSpeaker(newState)
      // Use actual state returned by main process
      setSpeakerOn(result.on ?? newState)
    }
  }

  return (
    <button
      className={`toggle-btn ${isSpeakerOn ? 'toggle-btn--on' : 'toggle-btn--off'}`}
      onClick={handleToggle}
    >
      Spk {isSpeakerOn ? 'ON' : 'OFF'}
    </button>
  )
}

export default SpeakerButton
