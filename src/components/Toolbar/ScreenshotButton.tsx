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
      className="btn btn-green"
      onClick={handleClick}
      disabled={isScanning}
      title="Capture screen & extract question (Shortcut: Alt+S or Ctrl+Shift+P)"
      style={{ opacity: isScanning ? 0.7 : 1 }}
    >
      {isScanning ? (
        'Scanning...'
      ) : (
        <>
          <span>Screenshot</span>
          <kbd className="btn-shortcut">Alt+S</kbd>
        </>
      )}
    </button>
  )
}

export default ScreenshotButton
