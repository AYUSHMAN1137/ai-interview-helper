import React from 'react'
import { useStore } from '../../store'

const StatusIndicator: React.FC = () => {
  const { status, scanningMessage } = useStore()

  return (
    <div className="status-indicator">
      <span className={`status-text ${status !== 'Ready' ? 'status-active' : ''}`}>
        {status}
      </span>
      {scanningMessage && (
        <span className="status-message">{scanningMessage}</span>
      )}
    </div>
  )
}

export default StatusIndicator
