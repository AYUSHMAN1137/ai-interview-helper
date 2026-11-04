import React from 'react'
import ScreenshotButton from './ScreenshotButton'
import StatusIndicator from './StatusIndicator'
import MicButton from './MicButton'
import ModelSwitcher from './ModelSwitcher'
import { useStore } from '../../store'
import './Toolbar.css'

const Toolbar: React.FC = () => {
  const {
    openSettings,
    refreshSession,
    isDetectingQuestions,
    opacity,
    setOpacity,
    currentView,
    setCurrentView,
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
      {/* Row 1: utility buttons + status */}
      <div className="toolbar-row toolbar-row-1">
        <div className="toolbar-left">
          <button
            className={`btn ${currentView === 'history' ? 'btn-primary' : ''}`}
            onClick={() => setCurrentView(currentView === 'history' ? 'live' : 'history')}
            title={currentView === 'history' ? 'Return to Live interview overlay' : 'View past interview question sessions'}
          >
            {currentView === 'history' ? '← Live' : '📜 History'}
          </button>
          <button className="btn" onClick={openSettings} title="Open Settings">
            Settings
          </button>
          <button
            className="btn"
            onClick={handleClipboard}
            title="Extract question from Clipboard (Shortcut: Alt+C or Ctrl+Shift+C)"
          >
            <span>Clipboard</span>
            <kbd className="btn-shortcut">Alt+C</kbd>
          </button>
          <ScreenshotButton />
          <button
            className="btn btn-green"
            onClick={handleRefresh}
            title="Reset current live session (Shortcut: Alt+R or Ctrl+Shift+R)"
          >
            <span>Refresh</span>
            <kbd className="btn-shortcut">Alt+R</kbd>
          </button>
          {isDetectingQuestions && (
            <span className="detecting-text">detecting questions</span>
          )}
        </div>
        <div className="toolbar-center">
          <ModelSwitcher />
          <StatusIndicator />
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
              Opacity: <kbd className="opacity-kbd">Ctrl+↑</kbd> / <kbd className="opacity-kbd">Ctrl+↓</kbd>
            </span>
          </div>
        </div>
        <div className="toolbar-row-2-right">
          <MicButton />
          <button
            className="btn btn-large"
            onClick={handleMinimize}
            title="Hide overlay (Shortcut: Alt+H or Ctrl+Shift+H to toggle show/hide)"
          >
            <span>Hide</span>
            <kbd className="btn-shortcut">Alt+H</kbd>
          </button>
          <button className="btn btn-large btn-exit" onClick={handleClose} title="Exit application">
            Exit
          </button>
        </div>
      </div>
    </div>
  )
}

export default Toolbar
