import { useEffect, useRef } from 'react'

/**
 * Web Audio API microphone capture.
 * Uses Chromium's built-in getUserMedia — no SoX, no native modules needed.
 * Captures 16kHz mono PCM and streams chunks to main process via IPC.
 */
export function useMicCapture() {
  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)

  const startCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream

      // Create AudioContext at 16kHz for Deepgram
      const context = new AudioContext({ sampleRate: 16000 })
      if (context.state === 'suspended') {
        await context.resume()
      }
      contextRef.current = context

      const source = context.createMediaStreamSource(stream)

      // ScriptProcessor for capturing raw PCM (bufferSize = 4096)
      const processor = context.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      // Mute gain node so microphone doesn't echo into speakers and cause Windows driver clamp
      const muteGain = context.createGain()
      muteGain.gain.value = 0

      processor.onaudioprocess = (e) => {
        const float32 = e.inputBuffer.getChannelData(0)
        // Convert Float32 → Int16 PCM
        const int16 = new Int16Array(float32.length)
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]))
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }
        // Send to main process
        if (window.electronAPI) {
          window.electronAPI.sendMicAudio(int16.buffer)
        }
      }

      source.connect(processor)
      processor.connect(muteGain)
      muteGain.connect(context.destination)
      console.log('Web Audio mic capture started (16kHz, feedback isolated)')
    } catch (err) {
      console.error('Mic capture failed:', err)
    }
  }

  const stopCapture = () => {
    processorRef.current?.disconnect()
    processorRef.current = null
    contextRef.current?.close()
    contextRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    console.log('Web Audio mic capture stopped')
  }

  useEffect(() => {
    if (!window.electronAPI) return

    window.electronAPI.onStartMicCapture(() => {
      startCapture()
    })
    window.electronAPI.onStopMicCapture(() => {
      stopCapture()
    })

    return () => {
      stopCapture()
      window.electronAPI.removeAllListeners('start-mic-capture')
      window.electronAPI.removeAllListeners('stop-mic-capture')
    }
  }, [])
}
