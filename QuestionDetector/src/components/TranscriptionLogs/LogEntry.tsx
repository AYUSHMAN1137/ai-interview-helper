import React from 'react'
import { TranscriptEntry } from '../../types/question'

interface LogEntryProps {
  entry: TranscriptEntry
}

const LogEntry: React.FC<LogEntryProps> = ({ entry }) => {
  return (
    <div className={`log-entry log-entry--${entry.speaker.toLowerCase()}`}>
      <span className="log-speaker">{entry.speaker}:</span>
      <span className="log-text">{entry.text}</span>
    </div>
  )
}

export default LogEntry
