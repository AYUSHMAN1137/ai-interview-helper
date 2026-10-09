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
    opacity,
    setOpacity,
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

  const handleIncreaseOpacity = async () => {
    const newOp = Math.min(1.0, Math.round((opacity + 0.05) * 100) / 100)
    setOpacity(newOp)
    if (window.electronAPI) {
      await window.electronAPI.setOpacity(newOp)
    }
  }

  const handleDecreaseOpacity = async () => {
    const newOp = Math.max(0.20, Math.round((opacity - 0.05) * 100) / 100)
    setOpacity(newOp)
    if (window.electronAPI) {
      await window.electronAPI.setOpacity(newOp)
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

      {/* Row 2: opacity hint (left) + audio controls & window controls (right) */}
      <div className="toolbar-row toolbar-row-2">
        <div className="toolbar-row-2-left">
          <div className="opacity-controller-bar" title="Press Ctrl+Up to increase, Ctrl+Down to decrease opacity">
            <span className="opacity-badge">
              <span className="opacity-dot" />
              <span className="opacity-val">{Math.round(opacity * 100)}%</span>
            </span>
            <div className="opacity-steppers">
              <button className="opacity-step-btn" onClick={handleDecreaseOpacity} title="Decrease Opacity (Ctrl+↓)">−</button>
              <button className="opacity-step-btn" onClick={handleIncreaseOpacity} title="Increase Opacity (Ctrl+↑)">+</button>
            </div>
            <span className="opacity-instruction">
              To control opacity, press <kbd className="opacity-kbd">Ctrl+↑</kbd> / <kbd className="opacity-kbd">Ctrl+↓</kbd>
            </span>
          </div>
        </div>
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
