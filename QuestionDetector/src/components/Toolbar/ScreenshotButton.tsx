import React from 'react'
import { useStore } from '../../store'

const ScreenshotButton: React.FC = () => {
  const { isScanning, setScanning } = useStore()

  const handleClick = async () => {
    if (isScanning) return
    setScanning(true)
    
    if (window.electronAPI) {
      try {
        await window.electronAPI.triggerScreenshot()
      } catch (err) {
        console.error('Screenshot error:', err)
      }
    }
    // Scanning state will be reset by IPC callback
  }

  return (
    <button
      className={`btn btn-green`}
      onClick={handleClick}
      disabled={isScanning}
      style={{ opacity: isScanning ? 0.7 : 1 }}
    >
      {isScanning ? 'Scanning...' : 'Screenshot'}
    </button>
  )
}

export default ScreenshotButton
