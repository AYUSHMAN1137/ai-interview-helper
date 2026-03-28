import React from 'react'
import ScreenshotButton from './ScreenshotButton'
import StatusIndicator from './StatusIndicator'
import UsageTimer from './UsageTimer'
import MicButton from './MicButton'
import SpeakerButton from './SpeakerButton'
import { useStore } from '../../store'
import './Toolbar.css'

const Toolbar: React.FC = () => {
  const {
    openSettings,
    refreshSession,
    isDetectingQuestions,
    scanningMessage,
  } = useStore()

  const handleClipboard = async () => {
    if (window.electronAPI) {
      await window.electronAPI.triggerClipboard()
    }
  }

  const handleRefresh = () => {
    refreshSession()
    if (window.electronAPI) {
      window.electronAPI.refreshSession()
    }
  }

  const handleMinimize = () => {
    if (window.electronAPI) {
      window.electronAPI.minimizeWindow()
    }
  }

  const handleClose = () => {
    if (window.electronAPI) {
      window.electronAPI.closeWindow()
    }
  }

  return (
    <div className="toolbar">
      {/* Row 1: utility buttons + status + timer */}
      <div className="toolbar-row toolbar-row-1">
        <div className="toolbar-left">
          <button className="btn" onClick={openSettings}>
            Settings
          </button>
          <button className="btn" onClick={handleClipboard}>
            Clipboard
          </button>
          <ScreenshotButton />
          <button className="btn btn-green" onClick={handleRefresh}>
            Refresh
          </button>
          {isDetectingQuestions && (
            <span className="detecting-text">detecting questions</span>
          )}
        </div>
        <div className="toolbar-center">
          <StatusIndicator />
        </div>
        <div className="toolbar-right">
          <UsageTimer />
        </div>
      </div>

      {/* Row 2: audio controls + window controls (larger buttons) */}
      <div className="toolbar-row toolbar-row-2">
        <div className="toolbar-row-2-right">
          <MicButton />
          <SpeakerButton />
          <button className="btn btn-large" onClick={handleMinimize} title="Hide to tray (Ctrl+Shift+H to restore)">
            Hide
          </button>
          <button className="btn btn-large btn-exit" onClick={handleClose} title="Exit">
            Exit
          </button>
        </div>
      </div>
    </div>
  )
}

export default Toolbar
