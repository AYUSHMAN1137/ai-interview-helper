import React, { useEffect, useState } from 'react'
import { useStore } from '../../store'

const UsageTimer: React.FC = () => {
  const { formattedUsage } = useStore()
  const [sessionTime, setSessionTime] = useState('0h 0m')

  useEffect(() => {
    const startTime = Date.now()
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 60000)
      const h = Math.floor(elapsed / 60)
      const m = elapsed % 60
      setSessionTime(`${h}h ${m}m`)
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  // Use IPC-provided time if available, else local timer
  const displayTime = formattedUsage !== '0h 0m' ? formattedUsage : sessionTime

  return (
    <span className="usage-timer">
      {displayTime}
    </span>
  )
}

export default UsageTimer
