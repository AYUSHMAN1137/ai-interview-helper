import React, { useRef, useEffect } from 'react'
import LogEntry from './LogEntry'
import { useStore } from '../../store'
import './TranscriptionLogs.css'

const TranscriptionLogs: React.FC = () => {
  const { transcriptEntries } = useStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Auto-scroll to latest entry
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [transcriptEntries])

  const handleSendLast = async () => {
    if (window.electronAPI) {
      await window.electronAPI.triggerSendLastTranscript()
    }
  }

  return (
    <div className="transcription-logs">
      <div className="transcription-header-row">
        <span className="transcription-header-title">Transcription Logs</span>
        <button
          className="btn-send-last-transcript"
          onClick={handleSendLast}
          title="Send the last transcribed speech as a question to generate answers (Shortcut: Alt+Enter)"
        >
          <span>Ask Last</span>
          <kbd className="btn-shortcut">Alt+Enter</kbd>
        </button>
      </div>
      <div className="transcription-content" ref={scrollRef}>
        {transcriptEntries.length === 0 ? (
          <div className="placeholder-text">
            Live transcription will appear here...
          </div>
        ) : (
          transcriptEntries.map((entry) => (
            <LogEntry key={entry.id} entry={entry} />
          ))
        )}
      </div>
    </div>
  )
}

export default TranscriptionLogs
