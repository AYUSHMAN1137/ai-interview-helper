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

  return (
    <div className="transcription-logs">
      <div className="transcription-header">Transcription Logs</div>
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
