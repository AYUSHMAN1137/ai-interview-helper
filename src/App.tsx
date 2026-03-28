import React, { useEffect } from 'react'
import QuestionsPanel from './components/QuestionsPanel/QuestionsPanel'
import AnswerPanel from './components/AnswerPanel/AnswerPanel'
import TranscriptionLogs from './components/TranscriptionLogs/TranscriptionLogs'
import Toolbar from './components/Toolbar/Toolbar'
import SettingsModal from './components/Settings/SettingsModal'
import { useStore } from './store'
import { useMicCapture } from './hooks/useMicCapture'
import './App.css'

const App: React.FC = () => {
  // Web Audio mic capture (no SoX needed)
  useMicCapture()
  const {
    settingsOpen,
    addQuestion,
    updateQuestionAnswer,
    addTranscriptEntry,
    updateUsage,
    setScanning,
    setDetectingQuestions,
    setStatus,
    setScanningMessage,
    setMicOn,
    setSpeakerOn,
    setResume,
    setOpenaiApiKey,
    setDeepgramApiKey,
    refreshSession,
  } = useStore()

  useEffect(() => {
    if (!window.electronAPI) return

    // Load settings on mount
    window.electronAPI.loadSettings().then((settings: any) => {
      if (settings) {
        if (settings.resume) setResume(settings.resume)
        if (settings.openaiApiKey) setOpenaiApiKey(settings.openaiApiKey)
        if (settings.deepgramApiKey) setDeepgramApiKey(settings.deepgramApiKey)
      }
    }).catch(() => {})

    // Load initial usage
    window.electronAPI.getUsage().then((usage: any) => {
      if (usage) {
        updateUsage(usage.usedMinutes, usage.formattedUsed)
      }
    }).catch(() => {})

    // Listen for new questions from main process
    window.electronAPI.onNewQuestion((data: any) => {
      addQuestion(data.question)
    })

    // Listen for answer stream chunks
    window.electronAPI.onAnswerChunk((data: any) => {
      updateQuestionAnswer(data.questionId, data.chunk, data.isDone)
    })

    // Listen for transcript entries
    window.electronAPI.onTranscriptEntry((data: any) => {
      addTranscriptEntry(data)
    })

    // Listen for usage updates
    window.electronAPI.onUsageUpdate((data: any) => {
      updateUsage(data.usedMinutes, data.formattedUsed)
    })

    // Listen for scanning status
    window.electronAPI.onScanningStatus((data: any) => {
      switch (data.status) {
        case 'started':
          setScanning(true)
          setDetectingQuestions(true)
          setStatus('Scanning...')
          setScanningMessage('Screenshot saved — processing...')
          break
        case 'processing':
          setStatus('detecting questions')
          break
        case 'done':
          setScanning(false)
          setDetectingQuestions(false)
          setStatus('Ready')
          setScanningMessage('')
          break
        case 'error':
          setScanning(false)
          setDetectingQuestions(false)
          setStatus('Ready')
          setScanningMessage(data.message || 'Error')
          setTimeout(() => setScanningMessage(''), 3000)
          break
      }
    })

    // Listen for hotkey events from main process
    window.electronAPI.onHotkeyMicToggle((data: any) => {
      setMicOn(data.on)
    })
    window.electronAPI.onHotkeySpeakerToggle((data: any) => {
      setSpeakerOn(data.on)
    })
    window.electronAPI.onHotkeyScreenshot(() => {
      window.electronAPI.triggerScreenshot()
    })
    window.electronAPI.onHotkeyClipboard(() => {
      window.electronAPI.triggerClipboard()
    })
    window.electronAPI.onHotkeyRefresh(() => {
      refreshSession()
      window.electronAPI.refreshSession()
    })

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeAllListeners('new-question')
        window.electronAPI.removeAllListeners('answer-stream-chunk')
        window.electronAPI.removeAllListeners('transcript-entry')
        window.electronAPI.removeAllListeners('usage-update')
        window.electronAPI.removeAllListeners('scanning-status')
        window.electronAPI.removeAllListeners('hotkey-mic-toggle')
        window.electronAPI.removeAllListeners('hotkey-speaker-toggle')
        window.electronAPI.removeAllListeners('hotkey-screenshot')
        window.electronAPI.removeAllListeners('hotkey-clipboard')
        window.electronAPI.removeAllListeners('hotkey-refresh')
      }
    }
  }, [])

  return (
    <div className="app-container">
      <div className="drag-handle" />
      <div className="panels-container">
        <QuestionsPanel />
        <div className="panel-divider" />
        <AnswerPanel />
      </div>
      <TranscriptionLogs />
      <Toolbar />
      {settingsOpen && <SettingsModal />}
    </div>
  )
}

export default App
